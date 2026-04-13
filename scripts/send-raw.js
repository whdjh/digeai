// 실행: node scripts/send-raw.js <email> [morning|evening]
//
// Gemini 요약 없이 raw 형식(제목 + source + 날짜 + 원문 링크)으로
// 단일 수신자에게 테스트 발송. 발송 파이프라인(Resend) end-to-end 검증용.
//
// ⚠️ Resend 테스트 모드(MAIL_FROM이 onboarding@resend.dev)에서는
//   Resend 계정 소유자 본인의 인증된 이메일로만 발송 가능.
//   다른 주소로 보내려면 자기 도메인을 Resend에 인증해야 함.
//
// 윈도우 내 기사가 3건 미만이면 "최근 24시간"으로 자동 확장 (테스트라서 충분히 보내야 의미 있음).

import 'dotenv/config'
import { Resend } from 'resend'

import { sources } from '../pipeline/config/sources.js'
import { collectAll } from '../pipeline/sources/index.js'
import { dedup } from '../pipeline/dedup.js'
import { filterNoise } from '../pipeline/lib/filter.js'
import { diversify } from '../pipeline/lib/diversify.js'
import { getSessionWindow } from '../pipeline/lib/window.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const recipient = process.argv[2]
const session = process.argv[3] ?? 'evening'

if (!recipient || !EMAIL_RE.test(recipient)) {
  console.error('사용법: node scripts/send-raw.js <email> [morning|evening]')
  process.exit(1)
}
if (session !== 'morning' && session !== 'evening') {
  console.error('session은 morning 또는 evening만 허용')
  process.exit(1)
}
if (!process.env.RESEND_API_KEY) {
  console.error('[send-raw] RESEND_API_KEY 누락')
  process.exit(1)
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

console.log(`[send-raw] 수집 중... session=${session}`)
const collected = await collectAll(sources)
const deduped = dedup(collected)
const denoised = filterNoise(deduped)
if (denoised.length < deduped.length) {
  console.log(`[send-raw] 노이즈 제거: ${deduped.length - denoised.length}건`)
}
const win = getSessionWindow(session)

const windowArticles = denoised.filter(
  (a) => a.publishedAt >= win.from && a.publishedAt < win.to,
)

let articles
if (windowArticles.length < 3) {
  console.log(
    `[send-raw] 윈도우 내 ${windowArticles.length}건뿐 → 최근 24시간으로 확장 (테스트 모드)`,
  )
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  articles = denoised
    .filter((a) => a.publishedAt >= since)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 20)
} else {
  // 다양성 보장 (source당 cap + 최소 source 수, lookback 72h)
  articles = diversify(windowArticles, denoised)
}

const dist = {}
for (const a of articles) dist[a.source] = (dist[a.source] ?? 0) + 1
console.log(
  `[send-raw] 발송 대상 ${articles.length}건 / source ${Object.keys(dist).length}개`,
)
console.log(
  `           분포: ${Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s}:${c}`).join(', ')}`,
)
if (articles.length === 0) {
  console.error('[send-raw] 발송할 기사가 없음 (수집된 게 너무 옛날)')
  process.exit(1)
}

const itemsHtml = articles
  .map(
    (a, i) => `
<div style="padding:18px 0;${i > 0 ? 'border-top:1px solid #ececf1;' : ''}">
  <a href="${escapeHtml(a.url)}" style="text-decoration:none;color:#1f1d2c;">
    <div style="font-size:16px;font-weight:600;line-height:1.4;color:#1f1d2c;">${escapeHtml(a.title)}</div>
  </a>
  <div style="font-size:12px;color:#7c3aed;margin-top:8px;font-weight:600;">[${escapeHtml(a.source)}] ${a.publishedAt.toISOString().slice(0, 10)}</div>
  <a href="${escapeHtml(a.url)}" style="display:inline-block;font-size:13px;color:#7c3aed;margin-top:6px;text-decoration:none;font-weight:500;">원문 보기 →</a>
</div>`,
  )
  .join('')

const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f6f6f9;font-family:system-ui,-apple-system,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#1f1d2c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="padding:24px 28px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#ffffff;">
  <div style="font-size:13px;opacity:0.85;letter-spacing:0.4px;">⚙️ Smoke test · Gemini 요약 없음</div>
  <div style="font-size:24px;font-weight:700;margin-top:4px;">📰 Digeai</div>
  <div style="font-size:12px;opacity:0.85;margin-top:8px;">${new Date().toISOString().slice(0, 10)} · ${articles.length}건</div>
</td></tr>
<tr><td style="padding:8px 28px 24px;">${itemsHtml}</td></tr>
<tr><td style="padding:20px 28px;background:#fafafb;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #ececf1;line-height:1.6;">
  발송 파이프라인 smoke test 메일입니다.<br />Gemini 요약 없이 수집된 기사 목록만 포함되었습니다.
</td></tr>
</table>
</td></tr></table>
</body></html>`

const resend = new Resend(process.env.RESEND_API_KEY)
// 테스트 스크립트는 항상 Resend 검증된 테스트 도메인 사용 (도메인 인증 안 한 상태에서도 동작).
// 본격 발송은 pipeline/send.js가 MAIL_FROM 환경변수를 사용.
const from = 'Digeai <onboarding@resend.dev>'
const subject = `🧪 [Digeai 테스트] AI 뉴스 ${articles.length}건 (요약 없음)`

const { data, error } = await resend.emails.send({ from, to: recipient, subject, html })
if (error) {
  console.error('[send-raw] 발송 실패:', error.message ?? error)
  console.error(
    '         힌트: from이 onboarding@resend.dev면 Resend 가입 시 등록한 본인 이메일로만 발송 가능',
  )
  process.exit(1)
}

console.log(`[send-raw] ✅ 발송 완료 → ${recipient}`)
console.log(`           from: ${from}`)
console.log(`           subject: ${subject}`)
console.log(`           message id: ${data?.id}`)
