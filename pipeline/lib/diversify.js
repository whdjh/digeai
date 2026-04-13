// 다양성 보장: 한 source가 메일을 도배하지 않도록 + 최소 source 수 확보.
//
// 두 단계:
//   1. 윈도우 내 articles에 source당 최대 N건 cap (perSourceCap)
//   2. cap 후에도 source 종류가 minSources 미만이면, 윈도우 외 직전 lookbackHours에서
//      누락된 source의 최신 글을 source당 1건씩 보충 (PRIORITY_SOURCES 먼저)
//
// 시간대 차이로 한 윈도우에 한 source만 활발한 경우(예: 한국 evening = 미국 새벽)에도
// 다양한 채널 콘텐츠를 사용자에게 전달하기 위함.

// 보충 시 우선순위 — 회사 공식 X 채널이 가장 중요한 신호.
// 영어 회사 채널은 한국 기준 새벽 시간대에 활발해 evening 윈도우에 못 들어오는 일이 잦음.
const PRIORITY_SOURCES = [
  'OpenAI',
  'OpenAI Developers',
  'Google AI',
  'Claude',
  'Claude Code',
]

/**
 * @param {import('./article.js').Article[]} windowArticles - 세션 윈도우 내 기사
 * @param {import('./article.js').Article[]} allArticles    - dedup된 전체 기사 (보충 후보)
 * @param {{ perSourceCap?: number, minSources?: number, lookbackHours?: number }} [options]
 * @returns {import('./article.js').Article[]}  최신순 정렬된 결과
 */
export function diversify(
  windowArticles,
  allArticles,
  { perSourceCap = 5, minSources = 8, lookbackHours = 72 } = {},
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

  // 2단계: source 다양성 부족 시 lookbackHours 안에서 보충
  if (grouped.size < minSources) {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

    // PRIORITY_SOURCES 먼저 채움 — 회사 공식 채널 보장
    for (const priority of PRIORITY_SOURCES) {
      if (grouped.has(priority)) continue
      const candidate = allArticles
        .filter((a) => a.source === priority && a.publishedAt >= since)
        .sort((a, b) => b.publishedAt - a.publishedAt)[0]
      if (candidate) {
        grouped.set(priority, [candidate])
        if (grouped.size >= minSources) break
      }
    }

    // 그래도 부족하면 나머지 source에서 최신순으로 채움
    if (grouped.size < minSources) {
      const have = new Set(grouped.keys())
      const extras = allArticles
        .filter((a) => !have.has(a.source) && a.publishedAt >= since)
        .sort((a, b) => b.publishedAt - a.publishedAt)
      for (const a of extras) {
        if (grouped.has(a.source)) continue
        grouped.set(a.source, [a])
        if (grouped.size >= minSources) break
      }
    }
  }

  // 최신순 정렬해 반환
  return [...grouped.values()].flat().sort((a, b) => b.publishedAt - a.publishedAt)
}
