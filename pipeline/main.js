// 오케스트레이터: --session morning|evening 인자로 한 세션의 발송을 끝까지 책임진다.
//
// 흐름: env 검증 → collect → dedup → 노이즈 필터 → KST 윈도우 → 다양성 →
//       summarize → relevance 필터 → 구독자별 필터·개인화·발송.
// 부분 실패는 격리 (한 source/한 수신자 실패가 전체 파이프라인을 죽이지 않는다).
// 재실행 안전 (Resend idempotencyKey가 같은 세션·같은 날·같은 수신자 중복 발송을 방지).

import 'dotenv/config'
import { parseArgs } from 'node:util'

import { sources } from './config/sources.js'
import { collectAll } from './sources/index.js'
import { dedup } from './dedup.js'
import { filterNoise } from './lib/filter.js'
import { diversify } from './lib/diversify.js'
import { getSessionWindow } from './lib/window.js'
import { summarize } from './summarize.js'
import { renderEmail } from './render.js'
import { getSubscribersWithSources, sendOne } from './send.js'
import { personalize } from './personalize.js'

const REQUIRED_ENV = [
  'GEMINI_API_KEY',
  'RESEND_API_KEY',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
]
const SEND_CONCURRENCY = 5

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`[digeai] 필수 환경변수 누락: ${missing.join(', ')}`)
    process.exit(1)
  }
}

/**
 * 간단 pool — 한 번에 concurrency개씩 worker를 돌린다.
 */
async function pool(items, concurrency, worker) {
  const queue = items.slice()
  async function next() {
    while (queue.length > 0) {
      const item = queue.shift()
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next))
}

async function main() {
  const { values } = parseArgs({
    options: { session: { type: 'string' } },
    allowPositionals: true,
  })
  const session = values.session
  if (session !== 'morning' && session !== 'evening') {
    console.error('[digeai] --session morning|evening 필수')
    process.exit(1)
  }

  validateEnv()

  const startedAt = Date.now()
  const now = new Date()
  console.log(`[digeai] 시작 — session=${session} now=${now.toISOString()}`)

  // 1. 수집
  const collected = await collectAll(sources)
  console.log(`[digeai] 수집 합계: ${collected.length}건`)

  // 2. dedup
  const deduped = dedup(collected)
  console.log(`[digeai] dedup: ${deduped.length}건 (제거 ${collected.length - deduped.length})`)

  // 2.5. 노이즈 필터
  const denoised = filterNoise(deduped)
  if (denoised.length < deduped.length) {
    console.log(`[digeai] 노이즈 제거: ${deduped.length - denoised.length}건`)
  }

  // 3. 세션 윈도우 필터
  const win = getSessionWindow(session, now)
  const filtered = denoised.filter(
    (a) => a.publishedAt >= win.from && a.publishedAt < win.to,
  )
  console.log(
    `[digeai] 세션 윈도우 ${win.from.toISOString()} ~ ${win.to.toISOString()}: ${filtered.length}건`,
  )

  if (filtered.length === 0) {
    console.log(`[digeai] no new articles for ${session} — 발송 생략`)
    return
  }

  // 3.5. 다양성 보장
  const diversified = diversify(filtered, denoised)
  const sourceDist = {}
  for (const a of diversified) sourceDist[a.source] = (sourceDist[a.source] ?? 0) + 1
  console.log(
    `[digeai] diversify: ${diversified.length}건 / source ${Object.keys(sourceDist).length}개 — ${Object.entries(sourceDist).map(([s, c]) => `${s}:${c}`).join(', ')}`,
  )

  // 4. 요약 (공용 1회)
  console.log('[digeai] 요약 호출 중...')
  const summary = await summarize(diversified)
  console.log(`[digeai] 요약 완료: items=${summary.items.length}`)

  // 4.5. engineeringRelevance 필터 (summarize가 점수를 items에 심음)
  const threshold = Number(process.env.RELEVANCE_THRESHOLD ?? 5)
  const beforeFilter = summary.items.length
  const droppedItems = summary.items.filter(
    (it) => Number.isFinite(it.engineeringRelevance) && it.engineeringRelevance < threshold,
  )
  const keptItems = summary.items.filter(
    (it) => !Number.isFinite(it.engineeringRelevance) || it.engineeringRelevance >= threshold,
  )
  if (droppedItems.length > 0) {
    console.log(
      `[digeai] 관련성 필터 (>=${threshold}): ${beforeFilter} → ${keptItems.length}건 (제외 ${droppedItems.length})`,
    )
    for (const it of droppedItems) {
      console.log(`           drop[${it.engineeringRelevance ?? '?'}]: ${it.title}`)
    }
  }

  if (keptItems.length === 0) {
    console.log('[digeai] 관련성 임계값 통과 기사 없음 — 발송 생략')
    return
  }

  // 5. 구독자 조회 (선호 소스 JOIN)
  const recipients = await getSubscribersWithSources()
  console.log(`[digeai] 구독자: ${recipients.length}명`)

  if (recipients.length === 0) {
    console.log('[digeai] 구독자 없음 — 발송 생략')
    return
  }

  // 6. 구독자별 루프 — 필터·개인화·렌더·발송
  let sent = 0
  const failed = []
  const skippedEmpty = []

  await pool(recipients, SEND_CONCURRENCY, async (subscriber) => {
    const myItems = keptItems.filter((it) => subscriber.sourceIds.has(it.sourceId))
    if (myItems.length === 0) {
      skippedEmpty.push(subscriber.email)
      return
    }

    const personalized = await personalize(myItems, subscriber)

    const { subject, html } = renderEmail({
      session,
      date: now,
      items: personalized,
      trend: summary.trend,
    })

    const res = await sendOne({
      to: subscriber.email,
      subject,
      html,
      session,
      date: now,
    })
    if (res.ok) sent++
    else failed.push(subscriber.email)
  })

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[digeai] session=${session} collected=${collected.length} deduped=${deduped.length} window=${filtered.length} summarized=${summary.items.length} kept=${keptItems.length} recipients=${recipients.length} sent=${sent} failed=${failed.length} skippedEmpty=${skippedEmpty.length} elapsed=${elapsed}s`,
  )
  if (skippedEmpty.length > 0) {
    console.log(
      `[digeai] 본인 소스 기사 0건 — 발송 스킵 (${skippedEmpty.length}명)`,
    )
  }
  if (failed.length > 0) {
    console.error(`[digeai] 발송 실패 ${failed.length}건: ${failed.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('[digeai] 치명적 오류:', err)
  process.exit(1)
})
