// 디스패처: source.type → collector 매핑.
// Promise.allSettled로 부분 실패를 격리한다 — 한 source 실패가 전체 파이프라인을 죽이지 않는다.

import * as rss from './rss.js'
import * as rsshub from './rsshub.js'

const collectors = { rss, rsshub }

/**
 * @param {Array<{ type: 'rss'|'rsshub', name: string, url?: string, handle?: string }>} sources
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function collectAll(sources) {
  const results = await Promise.allSettled(
    sources.map((s) => collectors[s.type].fetch(s)),
  )

  const articles = []
  results.forEach((r, i) => {
    const name = sources[i].name
    if (r.status === 'fulfilled') {
      console.log(`[${name}] 수집: ${r.value.length}건`)
      articles.push(...r.value)
    } else {
      const msg = r.reason?.message ?? String(r.reason)
      console.error(`[${name}] 수집 실패: ${msg}`)
    }
  })
  return articles
}
