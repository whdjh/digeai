// GET /api/sources — 구독 UI용 소스 목록.
// pipeline/config/sources.js의 public 필드만 반환 (type/url/handle 등 내부 필드 제외).
// enabled: false 소스는 응답에서 제외.

import { categories, sources } from '../../pipeline/config/sources.js'

const ALLOWED_ORIGINS_BASE = ['http://localhost:8888', 'http://localhost:5173']

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

export default async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const publicSources = sources
    .filter((s) => s.enabled)
    .map(({ id, name, category, description, defaultChecked }) => ({
      id,
      name,
      category,
      description,
      defaultChecked,
    }))

  return new Response(
    JSON.stringify({ categories, sources: publicSources }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        ...cors,
      },
    },
  )
}

export const config = { path: '/api/sources' }
