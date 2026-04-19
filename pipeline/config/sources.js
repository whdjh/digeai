// 큐레이션된 소스 레지스트리 — 단일 진실 공급원 (수집 + UI + DB 공용).
//
// 필드 책임:
//   - 수집용:    type, url(rss), handle(rsshub), enabled
//   - UI용:      name, category, description, defaultChecked, enabled
//   - DB 키:     id (영구 불변 — 리네임 금지, 비활성 후 새 id 추가만 허용)
//
// /api/sources는 { id, name, category, description, defaultChecked }만 반환.
// type/handle/url 등 내부 인프라 필드는 공개하지 않는다.

export const categories = {
  'ai-official':  { label: 'AI 기업 공식',   order: 1 },
  'ai-media':     { label: 'AI·테크 미디어', order: 2 },
  'community':    { label: '커뮤니티',         order: 3 },
  'tech-analyst': { label: '테크 애널리스트',  order: 4 },
  'newsletter':   { label: '뉴스레터·PM',      order: 5 },
  'influencer':   { label: '인플루언서',       order: 6 },
}

export const sources = [
  // === AI 기업 공식 (X via RSSHub) ===
  {
    id: 'openai',
    type: 'rsshub', handle: 'OpenAI',
    name: 'OpenAI',
    category: 'ai-official',
    description: 'OpenAI 공식 발표·제품 뉴스',
    defaultChecked: true,
    enabled: true,
  },
  {
    id: 'openai-devs',
    type: 'rsshub', handle: 'OpenAIDevs',
    name: 'OpenAI Developers',
    category: 'ai-official',
    description: 'OpenAI API·DevDay·개발자 공지',
    defaultChecked: true,
    enabled: true,
  },
  {
    id: 'google-ai',
    type: 'rsshub', handle: 'GoogleAI',
    name: 'Google AI',
    category: 'ai-official',
    description: 'Google DeepMind·Gemini 릴리스 소식',
    defaultChecked: true,
    enabled: true,
  },
  {
    id: 'claude',
    type: 'rsshub', handle: 'claudeai',
    name: 'Claude',
    category: 'ai-official',
    description: 'Anthropic Claude 제품 업데이트·공지',
    defaultChecked: true,
    enabled: true,
  },
  {
    id: 'claude-code',
    type: 'rsshub', handle: 'claude_code',
    name: 'Claude Code',
    category: 'ai-official',
    description: 'Claude Code CLI 업데이트·팁',
    defaultChecked: true,
    enabled: true,
  },

  // === AI·테크 미디어 ===
  {
    id: 'geeknews',
    type: 'rsshub', handle: 'GeekNewsHada',
    name: 'GeekNews',
    category: 'ai-media',
    description: '국내 개발자 커뮤니티 핫이슈',
    defaultChecked: true,
    enabled: true,
  },

  // === 인플루언서 (X via RSSHub) ===
  {
    id: 'lucas',
    type: 'rsshub', handle: 'lucas_flatwhite',
    name: 'Lucas',
    category: 'influencer',
    description: '국내 AI·프로덕트 업계 관찰·인사이트',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'journey',
    type: 'rsshub', handle: 'atmostbeautiful',
    name: 'Journey',
    category: 'influencer',
    description: '디자인·크리에이티브 영감',
    defaultChecked: false,
    enabled: true,
  },

  // === 뉴스레터·PM (RSS) ===
  {
    id: 'lennys',
    type: 'rss', url: 'https://www.lennysnewsletter.com/feed',
    name: "Lenny's Newsletter",
    category: 'newsletter',
    description: 'PM·그로스·커리어 심층 아티클',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'sandhill',
    type: 'rss', url: 'https://www.sandhill.io/feed',
    name: 'Sandhill (Ali Afridi)',
    category: 'newsletter',
    description: 'AI 스타트업·투자 트렌드',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'chamath',
    type: 'rss', url: 'https://chamath.substack.com/feed',
    name: 'Chamath',
    category: 'newsletter',
    description: '실리콘밸리 VC 관점 비즈니스 인사이트',
    defaultChecked: false,
    enabled: true,
  },

  // === AI·테크 미디어 (신규) ===
  {
    id: 'hn',
    type: 'rss', url: 'https://news.ycombinator.com/rss',
    name: 'Hacker News',
    category: 'ai-media',
    description: 'YC 운영 테크·스타트업 소셜 뉴스',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'techmeme',
    type: 'rss', url: 'https://www.techmeme.com/feed.xml',
    name: 'Techmeme',
    category: 'ai-media',
    description: '테크 뉴스 실시간 애그리게이터',
    defaultChecked: false,
    enabled: true,
  },

  // === 커뮤니티 (신규) ===
  {
    id: 'reddit-claudecode',
    type: 'rss', url: 'https://www.reddit.com/r/ClaudeCode/.rss',
    name: 'r/ClaudeCode',
    category: 'community',
    description: 'Claude Code 실전 사용 후기·팁',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'threads-choi',
    type: 'rsshub', handle: 'choi.openai', route: 'threads',
    name: 'Threads: @choi.openai',
    category: 'community',
    description: 'OpenAI 직원 한국어 관점 스레드',
    defaultChecked: false,
    enabled: true,
  },

  // === 테크 애널리스트 (신규) ===
  {
    id: 'benedict-evans',
    type: 'rss', url: 'https://www.ben-evans.com/benedictevans?format=rss',
    name: 'Benedict Evans',
    category: 'tech-analyst',
    description: '테크·미디어 장기 트렌드 주간 뉴스레터',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'platformer',
    type: 'rss', url: 'https://www.platformer.news/feed',
    name: 'Platformer',
    category: 'tech-analyst',
    description: '빅테크와 민주주의·정책 교차점 (Casey Newton)',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'the-generalist',
    type: 'rss', url: 'https://www.generalist.com/feed',
    name: 'The Generalist',
    category: 'tech-analyst',
    description: 'VC·기업 심층 분석 롱폼',
    defaultChecked: false,
    enabled: true,
  },
  {
    id: 'stratechery',
    type: 'rss', url: 'https://stratechery.com/feed/',
    name: 'Stratechery',
    category: 'tech-analyst',
    description: 'Ben Thompson의 빅테크 전략 분석 (무료 weekly)',
    defaultChecked: false,
    enabled: true,
  },

  // === 뉴스레터·PM (신규) ===
  {
    id: 'second-brush',
    type: 'rss', url: 'https://blog.secondbrush.co.kr/rss/',
    name: 'Second Brush (데일리 프롬프트)',
    category: 'newsletter',
    description: '매일 받는 프롬프트 큐레이션',
    defaultChecked: false,
    enabled: true,
  },
]
