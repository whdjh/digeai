// URL 정규화 기반 중복 제거. 같은 기사가 여러 소스에서 들어와도 한 번만 남는다.

import { normalizeUrl } from './lib/url.js'

/**
 * @param {import('./lib/article.js').Article[]} articles
 * @returns {import('./lib/article.js').Article[]}
 */
export function dedup(articles) {
  const seen = new Set()
  const result = []
  for (const article of articles) {
    const key = normalizeUrl(article.url)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(article)
  }
  return result
}
