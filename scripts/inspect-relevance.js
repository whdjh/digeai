// 실행: node scripts/inspect-relevance.js [morning|evening] [threshold]
//
// 정식 파이프라인을 발송 직전까지 돌려 Gemini가 매긴 engineeringRelevance(0~10)
// 점수의 분포와 임계값 통과/탈락 리스트를 출력. 발송은 하지 않음.
//
// 임계값 튜닝용. 기본 임계값 = RELEVANCE_THRESHOLD env 또는 5.

import 'dotenv/config'

import { sources } from '../pipeline/config/sources.js'
import { collectAll } from '../pipeline/sources/index.js'
import { dedup } from '../pipeline/dedup.js'
import { filterNoise } from '../pipeline/lib/filter.js'
import { diversify } from '../pipeline/lib/diversify.js'
import { getSessionWindow } from '../pipeline/lib/window.js'
import { summarize } from '../pipeline/summarize.js'

const session = process.argv[2] ?? 'evening'
const threshold = Number(process.argv[3] ?? process.env.RELEVANCE_THRESHOLD ?? 5)

if (session !== 'morning' && session !== 'evening') {
  console.error('사용법: node scripts/inspect-relevance.js [morning|evening] [threshold]')
  process.exit(1)
}
if (!process.env.GEMINI_API_KEY) {
  console.error('[inspect-relevance] GEMINI_API_KEY 누락')
  process.exit(1)
}

console.log(`\n[inspect-relevance] session=${session}, threshold=${threshold}\n`)

const collected = await collectAll(sources)
const deduped = dedup(collected)
const denoised = filterNoise(deduped)
const win = getSessionWindow(session)
const windowArticles = denoised.filter(
  (a) => a.publishedAt >= win.from && a.publishedAt < win.to,
)

let articles
if (windowArticles.length < 3) {
  console.log(
    `[inspect-relevance] 윈도우 내 ${windowArticles.length}건뿐 → 최근 24시간으로 확장 (테스트)`,
  )
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  articles = denoised
    .filter((a) => a.publishedAt >= since)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 20)
} else {
  articles = diversify(windowArticles, denoised)
}

if (articles.length === 0) {
  console.error('[inspect-relevance] 채점할 기사 없음')
  process.exit(1)
}

console.log(`[inspect-relevance] 채점 대상 ${articles.length}건 → Gemini 호출 중...`)
const summary = await summarize(articles)

// 점수 분포
const histogram = new Array(11).fill(0)
let unscored = 0
for (const it of summary.items) {
  if (Number.isFinite(it.engineeringRelevance)) {
    const s = Math.max(0, Math.min(10, it.engineeringRelevance))
    histogram[s]++
  } else {
    unscored++
  }
}

console.log('\n=== engineeringRelevance 분포 ===')
for (let s = 10; s >= 0; s--) {
  if (histogram[s] === 0) continue
  const bar = '█'.repeat(histogram[s])
  const mark = s >= threshold ? '✓' : '✗'
  console.log(`  ${mark} ${String(s).padStart(2)}: ${bar} (${histogram[s]})`)
}
if (unscored > 0) console.log(`  ? --: 점수 누락 ${unscored}건 (통과 처리됨)`)

// 통과/탈락 리스트
const sorted = [...summary.items].sort(
  (a, b) => (b.engineeringRelevance ?? 0) - (a.engineeringRelevance ?? 0),
)
const kept = sorted.filter(
  (it) => !Number.isFinite(it.engineeringRelevance) || it.engineeringRelevance >= threshold,
)
const dropped = sorted.filter(
  (it) => Number.isFinite(it.engineeringRelevance) && it.engineeringRelevance < threshold,
)

console.log(`\n=== ✓ 통과 (>=${threshold}) — ${kept.length}건 ===`)
kept.forEach((it, i) => {
  const score = Number.isFinite(it.engineeringRelevance) ? it.engineeringRelevance : '?'
  console.log(`  ${String(i + 1).padStart(2)}. [${score}] ${it.title}`)
  console.log(`      ${it.summary}`)
})

console.log(`\n=== ✗ 탈락 (<${threshold}) — ${dropped.length}건 ===`)
dropped.forEach((it, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. [${it.engineeringRelevance}] ${it.title}`)
  console.log(`      ${it.summary}`)
})

console.log(`\n[inspect-relevance] trend: ${summary.trend}`)
console.log(
  `\n[inspect-relevance] 합계: 채점 ${summary.items.length} / 통과 ${kept.length} / 탈락 ${dropped.length}`,
)
console.log(
  `[inspect-relevance] 임계값을 바꾸려면: node scripts/inspect-relevance.js ${session} <threshold>`,
)
