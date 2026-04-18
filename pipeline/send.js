// Resend로 발송. getSubscribersWithSources는 이메일 + 선호 소스 JOIN 조회.
// sendOne은 1명 발송 단위 — 호출부(main.js)가 구독자별 루프·pool을 관리한다.
// idempotencyKey로 같은 세션·같은 날·같은 수신자 중복 발송 방지.

import { Resend } from 'resend'
import { createClient } from '@libsql/client'

const FROM_DEFAULT = 'Digeai <onboarding@resend.dev>'

// KST 기준 YYYYMMDD (idempotencyKey 안정성을 위해 KST 기준 고정)
function kstDateKey(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(date).replaceAll('-', '')
}

/**
 * 구독자별 선호 소스 JOIN 조회.
 * @returns {Promise<Array<{ email: string, sourceIds: Set<string> }>>}
 */
export async function getSubscribersWithSources() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 누락')
  }
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  try {
    const result = await client.execute(`
      SELECT s.email, ss.source_id
      FROM subscribers s
      LEFT JOIN subscriber_sources ss ON s.id = ss.subscriber_id
      ORDER BY s.id
    `)
    const byEmail = new Map()
    for (const row of result.rows) {
      const email = String(row.email)
      if (!byEmail.has(email)) byEmail.set(email, new Set())
      if (row.source_id != null) byEmail.get(email).add(String(row.source_id))
    }
    return [...byEmail.entries()].map(([email, sourceIds]) => ({ email, sourceIds }))
  } finally {
    client.close()
  }
}

const resendInstance = (() => {
  let cached = null
  return () => {
    if (!cached) {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY 누락')
      cached = new Resend(process.env.RESEND_API_KEY)
    }
    return cached
  }
})()

/**
 * 한 명에게 발송. idempotencyKey로 세션·날짜·수신자 단위 중복 발송 방지.
 * @param {{ to: string, subject: string, html: string, session: 'morning'|'evening', date: Date }} args
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendOne({ to, subject, html, session, date }) {
  const resend = resendInstance()
  const from = process.env.MAIL_FROM ?? FROM_DEFAULT
  const dateKey = kstDateKey(date)
  try {
    const { error } = await resend.emails.send(
      { from, to, subject, html },
      { idempotencyKey: `digeai/${session}/${dateKey}/${to}` },
    )
    if (error) {
      console.error(`[${to}] 발송 실패:`, error.message ?? error)
      return { ok: false, error: error.message ?? String(error) }
    }
    return { ok: true }
  } catch (err) {
    console.error(`[${to}] 발송 예외:`, err.message ?? err)
    return { ok: false, error: err.message ?? String(err) }
  }
}
