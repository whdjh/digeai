// 실행: node scripts/inspect-collect.js [morning|evening]
//
// 수집 → dedup → 윈도우 필터 결과를 콘솔에 보여준다.
// AI 관련성 확인을 위해 윈도우 외 최근 기사 샘플 10건도 표시.
// 발송이나 외부 API 호출(Gemini/Resend) 없음 — 수집 검증 전용.

import 'dotenv/config'

import { sources } from '../pipeline/config/sources.js'
import { collectAll } from '../pipeline/sources/index.js'
import { dedup } from '../pipeline/dedup.js'
import { getSessionWindow } from '../pipeline/lib/window.js'

const session = process.argv[2] ?? 'evening'
if (session !== 'morning' && session !== 'evening') {
  console.error('사용법: node scripts/inspect-collect.js [morning|evening]')
  process.exit(1)
}

console.log(`\n[inspect] session=${session} 수집 시작...\n`)
const collected = await collectAll(sources)

// source별 카운트
const bySource = {}
for (const a of collected) bySource[a.source] = (bySource[a.source] ?? 0) + 1

const deduped = dedup(collected)
const win = getSessionWindow(session)
const filtered = deduped
  .filter((a) => a.publishedAt >= win.from && a.publishedAt < win.to)
  .sort((a, b) => b.publishedAt - a.publishedAt)

console.log('\n=== source별 수집 카운트 ===')
for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(5)}건  ${s}`)
}

console.log('\n=== 합계 ===')
console.log(`  수집:   ${collected.length}건`)
console.log(`  dedup:  ${deduped.length}건 (제거 ${collected.length - deduped.length})`)
console.log(`  윈도우: ${filtered.length}건  (${win.from.toISOString()} ~ ${win.to.toISOString()})`)

console.log('\n=== 윈도우 내 기사 (실 발송 대상) ===')
if (filtered.length === 0) {
  console.log('  (없음)')
} else {
  filtered.forEach((a, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${a.source}] ${a.title}`)
    console.log(`      ${a.publishedAt.toISOString()}  ${a.url}`)
  })
}

console.log('\n=== 최근 기사 샘플 10건 (윈도우 외, AI 관련성 확인용) ===')
const recent = deduped
  .filter((a) => a.publishedAt < win.from)
  .sort((a, b) => b.publishedAt - a.publishedAt)
  .slice(0, 10)
recent.forEach((a, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. [${a.source}] ${a.title}`)
  console.log(`      ${a.publishedAt.toISOString()}`)
})

console.log('\n[inspect] 완료. 발송하려면: node scripts/send-raw.js <email>')
