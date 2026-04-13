// 큐레이션된 뉴스 소스 레지스트리 (단일 진실 공급원).
// 새 소스 추가는 이 파일만 수정하면 된다.
//
// type:
//   - 'rss'    → pipeline/sources/rss.js (url 필드 사용)
//   - 'rsshub' → pipeline/sources/rsshub.js (handle 필드 사용)
//
// TODO 표시된 URL은 첫 실행 시 실제 응답을 확인하고 필요 시 RSSHub 라우트로 대체.

export const sources = [
  // 회사 공식
  // Anthropic: 공식 RSS 미제공 (rss.xml/feed/index.xml 등 5개 후보 모두 404, 2026-04-13 검증).
  //   대안: RSSHub 라우트(/anthropic 계열)가 생기면 활성화하거나, 별도 스크래퍼 작성.
  // { type: 'rss', name: 'Anthropic', url: '...' },
  { type: 'rss', name: 'OpenAI', url: 'https://openai.com/news/rss.xml' }, // 모든 카테고리(연구/제품/회사) 통합 피드 — 양 많음, 윈도우 필터로 자연 축소
  { type: 'rss', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },

  // AI 매체
  { type: 'rss', name: 'GeekNews', url: 'https://feeds.feedburner.com/geeknews-feed' },

  // 뉴스레터
  { type: 'rss', name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed' },
  { type: 'rss', name: 'Chamath', url: 'https://chamath.substack.com/feed' },
  { type: 'rss', name: 'Sandhill', url: 'https://www.sandhill.io/feed' }, // /rss는 404, /feed가 정답 (2026-04-13 검증)

  // X 인플루언서 (RSSHub 경유)
  // 공개 인스턴스(rsshub.app)는 X 차단으로 자주 빈 응답. 격리되어 전체 파이프라인은 안전.
  // 안정성 필요하면 docs/runbooks/rsshub-down.md 참조 (셀프 호스팅).
  { type: 'rsshub', name: 'Lucas', handle: 'lucas_flatwhite' },
  { type: 'rsshub', name: 'Journey', handle: 'atmostbeautiful' },
]
