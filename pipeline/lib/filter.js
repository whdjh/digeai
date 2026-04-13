// 소스별 노이즈 필터. 큐레이션된 source라도 자체 홍보·봇 트윗 등 사용자에게
// 가치 없는 글이 섞일 수 있으므로 source-specific 패턴으로 제거한다.
//
// 일반 RT(리트윗)는 정보 가치 있을 수 있으므로 유지. self-promo만 제거.

const NOISE_RULES = {
  GeekNews: [
    /RT\s+GeekNewsBot/i, // 자기 봇 RT
    /GeekBadge|긱배지/i, // 자체 홍보
    /긱뉴스에\s+.*기능이\s+추가/, // 기능 출시 자가 발표
    /news\.hada\.io\/geekbadge/i, // 광고 링크
  ],
}

/**
 * @param {import('./article.js').Article} article
 * @returns {boolean} true = 노이즈, 제외해야 함
 */
function isNoise(article) {
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
