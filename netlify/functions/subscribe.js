// POST /api/subscribe — 구독자 이메일 + 선호 소스 등록.
// Netlify Functions v2 (Web Request/Response API).
//
// 보안:
//   - Origin 화이트리스트 기반 CORS
//   - IP당 1분 5회 rate limit (in-memory; cold start마다 리셋 OK)
//   - raw error/스택 응답 노출 금지 (CLAUDE.md 보안 섹션)
//   - 매 요청마다 DB 클라이언트 init + finally close (CLAUDE.md 컨벤션)

import { createClient } from '@libsql/client'
import { sources as sourceRegistry } from '../../pipeline/config/sources.js'

const ALLOWED_ORIGINS_BASE = ['http://localhost:8888', 'http://localhost:5173']
const RATE_LIMIT = { max: 5, windowMs: 60_000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_CAPACITY = 45
const MAX_SOURCE_IDS = 50   // sanity — 현재 20개 + 여유

function getCapacity() {
  const raw = Number(process.env.MAX_SUBSCRIBERS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CAPACITY
}

// 모듈 스코프 in-memory rate limit map. cold start마다 리셋.
const rateLimitMap = new Map()

function getAllowedOrigins() {
  const list = [...ALLOWED_ORIGINS_BASE]
  if (process.env.PUBLIC_SITE_URL) list.push(process.env.PUBLIC_SITE_URL)
  return list
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && getAllowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function getClientIp(req, context) {
  if (context?.ip) return context.ip
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT.windowMs) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT.max) return false
  entry.count++
  return true
}

function maskEmail(email) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '[invalid]'
  const head = local.slice(0, 2)
  return `${head}***@${domain}`
}

function isUniqueViolation(err) {
  const msg = err?.message ?? String(err ?? '')
  const code = err?.code ?? ''
  return /UNIQUE/i.test(msg) || /SQLITE_CONSTRAINT/i.test(msg) || /SQLITE_CONSTRAINT/i.test(code)
}

// enabled=true인 sources.js id 집합. 요청 검증용.
// 모듈 스코프 — cold start 1회 계산, sourceRegistry가 런타임 불변이라 안전.
const VALID_SOURCE_IDS = new Set(
  sourceRegistry.filter((s) => s.enabled).map((s) => s.id),
)

export default async (req, context) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  const ip = getClientIp(req, context)
  if (!checkRateLimit(ip)) {
    return jsonResponse(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      429,
      cors,
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: '올바른 요청이 아닙니다.' }, 400, cors)
  }

  // 이메일 검증
  const raw = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const local = raw.split('@')[0] ?? ''
  if (!raw || !EMAIL_RE.test(raw) || raw.length > 254 || local.length > 64) {
    return jsonResponse({ error: '올바른 이메일 주소를 입력해주세요.' }, 400, cors)
  }

  // source_ids 검증
  const rawIds = body?.source_ids
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return jsonResponse(
      { error: '구독할 소스를 최소 1개 이상 선택해주세요.' },
      400,
      cors,
    )
  }
  if (rawIds.length > MAX_SOURCE_IDS) {
    return jsonResponse({ error: '선택한 소스가 너무 많습니다.' }, 400, cors)
  }

  const uniqueIds = [
    ...new Set(
      rawIds
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
  ]
  if (uniqueIds.length === 0) {
    return jsonResponse(
      { error: '구독할 소스를 최소 1개 이상 선택해주세요.' },
      400,
      cors,
    )
  }
  const invalid = uniqueIds.filter((id) => !VALID_SOURCE_IDS.has(id))
  if (invalid.length > 0) {
    console.error('[subscribe] 알 수 없는 source_id:', { ip, invalid })
    return jsonResponse({ error: '선택한 소스가 올바르지 않습니다.' }, 400, cors)
  }

  // DB env
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('[subscribe] TURSO env 누락', {
      ip,
      ts: new Date().toISOString(),
    })
    return jsonResponse(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      500,
      cors,
    )
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  try {
    const capacity = getCapacity()
    const countRes = await client.execute('SELECT COUNT(*) AS count FROM subscribers')
    const rawCount = countRes.rows?.[0]?.count
    const currentCount =
      typeof rawCount === 'bigint' ? Number(rawCount) : Number(rawCount ?? 0)
    if (currentCount >= capacity) {
      return jsonResponse(
        { error: '현재 구독자가 모두 찼습니다. 다음 기회를 기다려주세요.' },
        403,
        cors,
      )
    }

    // 트랜잭션: subscribers INSERT → subscriber_sources INSERT × N
    const tx = await client.transaction('write')
    try {
      const insertRes = await tx.execute({
        sql: 'INSERT INTO subscribers(email) VALUES (?)',
        args: [raw],
      })
      const subscriberId = insertRes.lastInsertRowid
      if (subscriberId == null) {
        throw new Error('subscribers INSERT lastInsertRowid 없음')
      }
      const sidNum = typeof subscriberId === 'bigint' ? Number(subscriberId) : subscriberId

      for (const sid of uniqueIds) {
        await tx.execute({
          sql: 'INSERT INTO subscriber_sources(subscriber_id, source_id) VALUES (?, ?)',
          args: [sidNum, sid],
        })
      }

      await tx.commit()
    } catch (err) {
      await tx.rollback()
      throw err
    }

    console.log(
      `[subscribe] 신규 구독: ${maskEmail(raw)} sources=${uniqueIds.length} ip=${ip} (${currentCount + 1}/${capacity})`,
    )
    return jsonResponse({ message: '구독이 완료되었습니다.' }, 201, cors)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonResponse({ error: '이미 구독 중인 이메일입니다.' }, 409, cors)
    }
    console.error('[subscribe] DB 오류:', {
      ip,
      ts: new Date().toISOString(),
      msg: err?.message ?? String(err),
    })
    return jsonResponse(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      500,
      cors,
    )
  } finally {
    client.close()
  }
}

export const config = { path: '/api/subscribe' }
