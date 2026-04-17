// 큐레이션된 소스 레지스트리 (단일 진실 공급원).
//
// type:
//   - 'rss'    → pipeline/sources/rss.js (url 필드 사용)
//   - 'rsshub' → pipeline/sources/rsshub.js (handle 필드 사용)
//
// RSSHUB_BASE_URL 환경변수로 self-hosted RSSHub 인스턴스를 지정한다.

export const sources = [
  // === X (Twitter) via RSSHub self-host ===
  { type: 'rsshub', name: 'Lucas',              handle: 'lucas_flatwhite' },
  { type: 'rsshub', name: 'GeekNews',           handle: 'GeekNewsHada' },
  { type: 'rsshub', name: 'Claude',             handle: 'claudeai' },
  { type: 'rsshub', name: 'Claude Code',        handle: 'claude_code' },
  { type: 'rsshub', name: 'Google AI',          handle: 'GoogleAI' },
  { type: 'rsshub', name: 'OpenAI',             handle: 'OpenAI' },
  { type: 'rsshub', name: 'OpenAI Developers',  handle: 'OpenAIDevs' },
  { type: 'rsshub', name: 'Journey',            handle: 'atmostbeautiful' },

  // === 뉴스레터 (RSS) ===
  { type: 'rss', name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed' },
  { type: 'rss', name: 'Sandhill (Ali Afridi)', url: 'https://www.sandhill.io/feed' },
  { type: 'rss', name: 'Chamath', url: 'https://chamath.substack.com/feed' },
]
