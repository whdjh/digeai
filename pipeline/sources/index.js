// 디스패처: source.type → collector 매핑.
// enabled=true 소스만 수집. Promise.allSettled로 부분 실패를 격리한다.

import * as rss from './rss.js'
import * as rsshub from './rsshub.js'

const collectors = { rss, rsshub }

/**
 * @param {Array<{ type: string, id: string, name: string, url?: string, handle?: string, enabled: boolean }>} sources
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function collectAll(sources) {
  const active = sources.filter((s) => s.enabled)
  if (active.length < sources.length) {
    const skipped = sources.length - active.length
    console.log(`[digeai] ${skipped}개 소스 disabled — 수집 스킵`)
  }

  const results = await Promise.allSettled(
    active.map((s) => collectors[s.type].fetch(s)),
  )

  const articles = []
  results.forEach((r, i) => {
    const name = active[i].name
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
