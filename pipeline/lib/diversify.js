// 다양성 보장: 한 source가 메일을 도배하지 않도록 + 최소 source 수 확보.
//
// 두 단계:
//   1. 윈도우 내 articles에 source당 최대 N건 cap (perSourceCap)
//   2. cap 후에도 source 종류가 minSources 미만이면, 윈도우 외 직전 24h에서
//      누락된 source의 최신 글을 source당 1건씩 보충
//
// 시간대 차이로 한 윈도우에 한 source만 활발한 경우(예: 한국 evening = 미국 새벽)에도
// 다양한 채널 콘텐츠를 사용자에게 전달하기 위함.

/**
 * @param {import('./article.js').Article[]} windowArticles - 세션 윈도우 내 기사
 * @param {import('./article.js').Article[]} allArticles    - dedup된 전체 기사 (보충 후보)
 * @param {{ perSourceCap?: number, minSources?: number, lookbackHours?: number }} [options]
 * @returns {import('./article.js').Article[]}  최신순 정렬된 결과
 */
export function diversify(
  windowArticles,
  allArticles,
  { perSourceCap = 5, minSources = 4, lookbackHours = 24 } = {},
) {
  // 1단계: source당 cap 적용 (최신순 내림차순으로 cap 채우기)
  const sortedWindow = [...windowArticles].sort(
    (a, b) => b.publishedAt - a.publishedAt,
  )
  const grouped = new Map()
  for (const a of sortedWindow) {
    const list = grouped.get(a.source) ?? []
    if (list.length < perSourceCap) {
      list.push(a)
      grouped.set(a.source, list)
    }
  }

  // 2단계: source 다양성 부족 시 윈도우 외 24h에서 보충 (source당 1건)
  if (grouped.size < minSources) {
    const have = new Set(grouped.keys())
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
    const extras = allArticles
      .filter((a) => !have.has(a.source) && a.publishedAt >= since)
      .sort((a, b) => b.publishedAt - a.publishedAt)

    for (const a of extras) {
      if (grouped.has(a.source)) continue
      grouped.set(a.source, [a])
      if (grouped.size >= minSources) break
    }
  }

  // 최신순 정렬해 반환
  return [...grouped.values()].flat().sort((a, b) => b.publishedAt - a.publishedAt)
}
