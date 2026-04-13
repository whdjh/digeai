// 일반 RSS 피드 수집기. rss-parser 사용.
// retry로 감싸 최대 3회 재시도, 최종 실패는 호출부(sources/index.js)가 흡수.

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

const parser = new Parser({ timeout: 15000 })

/**
 * @param {{ name: string, url: string }} source
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function fetch(source) {
  const feed = await retry(() => parser.parseURL(source.url), { retries: 3 })
  return (feed.items ?? [])
    .map((item) => normalizeArticle(item, { name: source.name, type: 'rss' }))
    .filter(Boolean)
}
