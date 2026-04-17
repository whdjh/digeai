// 요약 결과를 이메일 HTML로 렌더. 단순 placeholder 치환만 (별도 템플릿 엔진 X).
// 모든 동적 텍스트는 escapeHtml로 이스케이프.
// 날짜 포맷은 항상 KST 기준으로 표시 (Intl.DateTimeFormat with Asia/Seoul).

import fs from 'node:fs'

const TEMPLATE = fs.readFileSync(
  new URL('./templates/email.html', import.meta.url),
  'utf-8',
)

const SESSION_META = {
  morning: { label: '오전' },
  evening: { label: '오후' },
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// KST 기준 'YYYY.MM.DD' 포맷
function formatKstDate(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = fmt.format(date).split('-')
  return `${y}.${m}.${d}`
}

/**
 * @param {Object} args
 * @param {'morning'|'evening'} args.session
 * @param {Date} args.date
 * @param {import('./summarize.js').SummarizedItem[]} args.items
 * @param {string} args.trend
 * @returns {{ subject: string, html: string }}
 */
export function renderEmail({ session, date, items, trend }) {
  const meta = SESSION_META[session]
  if (!meta) throw new Error(`알 수 없는 세션: ${session}`)

  const dateStr = formatKstDate(date)
  const subject = `[Digeai] ${dateStr} ${meta.label} - AI 뉴스 ${items.length}건`

  const itemsHtml = items
    .map(
      (item, i) => `
<div style="padding:18px 0;${i > 0 ? 'border-top:1px solid #ececf1;' : ''}">
  <a href="${escapeHtml(item.url)}" style="text-decoration:none;color:#1f1d2c;">
    <div style="font-size:16px;font-weight:600;line-height:1.4;color:#1f1d2c;">${escapeHtml(item.title)}</div>
  </a>
  <div style="font-size:14px;color:#52525b;margin-top:8px;line-height:1.55;">${escapeHtml(item.summary)}</div>
  <a href="${escapeHtml(item.url)}" style="display:inline-block;font-size:13px;color:#7c3aed;margin-top:10px;text-decoration:none;font-weight:500;">원문 보기 →</a>
</div>`,
    )
    .join('')

  const html = TEMPLATE.replaceAll('{{subject_text}}', escapeHtml(subject))
    .replaceAll('{{session_label}}', `${meta.emoji} ${meta.label} 발송`)
    .replaceAll('{{date}}', dateStr)
    .replaceAll('{{count}}', String(items.length))
    .replaceAll('{{trend}}', escapeHtml(trend))
    .replaceAll('{{items_html}}', itemsHtml)

  return { subject, html }
}
