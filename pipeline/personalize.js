// 유료 전환 훅. MVP는 identity — 들어온 items를 그대로 반환.
// 유료 전환 시 이 함수 내부에서 subscriber.plan === 'pro' 체크 후
// 구독자 맞춤 Gemini 호출로 개인화 요약·트렌드를 만든다.

/**
 * @param {Array<import('./lib/article.js').Article & { summary?: string, engineeringRelevance?: number }>} items
 * @param {{ email: string, sourceIds: Set<string> }} subscriber
 * @returns {typeof items}
 */
export function personalize(items, subscriber) {
  // subscriber 매개변수는 현재 미사용이지만, 유료 전환 시 시그니처 유지를 위해 유지.
  void subscriber
  return items
}
