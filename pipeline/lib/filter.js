// 노이즈 필터. 큐레이션된 source라도 자체 홍보·봇 트윗·URL only 리트윗 등
// 사용자에게 가치 없는 글이 섞일 수 있으므로 두 단계로 제거.
//
//   1. 글로벌 패턴: 모든 source에 적용 (URL only RT 등)
//   2. source-specific: 특정 source의 자체 홍보 패턴

// source-specific 노이즈 패턴
const NOISE_RULES = {
  GeekNews: [
    /RT\s+GeekNewsBot/i, // 자기 봇 RT
    /GeekBadge|긱배지/i, // 자체 홍보
    /긱뉴스에\s+.*기능이\s+추가/, // 기능 출시 자가 발표
    /news\.hada\.io\/geekbadge/i, // 광고 링크
  ],
}

const MIN_MEANINGFUL_TEXT = 30

/**
 * URL과 RT 헤더 제거 후 의미 있는 텍스트가 너무 짧으면 노이즈로 판정.
 * 예: "RT Nick: http://x.com/i/article/..." → URL/RT 헤더 제거 후 ""
 */
function isShortUrlOnly(title) {
  const noUrl = title
    .replace(/https?:\/\/\S+/g, '') // URL 제거
    .replace(/^RT\s+[^:]+:\s*/i, '') // "RT [Name]: " prefix 제거
    .trim()
  return noUrl.length < MIN_MEANINGFUL_TEXT
}

/**
 * @param {import('./article.js').Article} article
 * @returns {boolean} true = 노이즈, 제외해야 함
 */
function isNoise(article) {
  // 글로벌: URL only RT/포스트
  if (isShortUrlOnly(article.title)) return true
  // source-specific
  const rules = NOISE_RULES[article.source]
  if (!rules) return false
  return rules.some((re) => re.test(article.title))
}

/**
 * @param {import('./article.js').Article[]} articles
 * @returns {import('./article.js').Article[]}
 */
export function filterNoise(articles) {
  return articles.filter((a) => !isNoise(a))
}
