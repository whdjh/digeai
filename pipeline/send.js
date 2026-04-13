// Resend로 구독자 전체에게 발송. idempotencyKey로 같은 세션·같은 날·같은 수신자 중복 발송 방지.
// 동시성 제한(5)으로 rate limit 회피.
// 한 명 실패가 전체를 죽이지 않도록 격리 (failed 배열에 누적).

import { Resend } from 'resend'
import { createClient } from '@libsql/client'

const FROM_DEFAULT = 'Digeai <onboarding@resend.dev>'
const CONCURRENCY = 5

/**
 * @template T,R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function pool(items, concurrency, worker) {
  const queue = items.slice()
  const results = []
  async function next() {
    while (queue.length > 0) {
      const item = queue.shift()
      results.push(await worker(item))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next))
  return results
}

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
 * 구독자 이메일 목록 조회.
 * @returns {Promise<string[]>}
 */
export async function getSubscribers() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 누락')
  }
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  try {
    const result = await client.execute('SELECT email FROM subscribers')
    return result.rows.map((r) => String(r.email))
  } finally {
    client.close()
  }
}

/**
 * @param {Object} args
 * @param {string} args.subject
 * @param {string} args.html
 * @param {string[]} args.recipients
 * @param {'morning'|'evening'} args.session
 * @param {Date} args.date
 * @returns {Promise<{ sent: number, failed: string[] }>}
 */
export async function sendNewsletter({ subject, html, recipients, session, date }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY 누락')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.MAIL_FROM ?? FROM_DEFAULT
  const dateKey = kstDateKey(date)

  const failed = []
  let sent = 0

  await pool(recipients, CONCURRENCY, async (email) => {
    try {
      const { error } = await resend.emails.send(
        { from, to: email, subject, html },
        { idempotencyKey: `digeai/${session}/${dateKey}/${email}` },
      )
      if (error) {
        failed.push(email)
        console.error(`[${email}] 발송 실패:`, error.message ?? error)
      } else {
        sent++
      }
    } catch (err) {
      failed.push(email)
      console.error(`[${email}] 발송 예외:`, err.message ?? err)
    }
  })

  return { sent, failed }
}
