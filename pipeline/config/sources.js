// 큐레이션된 소스 레지스트리 (단일 진실 공급원).
// 정책: 사용자 명시 11개 (X 8 + 뉴스레터 3) — ADR-0003 참조.
//
// type:
//   - 'rss'    → pipeline/sources/rss.js (url 필드 사용)
//   - 'rsshub' → pipeline/sources/rsshub.js (handle 필드 사용)
//
// X(Twitter) 8개는 RSSHub 경유. 공개 인스턴스(rsshub.app)는 X 차단으로
// 빈 응답이 잦으므로 운영 시 self-host 권장 (docs/runbooks/rsshub-self-host.md).
// `RSSHUB_BASE_URL` 환경변수만 self-host 도메인으로 바꾸면 코드 변경 X.

export const sources = [
  // === X(Twitter) 인플루언서·계정 (RSSHub 경유) ===
  // 회사 공식 계정
  { type: 'rsshub', name: 'OpenAI', handle: 'OpenAI' },
  { type: 'rsshub', name: 'OpenAI Developers', handle: 'OpenAIDevs' },
  { type: 'rsshub', name: 'Google AI', handle: 'GoogleAI' },
  { type: 'rsshub', name: 'Claude', handle: 'claudeai' },
  { type: 'rsshub', name: 'Claude Code', handle: 'claude_code' },
  // 한국 매체
  { type: 'rsshub', name: 'GeekNews', handle: 'GeekNewsHada' },
  // 인플루언서
  { type: 'rsshub', name: 'Lucas', handle: 'lucas_flatwhite' },
  { type: 'rsshub', name: 'Journey', handle: 'atmostbeautiful' },

  // === 뉴스레터 (RSS) ===
  { type: 'rss', name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed' },
  { type: 'rss', name: 'Sandhill (Ali Afridi)', url: 'https://www.sandhill.io/feed' }, // /rss는 404, /feed가 정답 (2026-04-13 검증)
  { type: 'rss', name: 'Chamath', url: 'https://chamath.substack.com/feed' },
]
