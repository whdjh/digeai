// 오케스트레이터: --session morning|evening 인자로 한 세션의 발송을 끝까지 책임진다.
//
// 흐름: env 검증 → collect → dedup → KST 윈도우 필터 → summarize → render → 구독자 조회 → send.
// 부분 실패는 격리 (한 source/한 수신자 실패가 전체 파이프라인을 죽이지 않는다).
// 재실행 안전 (Resend idempotencyKey가 같은 세션·같은 날·같은 수신자 중복 발송을 방지).

import 'dotenv/config'
import { parseArgs } from 'node:util'

import { sources } from './config/sources.js'
import { collectAll } from './sources/index.js'
import { dedup } from './dedup.js'
import { summarize } from './summarize.js'
import { renderEmail } from './render.js'
import { sendNewsletter, getSubscribers } from './send.js'

const REQUIRED_ENV = [
  'GEMINI_API_KEY',
  'RESEND_API_KEY',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
]

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`[digeai] 필수 환경변수 누락: ${missing.join(', ')}`)
    process.exit(1)
  }
}

// 세션 윈도우 (KST 기준):
//   morning : 어제 17:00 KST ~ 오늘 08:00 KST
//   evening : 오늘 08:00 KST ~ 오늘 17:00 KST
//
// KST = UTC+9. 'KST의 X시'를 UTC ms로 변환: Date.UTC(KST_y, KST_m, KST_d + offset, X) - 9h.
function getSessionWindow(session, now = new Date()) {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  const y = kstNow.getUTCFullYear()
  const m = kstNow.getUTCMonth()
  const d = kstNow.getUTCDate()

  const kstHourToUtc = (offsetDays, hour) =>
    Date.UTC(y, m, d + offsetDays, hour) - KST_OFFSET_MS

  if (session === 'morning') {
    return { from: new Date(kstHourToUtc(-1, 17)), to: new Date(kstHourToUtc(0, 8)) }
  }
  return { from: new Date(kstHourToUtc(0, 8)), to: new Date(kstHourToUtc(0, 17)) }
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

  // 1. 수집 (각 source 실패는 격리)
  const collected = await collectAll(sources)
  console.log(`[digeai] 수집 합계: ${collected.length}건`)

  // 2. dedup (정규화된 URL 기준)
  const deduped = dedup(collected)
  console.log(`[digeai] dedup: ${deduped.length}건 (제거 ${collected.length - deduped.length})`)

  // 3. 세션 윈도우 필터
  const win = getSessionWindow(session, now)
  const filtered = deduped.filter(
    (a) => a.publishedAt >= win.from && a.publishedAt < win.to,
  )
  console.log(
    `[digeai] 세션 윈도우 ${win.from.toISOString()} ~ ${win.to.toISOString()}: ${filtered.length}건`,
  )

  if (filtered.length === 0) {
    console.log(`[digeai] no new articles for ${session} — 발송 생략`)
    return
  }

  // 4. 요약 (Gemini 구조화 JSON)
  console.log('[digeai] 요약 호출 중...')
  const summary = await summarize(filtered)
  console.log(`[digeai] 요약 완료: items=${summary.items.length}`)

  // 5. 렌더
  const { subject, html } = renderEmail({
    session,
    date: now,
    items: summary.items,
    trend: summary.trend,
  })

  // 6. 구독자 조회
  const recipients = await getSubscribers()
  console.log(`[digeai] 구독자: ${recipients.length}명`)

  if (recipients.length === 0) {
    console.log('[digeai] 구독자 없음 — 발송 생략')
    return
  }

  // 7. 발송
  const { sent, failed } = await sendNewsletter({
    subject,
    html,
    recipients,
    session,
    date: now,
  })

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[digeai] session=${session} collected=${collected.length} deduped=${deduped.length} window=${filtered.length} summarized=${summary.items.length} sent=${sent} failed=${failed.length} elapsed=${elapsed}s`,
  )
  if (failed.length > 0) {
    console.error(`[digeai] 발송 실패 ${failed.length}건: ${failed.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('[digeai] 치명적 오류:', err)
  process.exit(1)
})
