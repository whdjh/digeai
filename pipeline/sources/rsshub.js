// X(Twitter) / Threads 등 RSSHub 라우트 수집.
// base URL은 환경변수 RSSHUB_BASE_URL로 교체 가능.
// source.route로 라우트 경로를 명시하고, 없으면 기본값 'twitter/user' (하위 호환).

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

const parser = new Parser({
  timeout: 15000,
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
