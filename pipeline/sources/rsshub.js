// X(Twitter) / Threads 등 RSSHub 라우트 수집.
// base URL은 환경변수 RSSHUB_BASE_URL로 교체 가능.
// source.route로 라우트 경로를 명시하고, 없으면 기본값 'twitter/user' (하위 호환).

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

// rsshub.app 공개 인스턴스는 업스트림(특히 X/Twitter) 지연이 잦아 15s 로는 잦은 timeout.
// 30s 로 상향 — retry 3회 × 30s 가 병렬 실행이라 전체 파이프라인 영향은 ~90s.
const parser = new Parser({
  timeout: 30000,
  headers: { 'User-Agent': 'digeai-bot/1.0 (+https://digeai.com)' },
})
const BASE_URL = (process.env.RSSHUB_BASE_URL ?? 'https://rsshub.app').replace(/\/$/, '')
const ACCESS_KEY = process.env.RSSHUB_ACCESS_KEY ?? ''

/**
 * @param {{ id: string, name: string, handle: string, route?: string }} source
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function fetch(source) {
  const route = source.route ?? 'twitter/user'
  const url = `${BASE_URL}/${route}/${source.handle}${ACCESS_KEY ? `?key=${ACCESS_KEY}` : ''}`
  const feed = await retry(() => parser.parseURL(url), { retries: 3 })
  return (feed.items ?? [])
    .map((item) => normalizeArticle(item, { id: source.id, name: source.name, type: 'rsshub' }))
    .filter(Boolean)
}
