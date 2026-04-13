// POST /api/subscribe — 구독자 이메일 등록.
// Netlify Functions v2 (Web Request/Response API).
//
// 보안:
//   - Origin 화이트리스트 기반 CORS
//   - IP당 1분 5회 rate limit (in-memory; cold start마다 리셋 OK)
//   - raw error/스택 응답 노출 금지 (CLAUDE.md 보안 섹션)
//   - 매 요청마다 DB 클라이언트 init + finally close (CLAUDE.md 컨벤션)

import { createClient } from '@libsql/client'

const ALLOWED_ORIGINS_BASE = ['http://localhost:8888', 'http://localhost:5173']
const RATE_LIMIT = { max: 5, windowMs: 60_000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

export default async (req, context) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  // Rate limit (cheap → 가장 먼저)
  const ip = getClientIp(req, context)
  if (!checkRateLimit(ip)) {
    return jsonResponse(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      429,
      cors,
    )
  }

  // Parse body
  let body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: '올바른 이메일 주소를 입력해주세요.' }, 400, cors)
  }

  // Validate email
  const raw = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const local = raw.split('@')[0] ?? ''
  if (!raw || !EMAIL_RE.test(raw) || raw.length > 254 || local.length > 64) {
    return jsonResponse({ error: '올바른 이메일 주소를 입력해주세요.' }, 400, cors)
  }

  // DB env check
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
    await client.execute({
      sql: 'INSERT INTO subscribers(email) VALUES (?)',
      args: [raw],
    })
    console.log(`[subscribe] 신규 구독: ${maskEmail(raw)} ip=${ip}`)
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
