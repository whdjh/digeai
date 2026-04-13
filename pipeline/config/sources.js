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
  { type: 'rss', name: 'Anthropic', url: 'https://www.anthropic.com/news/rss.xml' }, // TODO: 첫 실행 시 URL 응답 검증
  { type: 'rss', name: 'OpenAI', url: 'https://openai.com/news/rss.xml' }, // TODO: 첫 실행 시 URL 응답 검증
  { type: 'rss', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },

  // AI 매체
  { type: 'rss', name: 'GeekNews', url: 'https://feeds.feedburner.com/geeknews-feed' },

  // 뉴스레터
  { type: 'rss', name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed' },
  { type: 'rss', name: 'Chamath', url: 'https://chamath.substack.com/feed' },
  { type: 'rss', name: 'Sandhill', url: 'https://www.sandhill.io/rss' }, // TODO: 첫 실행 시 URL 응답 검증

  // X 인플루언서 (RSSHub 경유)
  { type: 'rsshub', name: 'Lucas', handle: 'lucas_flatwhite' },
  { type: 'rsshub', name: 'Journey', handle: 'atmostbeautiful' },
]
