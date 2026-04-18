/**
 * @typedef {Object} Article
 * @property {string} sourceId           - sources.js의 id (구독자별 필터링 키)
 * @property {string} source             - sources.js의 name (UI 표시용)
 * @property {'rss'|'rsshub'} sourceType
 * @property {string} title
 * @property {string} url
 * @property {Date} publishedAt
 * @property {string} [content]          - 옵셔널, 요약 품질용
 */

/**
 * rss-parser item을 Article로 정규화. 필수 필드(title/url) 누락이거나
 * 날짜 파싱 실패하면 null 반환 (호출부에서 filter(Boolean)으로 걸러진다).
 *
 * @param {Object} raw - rss-parser item
 * @param {{ id: string, name: string, type: 'rss'|'rsshub' }} source
 * @returns {Article|null}
 */
export function normalizeArticle(raw, source) {
  const title = (raw.title ?? '').trim()
  const url = (raw.link ?? raw.guid ?? '').trim()
  if (!title || !url) return null

  const pubStr = raw.isoDate ?? raw.pubDate
  const publishedAt = pubStr ? new Date(pubStr) : new Date()
  if (Number.isNaN(publishedAt.getTime())) return null

  return {
    sourceId: source.id,
    source: source.name,
    sourceType: source.type,
    title,
    url,
    publishedAt,
    content: raw.contentSnippet ?? raw.content ?? undefined,
  }
}
