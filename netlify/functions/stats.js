// GET /api/stats — 구독자 수 + 정원 조회 (프론트에서 "32/45명" 표시용).
// Netlify Functions v2 (Web Request/Response API).
//
// MAX_SUBSCRIBERS 환경변수로 정원 지정. 미설정 시 45.

import { createClient } from '@libsql/client'

const ALLOWED_ORIGINS_BASE = ['http://localhost:8888', 'http://localhost:5173']
const DEFAULT_CAPACITY = 45

function getAllowedOrigins() {
  const list = [...ALLOWED_ORIGINS_BASE]
  if (process.env.PUBLIC_SITE_URL) list.push(process.env.PUBLIC_SITE_URL)
  return list
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function getCapacity() {
  const raw = Number(process.env.MAX_SUBSCRIBERS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CAPACITY
}

export default async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  const capacity = getCapacity()

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('[stats] TURSO env 누락')
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
    const res = await client.execute('SELECT COUNT(*) AS count FROM subscribers')
    const rawCount = res.rows?.[0]?.count
    const count = typeof rawCount === 'bigint' ? Number(rawCount) : Number(rawCount ?? 0)
    return jsonResponse(
      { count, capacity, full: count >= capacity },
      200,
      { ...cors, 'Cache-Control': 'public, max-age=10' },
    )
  } catch (err) {
    console.error('[stats] DB 오류:', {
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

export const config = { path: '/api/stats' }
