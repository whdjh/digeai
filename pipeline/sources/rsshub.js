// X(Twitter) 핸들을 RSSHub 경유로 수집.
// base URL은 환경변수 RSSHUB_BASE_URL로 교체 가능 (공개 인스턴스 불안정 시 self-host로 이전).

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

const parser = new Parser({ timeout: 15000 })
const BASE_URL = (process.env.RSSHUB_BASE_URL ?? 'https://rsshub.app').replace(/\/$/, '')
const ACCESS_KEY = process.env.RSSHUB_ACCESS_KEY ?? ''

/**
 * @param {{ name: string, handle: string }} source
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function fetch(source) {
  const url = `${BASE_URL}/twitter/user/${source.handle}${ACCESS_KEY ? `?key=${ACCESS_KEY}` : ''}`
  const feed = await retry(() => parser.parseURL(url), { retries: 3 })
  return (feed.items ?? [])
    .map((item) => normalizeArticle(item, { name: source.name, type: 'rsshub' }))
    .filter(Boolean)
}
