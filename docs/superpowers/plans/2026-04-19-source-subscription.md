# 소스별 체크박스 구독 기능 — 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈페이지에서 개별 소스 체크박스로 구독하고, 파이프라인이 구독자별 선호 소스만 필터링해 개인화 발송하도록 만든다. 신규 9개 소스를 추가해 총 20개 소스로 확장하고, Claude Code에 `/add-source`·`/remove-source` slash command를 구축한다.

**Architecture:** `sources.js` 단일 파일이 모든 소스 메타(수집 + UI)의 단일 진실 공급원. DB는 `subscribers` ↔ `subscriber_sources` 조인 테이블로 정규화. Gemini 요약은 공용 1회, 렌더링 단계에서만 구독자별 필터. `personalize()` 훅을 두어 유료 전환 시 확장 포인트 확보.

**Tech Stack:** React + Vite + Tailwind (FE), Netlify Functions (API), Turso/libsql (DB), Node.js 파이프라인 + Gemini 2.5 Flash + Resend (발송), GitHub Actions (cron), RSSHub self-host.

**Spec Reference:** `docs/superpowers/specs/2026-04-19-source-subscription-design.md`

**Workflow Note:** 각 Task는 `구현 → 로컬 smoke test → 결과 보고 → 사용자 "ok" 승인 → git commit` 흐름. push는 사용자 별도 지시 시에만. 자동화 테스트는 MVP 범위 외(스펙 결정) — 수동 smoke test로 검증.

---

## File Structure

### 생성

| 경로 | 책임 |
|------|------|
| `netlify/functions/sources.js` | `GET /api/sources` — sources.js public 필드 반환 |
| `pipeline/personalize.js` | 유료 전환 훅. MVP는 identity 반환 |
| `src/components/SourcePicker.jsx` | 카테고리별 체크박스 리스트 (presentational) |
| `.claude/commands/add-source.md` | 소스 추가 slash command 프롬프트 |
| `.claude/commands/remove-source.md` | 소스 제거 slash command 프롬프트 |

### 수정

| 경로 | 변경 요약 |
|------|----------|
| `pipeline/config/sources.js` | `categories` export 추가, 각 소스에 `id/category/description/defaultChecked/enabled` 필드 추가, 신규 9개 append |
| `pipeline/lib/article.js` | `Article.sourceId` 필드 추가, `normalizeArticle` 시그니처에 `id` 수용 |
| `pipeline/sources/index.js` | `enabled: true` 필터링 |
| `pipeline/sources/rss.js` | User-Agent 헤더 세팅, `source.id` 전달 |
| `pipeline/sources/rsshub.js` | `source.id` 전달 |
| `pipeline/send.js` | `getSubscribers()` → `getSubscribersWithSources()`, `sendOne()` 분리 |
| `pipeline/main.js` | 구독자별 루프·`personalize()` 호출·발송 집계 |
| `netlify/functions/subscribe.js` | `source_ids` 검증 + 트랜잭션 INSERT |
| `src/App.jsx` | `/api/sources` fetch + 상태 hoist + 하드코딩 문구 갱신 |
| `src/components/SubscribeForm.jsx` | `SourcePicker` 통합, `source_ids` 전송 |
| `CLAUDE.md` | 자연어 트리거 섹션 추가, 소스 수 문구 갱신 |
| `SPEC.md` | `subscriber_sources` 테이블, 20개 소스, 새 API 반영 |

---

## Task 1: DB 스키마 — `subscriber_sources` 테이블 생성

**Goal:** 구독자별 선호 소스 저장용 조인 테이블·인덱스를 Turso에 생성하고 문서 갱신.

**Files:**
- External: Turso DB (수동 SQL 실행)
- Modify: `SPEC.md:69-79` (DB 스키마 섹션)
- Modify: `CLAUDE.md:189-198` (Turso 테이블 초기화 섹션)

- [ ] **Step 1: Turso CLI 접근 확인**

Run:
```bash
source .env && turso db list
```
Expected: DB 목록에 현재 사용 중인 DB가 출력됨. 실패하면 `turso auth login` 후 재시도.

- [ ] **Step 2: `subscriber_sources` 테이블·인덱스 생성 SQL 실행**

Run:
```bash
source .env && turso db shell "$(echo $TURSO_DATABASE_URL | sed 's|libsql://||; s|\..*||')" <<'SQL'
CREATE TABLE IF NOT EXISTS subscriber_sources (
  subscriber_id INTEGER NOT NULL,
  source_id     TEXT    NOT NULL,
  PRIMARY KEY (subscriber_id, source_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subscriber_sources_source ON subscriber_sources(source_id);
SQL
```

만약 DB 이름 파싱이 실패하면 Turso 대시보드에서 DB 이름을 확인한 뒤 직접:
```bash
turso db shell <DB_NAME> < /dev/stdin <<'SQL'
(위와 동일)
SQL
```

Expected: 에러 없이 프롬프트가 돌아옴.

- [ ] **Step 3: 테이블·인덱스 생성 확인**

Run:
```bash
turso db shell <DB_NAME> ".schema subscriber_sources"
```

Expected output 포함:
```
CREATE TABLE subscriber_sources (...);
CREATE INDEX idx_subscriber_sources_source ON subscriber_sources(source_id);
```

- [ ] **Step 4: `SPEC.md` 갱신 — DB 스키마 섹션에 새 테이블 추가**

`SPEC.md`의 `## 데이터베이스 스키마` 섹션에서 `subscribers` 블록 뒤에 다음을 추가:

```markdown
### subscriber_sources 테이블

구독자별 선호 소스 (N:M 조인).

```sql
CREATE TABLE IF NOT EXISTS subscriber_sources (
  subscriber_id INTEGER NOT NULL,
  source_id     TEXT    NOT NULL,       -- pipeline/config/sources.js의 slug
  PRIMARY KEY (subscriber_id, source_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sources_source ON subscriber_sources(source_id);
```

`source_id`는 `pipeline/config/sources.js`의 `id` 필드와 매칭되며, DB에 TEXT로만 저장된다 (sources 테이블은 없음). 폐기된 소스 id는 파이프라인이 자연스럽게 무시한다.
```

- [ ] **Step 5: `CLAUDE.md` 갱신 — Turso 테이블 초기화 섹션에 추가**

`CLAUDE.md`의 `## Turso 테이블 초기화` 섹션 기존 SQL 블록 뒤에 다음 블록 추가:

```markdown
```sql
CREATE TABLE IF NOT EXISTS subscriber_sources (
  subscriber_id INTEGER NOT NULL,
  source_id     TEXT    NOT NULL,
  PRIMARY KEY (subscriber_id, source_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sources_source ON subscriber_sources(source_id);
```
```

- [ ] **Step 6: 사용자에게 보고 + 승인 요청**

보고 내용:
- 테이블·인덱스 생성 결과 (Step 3 출력).
- 갱신된 `SPEC.md`·`CLAUDE.md` 변경 요약.

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add SPEC.md CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(db): subscriber_sources 테이블 + 인덱스

구독자별 선호 소스 저장용 조인 테이블·인덱스를 Turso에 추가하고 SPEC.md·CLAUDE.md에 반영. sources.js의 id를 FK 없이 TEXT로 참조 — 폐기된 소스는 파이프라인이 필터링 단계에서 자연스럽게 무시.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 커밋 성공, `git log --oneline -1`에 새 커밋이 보임.

---

## Task 2: `sources.js` 구조 확장 + `Article.sourceId` 추가

**Goal:** `sources.js`에 `categories` export와 각 소스의 `id/category/description/defaultChecked/enabled` 필드를 추가. `Article` 타입에 `sourceId` 추가. RSS fetch에 User-Agent 헤더 추가 (Reddit 대비). 파이프라인 기존 동작 유지.

**Files:**
- Modify: `pipeline/config/sources.js` (전면 재작성)
- Modify: `pipeline/lib/article.js`
- Modify: `pipeline/sources/rss.js`
- Modify: `pipeline/sources/rsshub.js`
- Modify: `pipeline/sources/index.js`

- [ ] **Step 1: `pipeline/config/sources.js` 전면 재작성**

Replace entire file content with:

```js
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
]
```

참고: 신규 9개 소스는 Task 6에서 append한다. 이 시점에 기존 11개만 새 포맷으로 변환.

- [ ] **Step 2: `pipeline/lib/article.js` 수정 — `sourceId` 필드 추가**

Replace entire file content with:

```js
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
```

- [ ] **Step 3: `pipeline/sources/rss.js` 수정 — User-Agent 헤더 + `source.id` 전달**

Replace entire file content with:

```js
// 일반 RSS 피드 수집기. rss-parser 사용.
// retry로 감싸 최대 3회 재시도, 최종 실패는 호출부(sources/index.js)가 흡수.
// User-Agent: Reddit 등 일부 피드는 기본 Node UA를 차단하므로 명시 지정.

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'digeai-bot/1.0 (+https://digeai.com)' },
})

/**
 * @param {{ id: string, name: string, url: string }} source
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function fetch(source) {
  const feed = await retry(() => parser.parseURL(source.url), { retries: 3 })
  return (feed.items ?? [])
    .map((item) => normalizeArticle(item, { id: source.id, name: source.name, type: 'rss' }))
    .filter(Boolean)
}
```

- [ ] **Step 4: `pipeline/sources/rsshub.js` 수정 — `source.id` 전달**

Replace entire file content with:

```js
// X(Twitter) 핸들을 RSSHub 경유로 수집.
// base URL은 환경변수 RSSHUB_BASE_URL로 교체 가능 (공개 인스턴스 불안정 시 self-host로 이전).

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'digeai-bot/1.0 (+https://digeai.com)' },
})
const BASE_URL = (process.env.RSSHUB_BASE_URL ?? 'https://rsshub.app').replace(/\/$/, '')
const ACCESS_KEY = process.env.RSSHUB_ACCESS_KEY ?? ''

/**
 * @param {{ id: string, name: string, handle: string }} source
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function fetch(source) {
  const url = `${BASE_URL}/twitter/user/${source.handle}${ACCESS_KEY ? `?key=${ACCESS_KEY}` : ''}`
  const feed = await retry(() => parser.parseURL(url), { retries: 3 })
  return (feed.items ?? [])
    .map((item) => normalizeArticle(item, { id: source.id, name: source.name, type: 'rsshub' }))
    .filter(Boolean)
}
```

- [ ] **Step 5: `pipeline/sources/index.js` 수정 — `enabled: true` 필터링**

Replace entire file content with:

```js
// 디스패처: source.type → collector 매핑.
// enabled=true 소스만 수집. Promise.allSettled로 부분 실패를 격리한다.

import * as rss from './rss.js'
import * as rsshub from './rsshub.js'

const collectors = { rss, rsshub }

/**
 * @param {Array<{ type: string, id: string, name: string, url?: string, handle?: string, enabled: boolean }>} sources
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function collectAll(sources) {
  const active = sources.filter((s) => s.enabled)
  if (active.length < sources.length) {
    const skipped = sources.length - active.length
    console.log(`[digeai] ${skipped}개 소스 disabled — 수집 스킵`)
  }

  const results = await Promise.allSettled(
    active.map((s) => collectors[s.type].fetch(s)),
  )

  const articles = []
  results.forEach((r, i) => {
    const name = active[i].name
    if (r.status === 'fulfilled') {
      console.log(`[${name}] 수집: ${r.value.length}건`)
      articles.push(...r.value)
    } else {
      const msg = r.reason?.message ?? String(r.reason)
      console.error(`[${name}] 수집 실패: ${msg}`)
    }
  })
  return articles
}
```

- [ ] **Step 6: 로컬 smoke test — 파이프라인 수동 실행**

Run:
```bash
source .env && node pipeline/main.js --session evening
```

Expected:
- 각 소스에 대해 `[<name>] 수집: <N>건` 로그 출력 (최소 몇 개는 N>0).
- `[digeai] 수집 합계: <총합>건` 로그.
- `[digeai] dedup`, `[digeai] 세션 윈도우`, `[digeai] 요약 호출 중...` 로그.
- Gemini 요약 정상 진행 (API 키 필요).
- 구독자 0명 or 현재 본인 1명에게 발송 시도 (기존 동작).
- **에러 없이 완주**. 특히 `source.id is undefined` 또는 `Cannot read properties of undefined` 같은 에러가 나지 않아야 함.

만약 실패:
- 에러 스택 읽고 어느 파일의 어느 라인인지 파악.
- `source.id` 전달 누락, `normalizeArticle` 인자 불일치 등이 흔한 원인.

- [ ] **Step 7: 사용자에게 smoke test 결과 보고 + 승인 요청**

보고 내용:
- 실행 로그 마지막 1~30줄 (수집 합계·구독자·발송 집계 포함).
- 새 포맷으로 변환된 `sources.js` 객체 1개 예시.
- `Article.sourceId` 실제 값 예시 (로그에서 확인 가능하면).

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add pipeline/config/sources.js pipeline/lib/article.js pipeline/sources/rss.js pipeline/sources/rsshub.js pipeline/sources/index.js
git commit -m "$(cat <<'EOF'
refactor(sources): sources.js 구조 확장 + Article.sourceId

- sources.js: categories export + 각 소스에 id/category/description/defaultChecked/enabled 추가
- Article.sourceId 필드 신규 — 구독자별 필터링 키
- rss.js/rsshub.js: source.id를 normalizeArticle에 전달, User-Agent 헤더 지정
- sources/index.js: enabled=true만 수집

파이프라인 기존 동작 동일 (모든 소스 enabled=true, 구독자 필터링 아직 미적용).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: API — `GET /api/sources` 신규 + `POST /api/subscribe` `source_ids` 필수

**Goal:** 프론트가 소스 목록을 조회할 `GET /api/sources` 엔드포인트를 만들고, 구독 API가 `source_ids[]`를 받아 트랜잭션으로 두 테이블에 저장하도록 수정한다.

**Files:**
- Create: `netlify/functions/sources.js`
- Modify: `netlify/functions/subscribe.js`

- [ ] **Step 1: `netlify/functions/sources.js` 신규 작성**

```js
// GET /api/sources — 구독 UI용 소스 목록.
// pipeline/config/sources.js의 public 필드만 반환 (type/url/handle 등 내부 필드 제외).
// enabled: false 소스는 응답에서 제외.

import { categories, sources } from '../../pipeline/config/sources.js'

const ALLOWED_ORIGINS_BASE = ['http://localhost:8888', 'http://localhost:5173']

function getAllowedOrigins() {
  const list = [...ALLOWED_ORIGINS_BASE]
  if (process.env.PUBLIC_SITE_URL) list.push(process.env.PUBLIC_SITE_URL)
  return list
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && getAllowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export default async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }

  const publicSources = sources
    .filter((s) => s.enabled)
    .map(({ id, name, category, description, defaultChecked }) => ({
      id,
      name,
      category,
      description,
      defaultChecked,
    }))

  return new Response(
    JSON.stringify({ categories, sources: publicSources }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        ...cors,
      },
    },
  )
}

export const config = { path: '/api/sources' }
```

- [ ] **Step 2: `netlify/functions/subscribe.js` 수정 — `source_ids` 검증 + 트랜잭션**

전체 파일을 다음으로 대체:

```js
// POST /api/subscribe — 구독자 이메일 + 선호 소스 등록.
// Netlify Functions v2 (Web Request/Response API).
//
// 보안:
//   - Origin 화이트리스트 기반 CORS
//   - IP당 1분 5회 rate limit (in-memory; cold start마다 리셋 OK)
//   - raw error/스택 응답 노출 금지 (CLAUDE.md 보안 섹션)
//   - 매 요청마다 DB 클라이언트 init + finally close (CLAUDE.md 컨벤션)

import { createClient } from '@libsql/client'
import { sources as sourceRegistry } from '../../pipeline/config/sources.js'

const ALLOWED_ORIGINS_BASE = ['http://localhost:8888', 'http://localhost:5173']
const RATE_LIMIT = { max: 5, windowMs: 60_000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_CAPACITY = 45
const MAX_SOURCE_IDS = 50   // sanity — 현재 20개 + 여유

function getCapacity() {
  const raw = Number(process.env.MAX_SUBSCRIBERS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CAPACITY
}

// 모듈 스코프 in-memory rate limit map. cold start마다 리셋.
const rateLimitMap = new Map()

function getAllowedOrigins() {
  const list = [...ALLOWED_ORIGINS_BASE]
  if (process.env.PUBLIC_SITE_URL) list.push(process.env.PUBLIC_SITE_URL)
  return list
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && getAllowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function getClientIp(req, context) {
  if (context?.ip) return context.ip
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT.windowMs) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT.max) return false
  entry.count++
  return true
}

function maskEmail(email) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '[invalid]'
  const head = local.slice(0, 2)
  return `${head}***@${domain}`
}

function isUniqueViolation(err) {
  const msg = err?.message ?? String(err ?? '')
  const code = err?.code ?? ''
  return /UNIQUE/i.test(msg) || /SQLITE_CONSTRAINT/i.test(msg) || /SQLITE_CONSTRAINT/i.test(code)
}

// enabled=true인 sources.js id 집합. 요청 검증용.
function getValidSourceIdSet() {
  return new Set(sourceRegistry.filter((s) => s.enabled).map((s) => s.id))
}

export default async (req, context) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, cors)
  }

  const ip = getClientIp(req, context)
  if (!checkRateLimit(ip)) {
    return jsonResponse(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      429,
      cors,
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: '올바른 요청이 아닙니다.' }, 400, cors)
  }

  // 이메일 검증
  const raw = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const local = raw.split('@')[0] ?? ''
  if (!raw || !EMAIL_RE.test(raw) || raw.length > 254 || local.length > 64) {
    return jsonResponse({ error: '올바른 이메일 주소를 입력해주세요.' }, 400, cors)
  }

  // source_ids 검증
  const rawIds = body?.source_ids
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return jsonResponse(
      { error: '구독할 소스를 최소 1개 이상 선택해주세요.' },
      400,
      cors,
    )
  }
  if (rawIds.length > MAX_SOURCE_IDS) {
    return jsonResponse({ error: '선택한 소스가 너무 많습니다.' }, 400, cors)
  }

  const validSet = getValidSourceIdSet()
  const uniqueIds = [
    ...new Set(
      rawIds
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
  ]
  if (uniqueIds.length === 0) {
    return jsonResponse(
      { error: '구독할 소스를 최소 1개 이상 선택해주세요.' },
      400,
      cors,
    )
  }
  const invalid = uniqueIds.filter((id) => !validSet.has(id))
  if (invalid.length > 0) {
    // 어떤 id가 잘못됐는지는 로그에만, 응답은 generic
    console.error('[subscribe] 알 수 없는 source_id:', { ip, invalid })
    return jsonResponse({ error: '선택한 소스가 올바르지 않습니다.' }, 400, cors)
  }

  // DB env
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('[subscribe] TURSO env 누락', {
      ip,
      ts: new Date().toISOString(),
    })
    return jsonResponse(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      500,
      cors,
    )
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  try {
    const capacity = getCapacity()
    const countRes = await client.execute('SELECT COUNT(*) AS count FROM subscribers')
    const rawCount = countRes.rows?.[0]?.count
    const currentCount =
      typeof rawCount === 'bigint' ? Number(rawCount) : Number(rawCount ?? 0)
    if (currentCount >= capacity) {
      return jsonResponse(
        { error: '현재 구독자가 모두 찼습니다. 다음 기회를 기다려주세요.' },
        403,
        cors,
      )
    }

    // 트랜잭션: subscribers INSERT → subscriber_sources INSERT × N
    const tx = await client.transaction('write')
    try {
      const insertRes = await tx.execute({
        sql: 'INSERT INTO subscribers(email) VALUES (?)',
        args: [raw],
      })
      const subscriberId = insertRes.lastInsertRowid
      if (subscriberId == null) {
        throw new Error('subscribers INSERT lastInsertRowid 없음')
      }
      const sidNum = typeof subscriberId === 'bigint' ? Number(subscriberId) : subscriberId

      for (const sid of uniqueIds) {
        await tx.execute({
          sql: 'INSERT INTO subscriber_sources(subscriber_id, source_id) VALUES (?, ?)',
          args: [sidNum, sid],
        })
      }

      await tx.commit()
    } catch (err) {
      await tx.rollback()
      throw err
    }

    console.log(
      `[subscribe] 신규 구독: ${maskEmail(raw)} sources=${uniqueIds.length} ip=${ip} (${currentCount + 1}/${capacity})`,
    )
    return jsonResponse({ message: '구독이 완료되었습니다.' }, 201, cors)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonResponse({ error: '이미 구독 중인 이메일입니다.' }, 409, cors)
    }
    console.error('[subscribe] DB 오류:', {
      ip,
      ts: new Date().toISOString(),
      msg: err?.message ?? String(err),
    })
    return jsonResponse(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      500,
      cors,
    )
  } finally {
    client.close()
  }
}

export const config = { path: '/api/subscribe' }
```

- [ ] **Step 3: 로컬 smoke test — `netlify dev` 실행**

Run (별도 터미널):
```bash
netlify dev
```

Expected: `http://localhost:8888`에서 서버 기동. 로그에 `/api/sources`, `/api/subscribe` 등이 로드됨.

- [ ] **Step 4: `/api/sources` 응답 검증**

Run:
```bash
curl -s http://localhost:8888/api/sources | jq '{categories: .categories | keys, source_count: (.sources | length), first: .sources[0]}'
```

Expected output 예시:
```json
{
  "categories": ["ai-media", "ai-official", "community", "influencer", "newsletter", "tech-analyst"],
  "source_count": 11,
  "first": {
    "id": "openai",
    "name": "OpenAI",
    "category": "ai-official",
    "description": "OpenAI 공식 발표·제품 뉴스",
    "defaultChecked": true
  }
}
```

내부 필드(`type`/`handle`/`url`)가 응답에 없어야 한다.

- [ ] **Step 5: `/api/subscribe` `source_ids` 없는 요청 검증 (400 기대)**

Run:
```bash
curl -s -X POST http://localhost:8888/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-smoke@example.com"}' | jq
```

Expected:
```json
{ "error": "구독할 소스를 최소 1개 이상 선택해주세요." }
```
HTTP status 400.

- [ ] **Step 6: `/api/subscribe` 알 수 없는 `source_id` 요청 검증 (400 기대)**

Run:
```bash
curl -s -X POST http://localhost:8888/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-smoke@example.com","source_ids":["openai","doesnotexist"]}' | jq
```

Expected:
```json
{ "error": "선택한 소스가 올바르지 않습니다." }
```

- [ ] **Step 7: `/api/subscribe` 정상 요청 검증 (201 기대)**

Run:
```bash
curl -s -X POST http://localhost:8888/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-smoke@example.com","source_ids":["openai","lennys"]}' | jq
```

Expected:
```json
{ "message": "구독이 완료되었습니다." }
```

- [ ] **Step 8: DB에서 실제 저장 확인**

Run:
```bash
source .env && turso db shell <DB_NAME> \
  "SELECT s.email, ss.source_id FROM subscribers s JOIN subscriber_sources ss ON s.id=ss.subscriber_id WHERE s.email='test-smoke@example.com';"
```

Expected output (2줄):
```
test-smoke@example.com | openai
test-smoke@example.com | lennys
```

- [ ] **Step 9: 테스트 레코드 정리**

Run:
```bash
source .env && turso db shell <DB_NAME> \
  "DELETE FROM subscribers WHERE email='test-smoke@example.com';"
```

ON DELETE CASCADE로 `subscriber_sources`의 관련 행도 자동 삭제됨. 확인:
```bash
source .env && turso db shell <DB_NAME> \
  "SELECT COUNT(*) FROM subscriber_sources WHERE source_id IN ('openai','lennys');"
```

Expected: 본인(구독자 1) 레코드가 있으면 그 수만큼, 테스트 레코드는 제거된 상태.

- [ ] **Step 10: 사용자에게 smoke test 결과 보고 + 승인 요청**

보고 내용:
- `/api/sources` 응답 요약 (Step 4 output).
- subscribe 400/400/201 세 케이스 응답.
- DB 실제 저장·정리 확인.

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 11: 커밋**

```bash
git add netlify/functions/sources.js netlify/functions/subscribe.js
git commit -m "$(cat <<'EOF'
feat(api): GET /api/sources + POST /api/subscribe source_ids 필수

- GET /api/sources 신규: sources.js의 public 필드(id/name/category/description/defaultChecked) + categories 반환. 5분 캐시.
- POST /api/subscribe: source_ids 배열 필수(최소 1개), enabled=true id 집합과 매칭 검증, libsql transaction으로 subscribers + subscriber_sources INSERT 묶음 처리.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 프론트엔드 — `SourcePicker` + `SubscribeForm` + `App` 연동

**Goal:** 홈페이지 폼에 카테고리별 체크박스를 추가하고 `source_ids`를 함께 POST. `App.jsx`의 하드코딩된 "11개" 문구와 소스 나열 문구를 동적/갱신된 표현으로 교체.

**Files:**
- Create: `src/components/SourcePicker.jsx`
- Modify: `src/components/SubscribeForm.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: `src/components/SourcePicker.jsx` 신규 작성**

```jsx
import { useMemo } from 'react'

/**
 * 카테고리별 체크박스 리스트. 순수 presentational — 상태 없음.
 *
 * @param {Object} props
 * @param {Record<string, { label: string, order: number }>} props.categories
 * @param {Array<{ id: string, name: string, category: string, description: string, defaultChecked: boolean }>} props.sources
 * @param {Set<string>} props.selected
 * @param {(next: Set<string>) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
function SourcePicker({ categories, sources, selected, onChange, disabled = false }) {
  const grouped = useMemo(() => {
    const byCat = new Map()
    for (const s of sources) {
      if (!byCat.has(s.category)) byCat.set(s.category, [])
      byCat.get(s.category).push(s)
    }
    const orderedKeys = [...byCat.keys()].sort(
      (a, b) => (categories[a]?.order ?? 99) - (categories[b]?.order ?? 99),
    )
    return orderedKeys.map((key) => ({
      key,
      label: categories[key]?.label ?? key,
      items: byCat.get(key),
    }))
  }, [categories, sources])

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <p
        aria-live="polite"
        className="text-[11px] tracking-[0.22em] text-neutral-500 uppercase"
      >
        {selected.size}개 선택됨
      </p>

      {grouped.map(({ key, label, items }) => (
        <section key={key} className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold tracking-[0.24em] text-amber-300/80 uppercase">
            {label}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {items.map((s) => {
              const checked = selected.has(s.id)
              return (
                <li key={s.id}>
                  <label
                    htmlFor={`src-${s.id}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                      checked
                        ? 'border-amber-400/40 bg-amber-400/5'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                    } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input
                      id={`src-${s.id}`}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(s.id)}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-amber-400"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-neutral-100">
                        {s.name}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                        {s.description}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default SourcePicker
```

- [ ] **Step 2: `src/components/SubscribeForm.jsx` 전면 재작성**

```jsx
import { useState } from 'react'
import SourcePicker from './SourcePicker.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function SubscribeForm({
  onResult,
  stats,
  onStatsChange,
  sources,
  categories,
  initialSelected,
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(() => new Set(initialSelected ?? []))

  const trimmed = email.trim()
  const isFull = stats?.full === true
  const canSubmit =
    trimmed.length > 0 && selected.size > 0 && !loading && !isFull

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isFull) return

    if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) {
      setError('올바른 이메일 주소를 입력해주세요.')
      return
    }
    if (selected.size === 0) {
      setError('구독할 소스를 최소 1개 이상 선택해주세요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed.toLowerCase(),
          source_ids: [...selected],
        }),
      })

      let body = {}
      try {
        body = await res.json()
      } catch {
        // 비정상 응답
      }

      if (res.status === 201) {
        onResult({ variant: 'success', message: body.message ?? '구독이 완료되었습니다.' })
        setEmail('')
        onStatsChange?.((s) =>
          s ? { ...s, count: s.count + 1, full: s.count + 1 >= s.capacity } : s,
        )
      } else if (res.status === 400) {
        onResult({ variant: 'error', message: body.error ?? '입력을 확인해주세요.' })
      } else if (res.status === 403) {
        onResult({
          variant: 'error',
          message: body.error ?? '현재 구독자가 모두 찼습니다. 다음 기회를 기다려주세요.',
        })
        onStatsChange?.((s) => (s ? { ...s, full: true } : s))
      } else if (res.status === 409) {
        onResult({ variant: 'error', message: body.error ?? '이미 구독 중인 이메일입니다.' })
      } else if (res.status === 429) {
        onResult({
          variant: 'error',
          message: body.error ?? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        })
      } else {
        onResult({
          variant: 'error',
          message: body.error ?? '잠시 후 다시 시도해주세요.',
        })
      }
    } catch {
      onResult({ variant: 'error', message: '네트워크 오류 — 연결을 확인해주세요.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <SourcePicker
        categories={categories}
        sources={sources}
        selected={selected}
        onChange={setSelected}
        disabled={loading || isFull}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="email" className="sr-only">
          이메일 주소
        </label>
        <div className="relative flex-1">
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError('')
            }}
            disabled={loading || isFull}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'email-error' : undefined}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-base text-white placeholder:text-neutral-600 outline-none backdrop-blur transition focus:border-amber-400/50 focus:bg-white/[0.05] focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {error && (
            <p
              id="email-error"
              className="absolute -bottom-6 left-0 text-xs text-rose-300/90"
            >
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="group inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3.5 text-sm font-semibold tracking-tight text-neutral-950 shadow-[0_0_0_1px_rgb(245_158_11/0.3),0_10px_30px_-10px_rgb(245_158_11/0.45)] transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                />
              </svg>
              전송 중
            </>
          ) : isFull ? (
            '모집 마감'
          ) : (
            <>
              구독하기
              <svg
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 7h12m0 0L8 2m5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
        </button>
      </div>
    </form>
  )
}

export default SubscribeForm
```

- [ ] **Step 3: `src/App.jsx` 수정 — `/api/sources` fetch + 소스/카테고리 상태 + 하드코딩 문구 갱신**

전체 파일을 다음으로 대체:

```jsx
import { useEffect, useMemo, useState } from 'react'
import SubscribeForm from './components/SubscribeForm.jsx'
import Toast from './components/Toast.jsx'
import Countdown from './components/Countdown.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function App() {
  const [toast, setToast] = useState(null)
  const [stats, setStats] = useState(null)
  const [sourceData, setSourceData] = useState(null) // { categories, sources }
  const [sourceError, setSourceError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stats`)
        if (!res.ok) return
        const body = await res.json()
        if (!cancelled) setStats(body)
      } catch {
        // 통계는 선택적
      }
    }

    async function loadSources() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sources`)
        if (!res.ok) throw new Error('sources fetch failed')
        const body = await res.json()
        if (!cancelled) setSourceData(body)
      } catch {
        if (!cancelled) setSourceError(true)
      }
    }

    loadStats()
    loadSources()

    return () => {
      cancelled = true
    }
  }, [])

  const [year] = useState(() => new Date().getFullYear())

  const count = stats?.count ?? 0
  const capacity = stats?.capacity ?? 0
  const isFull = stats?.full === true
  const percent = capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0

  const sourceCount = sourceData?.sources?.length ?? 0
  const initialSelected = useMemo(() => {
    if (!sourceData) return []
    return sourceData.sources.filter((s) => s.defaultChecked).map((s) => s.id)
  }, [sourceData])

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950">
      <div className="aurora" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="relative z-10 border-b border-white/6">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-5">
          <span className="text-[11px] font-semibold tracking-[0.32em] text-neutral-200 uppercase">
            DIGEAI
          </span>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-20 sm:pb-28">
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-12">
          <section className="fade-up lg:col-span-7">
            <p className="mb-8 inline-flex items-center gap-3 text-[11px] tracking-[0.22em] text-amber-300/90 uppercase">
              <span className="h-px w-10 bg-amber-300/50" />
              Daily AI Digest
            </p>

            <h1 className="text-5xl leading-[1.02] font-semibold tracking-[-0.035em] text-white text-balance sm:text-6xl md:text-[4.5rem]">
              매일 두 번,
              <br />
              <span className="text-neutral-500">AI의 흐름을</span>{' '}
              <span className="text-neutral-500">놓치지 않게.</span>
            </h1>

            <p className="mt-7 max-w-lg text-[15px] leading-relaxed text-neutral-400">
              {sourceCount > 0 ? (
                <>
                  <strong className="font-medium text-neutral-200">{sourceCount}개</strong>의
                  큐레이션 소스 중 원하는 것을 골라{' '}
                </>
              ) : (
                '큐레이션된 AI 소식을 '
              )}
              <strong className="font-medium text-neutral-200">Gemini 2.5 Flash</strong>로
              요약해{' '}
              <strong className="font-medium text-neutral-200">오전 8시 · 오후 5시 KST</strong>에
              이메일로 전달합니다.
            </p>

            <div className="mt-10 max-w-xl">
              {sourceError ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-5 text-sm text-rose-200">
                  소스 목록을 불러오지 못했습니다. 새로고침해주세요.
                </div>
              ) : !sourceData ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-sm text-neutral-500">
                  소스 목록을 불러오는 중…
                </div>
              ) : (
                <SubscribeForm
                  onResult={setToast}
                  stats={stats}
                  onStatsChange={setStats}
                  sources={sourceData.sources}
                  categories={sourceData.categories}
                  initialSelected={initialSelected}
                />
              )}
            </div>

            {stats && (
              <div className="mt-12 flex max-w-lg items-center gap-4">
                <span className="text-[10px] tracking-[0.22em] text-neutral-600 uppercase">
                  {isFull ? '마감' : '구독자'}
                </span>
                <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/6">
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                      isFull
                        ? 'bg-rose-400'
                        : 'bg-linear-to-r from-amber-400 to-amber-300'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-neutral-500">
                  <span className="text-neutral-200">{count}</span>
                  <span className="text-neutral-700">/</span>
                  {capacity}
                </span>
              </div>
            )}

            {isFull && (
              <p className="mt-3 max-w-lg text-xs text-rose-300/80">
                정원이 가득 찼습니다. 다음 기회를 기다려주세요.
              </p>
            )}
          </section>

          <aside className="fade-up flex flex-col gap-5 lg:col-span-5 lg:pl-6">
            <div className="glass rounded-2xl p-7">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
                  다음 발송까지
                </p>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
              </div>
              <Countdown />
            </div>

            <div className="glass rounded-2xl p-7">
              <p className="mb-5 text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
                How it works
              </p>
              <ol className="space-y-4">
                {[
                  {
                    n: '01',
                    title: '선택',
                    desc: '관심 있는 소스만 체크박스로 고르기',
                  },
                  {
                    n: '02',
                    title: '요약',
                    desc: 'Gemini 2.5 Flash로 2~3문장 한글 요약',
                  },
                  {
                    n: '03',
                    title: '전달',
                    desc: '원문 링크와 함께 이메일로 발송',
                  },
                ].map((step) => (
                  <li key={step.n} className="flex items-start gap-4">
                    <span className="mt-0.5 font-mono text-[11px] tabular-nums text-amber-300/70">
                      {step.n}
                    </span>
                    <div className="flex-1 border-l border-white/6 pl-4">
                      <p className="text-sm font-medium tracking-tight text-neutral-100">
                        {step.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-[11px] tracking-widest text-neutral-600 uppercase sm:flex-row sm:items-center sm:justify-between">
          <p className="normal-case tracking-normal">
            구독 이메일은 뉴스레터 발송 외 용도로 사용되지 않습니다.
          </p>
          <p className="font-mono tabular-nums">© {year} DIGEAI</p>
        </div>
      </footer>
    </div>
  )
}

export default App
```

- [ ] **Step 4: `netlify dev` 실행 후 브라우저 검증**

`netlify dev`가 이미 실행 중이 아니면 Run:
```bash
netlify dev
```

브라우저에서 `http://localhost:8888` 접속하고 확인:
- 카테고리별로 체크박스 섹션 6개 렌더링.
- `ai-official` 5개는 기본 체크, 나머지 기본 체크 해제.
- "N개 선택됨" 카운터가 체크에 따라 실시간 갱신.
- 이메일 없이 제출 버튼은 비활성.
- 모든 체크 해제 후 제출 시도 → 인라인 에러 "구독할 소스를 최소 1개 이상 선택해주세요."
- 정상 조합(이메일 + 1개 이상 체크)으로 제출 → 성공 토스트.

- [ ] **Step 5: 실제 구독 후 DB 저장 확인**

폼에서 `test-ui@example.com` + 임의 조합 체크 후 제출.

Run:
```bash
source .env && turso db shell <DB_NAME> \
  "SELECT s.email, ss.source_id FROM subscribers s JOIN subscriber_sources ss ON s.id=ss.subscriber_id WHERE s.email='test-ui@example.com';"
```

Expected: 체크한 소스와 일치하는 `source_id` 행들이 출력.

- [ ] **Step 6: 테스트 레코드 정리**

```bash
source .env && turso db shell <DB_NAME> \
  "DELETE FROM subscribers WHERE email='test-ui@example.com';"
```

- [ ] **Step 7: 사용자에게 보고 + 승인 요청**

보고 내용:
- 브라우저 스크린샷 설명(또는 직접 확인 권유 "`http://localhost:8888`에서 체크박스 UI 확인 가능").
- DB 저장·정리 확인 결과.
- 에러 핸들링 케이스 동작 요약.

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/SourcePicker.jsx src/components/SubscribeForm.jsx src/App.jsx
git commit -m "$(cat <<'EOF'
feat(ui): SourcePicker 체크박스 구독 폼

- SourcePicker: 카테고리별 섹션 + 체크박스 리스트 (presentational)
- SubscribeForm: selected Set 상태, source_ids 배열 전송, 최소 1개 검증
- App.jsx: /api/sources fetch 후 소스/카테고리 prop 전달, defaultChecked 기반 초기 선택, 하드코딩 문구 갱신

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 파이프라인 구독자별 발송 + `personalize` 훅

**Goal:** 파이프라인이 구독자별 선호 소스만 필터링해 개인화 발송하도록 변경. 유료 전환 훅 `personalize()`를 identity로 분리.

**Files:**
- Create: `pipeline/personalize.js`
- Modify: `pipeline/send.js`
- Modify: `pipeline/main.js`

- [ ] **Step 1: `pipeline/personalize.js` 신규 작성**

```js
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
```

- [ ] **Step 2: `pipeline/send.js` 전면 재작성 — `getSubscribersWithSources` + `sendOne` 분리**

```js
// Resend로 발송. getSubscribersWithSources는 이메일 + 선호 소스 JOIN 조회.
// sendOne은 1명 발송 단위 — 호출부(main.js)가 구독자별 루프·pool을 관리한다.
// idempotencyKey로 같은 세션·같은 날·같은 수신자 중복 발송 방지.

import { Resend } from 'resend'
import { createClient } from '@libsql/client'

const FROM_DEFAULT = 'Digeai <onboarding@resend.dev>'

// KST 기준 YYYYMMDD (idempotencyKey 안정성을 위해 KST 기준 고정)
function kstDateKey(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(date).replaceAll('-', '')
}

/**
 * 구독자별 선호 소스 JOIN 조회.
 * @returns {Promise<Array<{ email: string, sourceIds: Set<string> }>>}
 */
export async function getSubscribersWithSources() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 누락')
  }
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  try {
    const result = await client.execute(`
      SELECT s.email, ss.source_id
      FROM subscribers s
      LEFT JOIN subscriber_sources ss ON s.id = ss.subscriber_id
      ORDER BY s.id
    `)
    const byEmail = new Map()
    for (const row of result.rows) {
      const email = String(row.email)
      if (!byEmail.has(email)) byEmail.set(email, new Set())
      if (row.source_id != null) byEmail.get(email).add(String(row.source_id))
    }
    return [...byEmail.entries()].map(([email, sourceIds]) => ({ email, sourceIds }))
  } finally {
    client.close()
  }
}

const resendInstance = (() => {
  let cached = null
  return () => {
    if (!cached) {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY 누락')
      cached = new Resend(process.env.RESEND_API_KEY)
    }
    return cached
  }
})()

/**
 * 한 명에게 발송. idempotencyKey로 세션·날짜·수신자 단위 중복 발송 방지.
 * @param {{ to: string, subject: string, html: string, session: 'morning'|'evening', date: Date }} args
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendOne({ to, subject, html, session, date }) {
  const resend = resendInstance()
  const from = process.env.MAIL_FROM ?? FROM_DEFAULT
  const dateKey = kstDateKey(date)
  try {
    const { error } = await resend.emails.send(
      { from, to, subject, html },
      { idempotencyKey: `digeai/${session}/${dateKey}/${to}` },
    )
    if (error) {
      console.error(`[${to}] 발송 실패:`, error.message ?? error)
      return { ok: false, error: error.message ?? String(error) }
    }
    return { ok: true }
  } catch (err) {
    console.error(`[${to}] 발송 예외:`, err.message ?? err)
    return { ok: false, error: err.message ?? String(err) }
  }
}
```

- [ ] **Step 3: `pipeline/main.js` 수정 — 구독자별 루프 + `personalize` 호출**

`pipeline/main.js`의 구독자 조회·발송 부분을 아래와 같이 수정. 기존 `getSubscribers`, `sendNewsletter` import 제거 후 `getSubscribersWithSources`, `sendOne` 사용.

전체 파일을 다음으로 대체:

```js
// 오케스트레이터: --session morning|evening 인자로 한 세션의 발송을 끝까지 책임진다.
//
// 흐름: env 검증 → collect → dedup → 노이즈 필터 → KST 윈도우 → 다양성 →
//       summarize → relevance 필터 → 구독자별 필터·개인화·발송.
// 부분 실패는 격리 (한 source/한 수신자 실패가 전체 파이프라인을 죽이지 않는다).
// 재실행 안전 (Resend idempotencyKey가 같은 세션·같은 날·같은 수신자 중복 발송을 방지).

import 'dotenv/config'
import { parseArgs } from 'node:util'

import { sources } from './config/sources.js'
import { collectAll } from './sources/index.js'
import { dedup } from './dedup.js'
import { filterNoise } from './lib/filter.js'
import { diversify } from './lib/diversify.js'
import { getSessionWindow } from './lib/window.js'
import { summarize } from './summarize.js'
import { renderEmail } from './render.js'
import { getSubscribersWithSources, sendOne } from './send.js'
import { personalize } from './personalize.js'

const REQUIRED_ENV = [
  'GEMINI_API_KEY',
  'RESEND_API_KEY',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
]
const SEND_CONCURRENCY = 5

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`[digeai] 필수 환경변수 누락: ${missing.join(', ')}`)
    process.exit(1)
  }
}

/**
 * 간단 pool — 한 번에 concurrency개씩 worker를 돌린다.
 */
async function pool(items, concurrency, worker) {
  const queue = items.slice()
  async function next() {
    while (queue.length > 0) {
      const item = queue.shift()
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next))
}

async function main() {
  const { values } = parseArgs({
    options: { session: { type: 'string' } },
    allowPositionals: true,
  })
  const session = values.session
  if (session !== 'morning' && session !== 'evening') {
    console.error('[digeai] --session morning|evening 필수')
    process.exit(1)
  }

  validateEnv()

  const startedAt = Date.now()
  const now = new Date()
  console.log(`[digeai] 시작 — session=${session} now=${now.toISOString()}`)

  // 1. 수집
  const collected = await collectAll(sources)
  console.log(`[digeai] 수집 합계: ${collected.length}건`)

  // 2. dedup
  const deduped = dedup(collected)
  console.log(`[digeai] dedup: ${deduped.length}건 (제거 ${collected.length - deduped.length})`)

  // 2.5. 노이즈 필터
  const denoised = filterNoise(deduped)
  if (denoised.length < deduped.length) {
    console.log(`[digeai] 노이즈 제거: ${deduped.length - denoised.length}건`)
  }

  // 3. 세션 윈도우 필터
  const win = getSessionWindow(session, now)
  const filtered = denoised.filter(
    (a) => a.publishedAt >= win.from && a.publishedAt < win.to,
  )
  console.log(
    `[digeai] 세션 윈도우 ${win.from.toISOString()} ~ ${win.to.toISOString()}: ${filtered.length}건`,
  )

  if (filtered.length === 0) {
    console.log(`[digeai] no new articles for ${session} — 발송 생략`)
    return
  }

  // 3.5. 다양성 보장
  const diversified = diversify(filtered, denoised)
  const sourceDist = {}
  for (const a of diversified) sourceDist[a.source] = (sourceDist[a.source] ?? 0) + 1
  console.log(
    `[digeai] diversify: ${diversified.length}건 / source ${Object.keys(sourceDist).length}개 — ${Object.entries(sourceDist).map(([s, c]) => `${s}:${c}`).join(', ')}`,
  )

  // 4. 요약 (공용 1회)
  console.log('[digeai] 요약 호출 중...')
  const summary = await summarize(diversified)
  console.log(`[digeai] 요약 완료: items=${summary.items.length}`)

  // 4.5. engineeringRelevance 필터 (summarize가 점수를 items에 심음)
  const threshold = Number(process.env.RELEVANCE_THRESHOLD ?? 5)
  const beforeFilter = summary.items.length
  const droppedItems = summary.items.filter(
    (it) => Number.isFinite(it.engineeringRelevance) && it.engineeringRelevance < threshold,
  )
  const keptItems = summary.items.filter(
    (it) => !Number.isFinite(it.engineeringRelevance) || it.engineeringRelevance >= threshold,
  )
  if (droppedItems.length > 0) {
    console.log(
      `[digeai] 관련성 필터 (>=${threshold}): ${beforeFilter} → ${keptItems.length}건 (제외 ${droppedItems.length})`,
    )
    for (const it of droppedItems) {
      console.log(`           drop[${it.engineeringRelevance ?? '?'}]: ${it.title}`)
    }
  }

  if (keptItems.length === 0) {
    console.log('[digeai] 관련성 임계값 통과 기사 없음 — 발송 생략')
    return
  }

  // 5. 구독자 조회 (선호 소스 JOIN)
  const recipients = await getSubscribersWithSources()
  console.log(`[digeai] 구독자: ${recipients.length}명`)

  if (recipients.length === 0) {
    console.log('[digeai] 구독자 없음 — 발송 생략')
    return
  }

  // 6. 구독자별 루프 — 필터·개인화·렌더·발송
  let sent = 0
  const failed = []
  const skippedEmpty = []

  await pool(recipients, SEND_CONCURRENCY, async (subscriber) => {
    const myItems = keptItems.filter((it) => subscriber.sourceIds.has(it.sourceId))
    if (myItems.length === 0) {
      skippedEmpty.push(subscriber.email)
      return
    }

    const personalized = await personalize(myItems, subscriber)

    const { subject, html } = renderEmail({
      session,
      date: now,
      items: personalized,
      trend: summary.trend,
    })

    const res = await sendOne({
      to: subscriber.email,
      subject,
      html,
      session,
      date: now,
    })
    if (res.ok) sent++
    else failed.push(subscriber.email)
  })

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[digeai] session=${session} collected=${collected.length} deduped=${deduped.length} window=${filtered.length} summarized=${summary.items.length} kept=${keptItems.length} recipients=${recipients.length} sent=${sent} failed=${failed.length} skippedEmpty=${skippedEmpty.length} elapsed=${elapsed}s`,
  )
  if (skippedEmpty.length > 0) {
    console.log(
      `[digeai] 본인 소스 기사 0건 — 발송 스킵 (${skippedEmpty.length}명)`,
    )
  }
  if (failed.length > 0) {
    console.error(`[digeai] 발송 실패 ${failed.length}건: ${failed.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('[digeai] 치명적 오류:', err)
  process.exit(1)
})
```

- [ ] **Step 4: 테스트용 구독자 한 명을 체크박스 일부만 선택해 등록**

`netlify dev` 실행 중이면 프론트에서 `test-pipeline@example.com`으로 **체크박스 1~2개만 선택**해 구독. 또는 curl 직접:

```bash
curl -s -X POST http://localhost:8888/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-pipeline@example.com","source_ids":["openai","claude"]}' | jq
```

Expected: 201 응답.

- [ ] **Step 5: 로컬 파이프라인 실행**

```bash
source .env && node pipeline/main.js --session evening
```

Expected:
- 수집·dedup·요약 정상 진행 (Task 2 때와 유사).
- `[digeai] 구독자: N명` 로그 (test-pipeline + 본인).
- 최종 라인에 `sent=N skippedEmpty=M` 형태.
- `test-pipeline@example.com`이 기사를 받으면 **체크한 소스의 기사만** 포함돼야 함. Resend 대시보드 "Logs"에서 수신 이메일 본문 또는 메타데이터 확인.

실제 수신 검증이 어렵다면 `render.js`에 디버그 출력을 임시 추가하지 말고, 로그의 `kept` 대비 각 구독자가 받은 개수 추이로 판정.

- [ ] **Step 6: 테스트 구독자 정리**

```bash
source .env && turso db shell <DB_NAME> \
  "DELETE FROM subscribers WHERE email='test-pipeline@example.com';"
```

- [ ] **Step 7: 사용자에게 보고 + 승인 요청**

보고 내용:
- 파이프라인 마지막 1~10줄 로그.
- 테스트 구독자의 체크 소스와 실제 발송 여부 (skippedEmpty에 없는지, sent가 증가했는지).
- Resend 대시보드에서 이메일 본문이 선택 소스 기사로만 구성됐는지 (가능하면).

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add pipeline/send.js pipeline/personalize.js pipeline/main.js
git commit -m "$(cat <<'EOF'
feat(pipeline): 구독자별 개인화 발송 + personalize 훅

- getSubscribers → getSubscribersWithSources: email + 선호 source_id Set JOIN 조회
- sendOne 분리: 1명 단위 발송, 호출부가 pool·루프 관리
- main.js: 구독자별 sourceIds 필터 → personalize() → renderEmail → sendOne. skippedEmpty 집계 추가.
- personalize.js 신규: MVP identity. 유료 전환 시 subscriber.plan 분기로 교체.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 신규 9개 소스 추가

**Goal:** `sources.js`에 Reddit·Hacker News·Techmeme·Substack 계열 4개·Threads·Second Brush 9개를 append. 각 URL을 사전 검증하고 파이프라인 수집이 정상 작동함을 확인.

**Files:**
- Modify: `pipeline/config/sources.js`
- Modify: `CLAUDE.md` (소스 수 문구)
- Modify: `SPEC.md` (수집 소스 표)

### Substep 6a: 각 RSS URL 사전 검증

- [ ] **Step 1: Reddit r/ClaudeCode**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -A 'digeai-bot/1.0 (+https://digeai.com)' \
  'https://www.reddit.com/r/ClaudeCode/.rss'
```
Expected: `HTTP 200`. 403이면 UA 변경 시도 후 재검증.

- [ ] **Step 2: Hacker News**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://news.ycombinator.com/rss'
```
Expected: `HTTP 200`.

- [ ] **Step 3: Techmeme**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://www.techmeme.com/feed.xml'
```
Expected: `HTTP 200`.

- [ ] **Step 4: Benedict Evans**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://www.ben-evans.com/benedictevans?format=rss'
```
Expected: `HTTP 200`. 실패 시 `https://www.ben-evans.com/newsletter?format=rss` 등 후보 시도.

- [ ] **Step 5: Platformer**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://www.platformer.news/feed'
```
Expected: `HTTP 200` (Substack).

- [ ] **Step 6: The Generalist**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://www.readthegeneralist.com/feed'
```
Expected: `HTTP 200`. 실패 시 `https://www.generalist.com/feed` 시도.

- [ ] **Step 7: Stratechery 무료 weekly**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://stratechery.com/feed/'
```
Expected: `HTTP 200`. 무료분만 담긴 `https://stratechery.com/category/weekly/feed/`도 후보.

- [ ] **Step 8: Second Brush (데일리 프롬프트)**

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" 'https://blog.secondbrush.co.kr/rss/'
```
Expected: `HTTP 200`. 실패 시 `/feed`, `/atom.xml`, `/index.xml` 순 시도. Ghost 블로그면 `/rss/`가 표준.

- [ ] **Step 9: Threads @choi.openai**

```bash
source .env && curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  "$RSSHUB_BASE_URL/threads/choi.openai?key=$RSSHUB_ACCESS_KEY"
```
Expected: `HTTP 200` (스펙 작성 중 이미 확인됨).

**각 소스의 최종 확정 URL을 메모**해두고 Step 10에서 sources.js에 반영.

### Substep 6b: `sources.js`에 9개 append

- [ ] **Step 10: `pipeline/config/sources.js`의 `sources` 배열 끝에 9개 객체 추가**

Task 2에서 작성한 `pipeline/config/sources.js`의 `sources` 배열 마지막(`chamath` 다음) 에 다음 블록을 추가. 각 URL은 Substep 6a에서 200을 확인한 최종 URL로 교체.

```js
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
    type: 'rsshub', handle: 'choi.openai',
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
    type: 'rss', url: 'https://www.readthegeneralist.com/feed',
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
```

**중요**: Threads route는 `pipeline/sources/rsshub.js`의 `${BASE_URL}/twitter/user/${source.handle}` 포맷을 전제로 한다. Threads는 route가 다르다 (`/threads/:user`). 이 때문에 `rsshub.js`는 twitter/threads를 구분할 수 없음. 아래 Step 11에서 `rsshub.js`를 확장한다.

- [ ] **Step 11: `pipeline/sources/rsshub.js` 확장 — route 필드 도입**

다음 내용으로 교체:

```js
// X(Twitter) / Threads 등 RSSHub 라우트 수집.
// base URL은 환경변수 RSSHUB_BASE_URL로 교체 가능.
// source.route로 라우트 경로를 명시하고, 없으면 기본값 'twitter/user' (하위 호환).

import Parser from 'rss-parser'
import { retry } from '../lib/retry.js'
import { normalizeArticle } from '../lib/article.js'

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'digeai-bot/1.0 (+https://digeai.com)' },
})
const BASE_URL = (process.env.RSSHUB_BASE_URL ?? 'https://rsshub.app').replace(/\/$/, '')
const ACCESS_KEY = process.env.RSSHUB_ACCESS_KEY ?? ''

/**
 * @param {{ id: string, name: string, handle: string, route?: string }} source
 * @returns {Promise<import('../lib/article.js').Article[]>}
 */
export async function fetch(source) {
  const route = source.route ?? 'twitter/user'
  const url = `${BASE_URL}/${route}/${source.handle}${ACCESS_KEY ? `?key=${ACCESS_KEY}` : ''}`
  const feed = await retry(() => parser.parseURL(url), { retries: 3 })
  return (feed.items ?? [])
    .map((item) => normalizeArticle(item, { id: source.id, name: source.name, type: 'rsshub' }))
    .filter(Boolean)
}
```

- [ ] **Step 12: `threads-choi` 소스에 `route` 필드 명시**

Step 10에서 추가한 `threads-choi` 객체를 다음과 같이 수정:

```js
  {
    id: 'threads-choi',
    type: 'rsshub', handle: 'choi.openai', route: 'threads',
    name: 'Threads: @choi.openai',
    category: 'community',
    description: 'OpenAI 직원 한국어 관점 스레드',
    defaultChecked: false,
    enabled: true,
  },
```

기존 X 소스들은 `route` 생략 → 기본값 `twitter/user` 사용 (하위 호환).

- [ ] **Step 13: 파이프라인 smoke test**

```bash
source .env && node pipeline/main.js --session evening 2>&1 | grep -E '\[.*\] 수집|합계|실패'
```

Expected:
- 기존 11개 + 신규 9개 = **20개 소스의 수집 로그 라인**.
- 각 신규 소스에서 1건 이상 수집되거나 (새 소스라도), 최소한 수집 실패 에러 없음.
- `[digeai] 수집 합계: N건`에서 N이 기존 대비 증가.

만약 특정 신규 소스에서 실패하면:
- URL 오타 여부 재확인 (Substep 6a).
- User-Agent 차단 (특히 Reddit) → rss.js의 UA 문자열 변경 시도.
- RSSHub 라우트 미지원 (Threads) → RSSHub self-host에 해당 route 플러그인 확인.

- [ ] **Step 14: `CLAUDE.md`·`SPEC.md`의 소스 수 문구 갱신**

`CLAUDE.md`에서 "11개"·"큐레이션된 소스" 언급 부분을 찾아 20개로 업데이트:

Run:
```bash
grep -n "11개\|8개" CLAUDE.md SPEC.md
```

나온 라인을 확인하고 적절히 수정. 예:
- `CLAUDE.md`: 수집 소스 언급 문장 → "20개 큐레이션된 소스 (AI 공식 X·뉴스레터·커뮤니티·테크 애널리스트 등)"
- `SPEC.md`: 수집 소스 표 → 신규 9개 행 추가 (`id` 컬럼 추가).

구체적으로, `SPEC.md`의 `### 수집 소스` 테이블을 다음 20개 행으로 교체:

```markdown
| 분류 | id | 이름 | type | URL / handle |
|------|----|------|------|--------------|
| X — 회사 공식 | openai | OpenAI | rsshub | `OpenAI` |
| X — 회사 공식 | openai-devs | OpenAI Developers | rsshub | `OpenAIDevs` |
| X — 회사 공식 | google-ai | Google AI | rsshub | `GoogleAI` |
| X — 회사 공식 | claude | Claude | rsshub | `claudeai` |
| X — 회사 공식 | claude-code | Claude Code | rsshub | `claude_code` |
| X — 매체 | geeknews | GeekNews | rsshub | `GeekNewsHada` |
| X — 인플루언서 | lucas | Lucas | rsshub | `lucas_flatwhite` |
| X — 인플루언서 | journey | Journey | rsshub | `atmostbeautiful` |
| 뉴스레터 | lennys | Lenny's Newsletter | rss | `https://www.lennysnewsletter.com/feed` |
| 뉴스레터 | sandhill | Sandhill (Ali Afridi) | rss | `https://www.sandhill.io/feed` |
| 뉴스레터 | chamath | Chamath | rss | `https://chamath.substack.com/feed` |
| 커뮤니티 | reddit-claudecode | r/ClaudeCode | rss | `https://www.reddit.com/r/ClaudeCode/.rss` |
| 커뮤니티 | threads-choi | Threads @choi.openai | rsshub | `choi.openai` (route: threads) |
| AI 미디어 | hn | Hacker News | rss | `https://news.ycombinator.com/rss` |
| AI 미디어 | techmeme | Techmeme | rss | `https://www.techmeme.com/feed.xml` |
| 테크 애널리스트 | benedict-evans | Benedict Evans | rss | `https://www.ben-evans.com/benedictevans?format=rss` |
| 테크 애널리스트 | platformer | Platformer | rss | `https://www.platformer.news/feed` |
| 테크 애널리스트 | the-generalist | The Generalist | rss | `https://www.readthegeneralist.com/feed` |
| 테크 애널리스트 | stratechery | Stratechery | rss | `https://stratechery.com/feed/` |
| 뉴스레터 | second-brush | Second Brush (데일리 프롬프트) | rss | `https://blog.secondbrush.co.kr/rss/` |
```

- [ ] **Step 15: 사용자에게 보고 + 승인 요청**

보고 내용:
- Substep 6a의 각 URL 검증 결과 (최종 확정 URL 목록).
- Step 13 smoke test 로그에서 각 신규 소스 수집 건수.
- `SPEC.md`·`CLAUDE.md` 갱신 diff 요약.

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 16: 커밋**

```bash
git add pipeline/config/sources.js pipeline/sources/rsshub.js CLAUDE.md SPEC.md
git commit -m "$(cat <<'EOF'
feat(sources): 신규 9개 소스 추가 (Reddit·HN·Techmeme·Substack·Threads)

추가 소스:
- community: r/ClaudeCode (Reddit), Threads @choi.openai
- ai-media: Hacker News, Techmeme
- tech-analyst: Benedict Evans, Platformer, The Generalist, Stratechery
- newsletter: Second Brush (데일리 프롬프트)

rsshub.js에 route 필드 도입 — twitter/user 외 threads 등 라우트 분기 지원.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 하네스 자동화 — slash commands + CLAUDE.md 트리거

**Goal:** Claude Code 하네스에 `/add-source`·`/remove-source` slash command를 구축하고, CLAUDE.md에 자연어 트리거 규칙을 추가한다.

**Files:**
- Create: `.claude/commands/add-source.md`
- Create: `.claude/commands/remove-source.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `.claude/commands/add-source.md` 작성**

```markdown
---
description: 새 소스를 pipeline/config/sources.js에 추가 — URL·핸들을 분석해 type·id·category·description을 추론하고, 수집 검증 후 사용자 승인 받아 커밋.
---

# /add-source

사용자가 새 수집 소스를 추가하려고 할 때 다음 절차를 따른다.

## 1. 인자 파싱

인자로 받은 문자열(`$ARGUMENTS`)을 URL 또는 핸들로 인식.
- URL 형태 (`https://...`): Step 2로.
- `@handle` or 단순 핸들: 플랫폼 맥락을 사용자에게 되묻기 (X? Threads? Instagram?).
- 불명확하면 "어떤 URL인가요?"로 되묻기.

## 2. 수집 타입 판정

| 입력 | type | 추가 필드 |
|------|------|----------|
| `twitter.com/{u}` / `x.com/{u}` / X 맥락의 `@{u}` | `rsshub` | `handle`, route 생략 (기본 twitter/user) |
| `threads.com/@{u}` / `threads.net/@{u}` | `rsshub` | `handle`, `route: 'threads'` |
| `instagram.com/{u}` | `rsshub` | `handle`, `route: 'instagram'` (불안정 경고) |
| `reddit.com/r/{sub}` | `rss` | `url: 'https://www.reddit.com/r/{sub}/.rss'` |
| `news.ycombinator.com` | `rss` | `url: 'https://news.ycombinator.com/rss'` |
| 그 외 | `rss` | `url`. `/feed` → `/rss` → `/atom.xml` → `/rss/` 순 자동 탐지 |

## 3. 수집 시험

```bash
source .env && curl -sS -o /dev/null -w "%{http_code}\n" \
  -A 'digeai-bot/1.0 (+https://digeai.com)' \
  '<후보 URL>'
```

200이 아니면 후보 URL 목록을 순회. 전부 실패하면 사용자에게 "자동 탐지 실패, RSS URL 알려주세요" 되묻기.

RSSHub route는 키 포함:
```bash
source .env && curl -sS -o /dev/null -w "%{http_code}\n" \
  "$RSSHUB_BASE_URL/<route>/<handle>?key=$RSSHUB_ACCESS_KEY"
```

## 4. 메타 자동 추론

- **id slug**: 도메인·핸들 기반 케밥 케이스. 예: `reddit.com/r/LocalLLaMA` → `reddit-localllama`, `ben-evans.com` → `benedict-evans`, `@openai` → `openai`. 이미 `sources.js`에 존재하면 뒤에 숫자 붙이거나 다른 구분자 추가를 사용자에게 제안.
- **name**: 사람이 읽는 표시명. 플랫폼 prefix 권장 (`r/ClaudeCode`, `Threads: @choi.openai`).
- **category**: `pipeline/config/sources.js`의 `categories` 중 하나. 명확하지 않으면 사용자에게 선택 요청.
- **description**: 소스가 주로 다루는 주제 1줄 (공백 포함 30~60자 권장).
- **defaultChecked**: 기본 `false`. AI 기업 공식 계정 등 "거의 모두가 원할 법한" 소스만 `true` 제안.
- **enabled**: `true`.

## 5. 사용자 확인

다음 포맷으로 출력:

```
다음 내용으로 sources.js에 추가할게:

  id: <추론된 id>
  type: <rss|rsshub>
  <url 또는 handle/route>
  name: <추론된 name>
  category: <추론된 category>   ← 후보: ai-official, ai-media, community, tech-analyst, newsletter, influencer
  description: "<추론된 description>"
  defaultChecked: false
  enabled: true

확인 URL: <검증한 URL>
수집 테스트: HTTP 200

이대로 진행할까? (수정하고 싶은 필드 있으면 알려줘)
```

사용자가 수정 요청하면 해당 필드만 바꾼 뒤 재확인. "ok" 또는 명시적 승인이 있어야 다음 단계.

## 6. `sources.js`에 객체 추가

- 해당 `category` 그룹 섹션 끝에 삽입 (코드 가독성).
- 기존 스타일(들여쓰기·콤마)을 따른다.

## 7. 파이프라인 smoke test

```bash
source .env && node pipeline/main.js --session evening 2>&1 | grep -E '\[<name>\]|합계|실패'
```

새 소스 수집 로그 확인. 실패면 사용자에게 보고하고 원복 옵션 제시.

## 8. 커밋

```bash
git add pipeline/config/sources.js
git commit -m "$(cat <<'EOF'
feat(sources): add <name> (<id>)

<한 줄 description>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

push는 사용자가 명시적으로 요청할 때만.

## 안전장치

- `id`는 영구 불변. 기존 id 변경 요청은 거절하고 "비활성 후 새 id로 추가" 안내.
- 수집 실패한 소스는 `sources.js`에 커밋하지 않는다.
- 카테고리가 6개를 초과하게 될 때는 기존 카테고리 통합을 먼저 제안.
```

- [ ] **Step 2: `.claude/commands/remove-source.md` 작성**

```markdown
---
description: pipeline/config/sources.js에서 소스를 비활성화하거나 제거 — DB 정리 SQL은 출력만 하고 자동 실행하지 않는다.
---

# /remove-source

기존 소스를 sources.js에서 비활성 또는 제거한다. DB 파괴적 작업은 자동 실행하지 않는다.

## 1. 타겟 찾기

인자(`$ARGUMENTS`)를 `id` 또는 `name`으로 해석해 `pipeline/config/sources.js`에서 객체를 찾는다. 없으면 유사 id를 제안하고 되묻기.

## 2. 제거 방식 확인

사용자에게 출력:

```
'<id>' (<name>) 소스를 어떻게 처리할까?

A) enabled: false로 비활성화 (추천)
   - sources.js의 객체는 유지, enabled만 false로 변경
   - DB의 subscriber_sources 레코드는 그대로 (파이프라인이 자연스럽게 무시)
   - 언제든 enabled: true로 복구 가능

B) 완전 제거
   - sources.js에서 객체 삭제
   - DB cleanup SQL 출력 (자동 실행 X — 사용자가 직접 실행)

어느 쪽으로 할까?
```

## 3A. 비활성화

- 객체의 `enabled` 필드를 `false`로 바꾼다. 다른 필드는 건드리지 않는다.
- 커밋:

```bash
git add pipeline/config/sources.js
git commit -m "$(cat <<'EOF'
chore(sources): disable <name>

<비활성화 사유>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## 3B. 완전 제거

- 객체를 `sources` 배열에서 삭제.
- 사용자에게 다음 SQL 출력 (자동 실행 X):

```
DB 정리를 원하면 Turso shell에서 직접 실행:

  DELETE FROM subscriber_sources WHERE source_id='<id>';

실행 후 영향받는 구독자가 해당 소스 구독을 잃지만, 다른 소스는 그대로 유지됨.
```

- 커밋:

```bash
git add pipeline/config/sources.js
git commit -m "$(cat <<'EOF'
feat(sources): remove <name>

<제거 사유>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## 안전장치

- `id` 변경 요청은 항상 거절 (DB에 FK로 박혀있음).
- DB 쿼리는 절대 자동 실행하지 않음. 텍스트 출력만.
- 남아있는 구독자 수가 신경 쓰이면 다음 쿼리로 미리 확인 안내:
  ```
  SELECT COUNT(*) FROM subscriber_sources WHERE source_id='<id>';
  ```
```

- [ ] **Step 3: `CLAUDE.md`에 자연어 트리거 섹션 추가**

`CLAUDE.md`의 `## 자주 하는 실수 방지` 섹션 바로 앞에 다음 섹션을 추가:

```markdown
## 소스 추가/제거 자연어 처리

사용자가 자연어로 다음 패턴 중 하나로 요청하면 slash command와 동일한 절차를 실행한다.

- "<URL 또는 이름> 소스 추가해줘", "<URL> 가져와줘", "<이름> 구독 소스에 넣어줘" → `.claude/commands/add-source.md`의 절차
- "<id 또는 이름> 삭제해줘", "제거해줘", "빼줘", "비활성화해줘" → `.claude/commands/remove-source.md`의 절차

URL·핸들·대상이 불명확하면 되묻고, `id`·`category`·`description`은 자동 추론하되 사용자 승인 후에 `sources.js`를 편집한다. DB 파괴적 쿼리는 절대 자동 실행하지 않는다.

```

- [ ] **Step 4: 스모크 테스트 (선택적)**

실제로 `/add-source`를 호출해 동작을 확인하려면 테스트용 피드 URL로 한 번 시도:

```
/add-source https://hnrss.org/frontpage
```

또는 새 Claude Code 세션에서 자연어로 "hnrss.org/frontpage 소스 추가해줘". 정상이면 위 절차대로 사용자 확인 프롬프트가 뜨고, "그만" 같은 키워드로 취소 가능해야 한다.

**주의**: 이 테스트에서 실제로 sources.js에 커밋하면 Task 6과 중복이거나 불필요한 소스가 들어감. 테스트 중이라면 확인 프롬프트 단계에서 거절한다.

- [ ] **Step 5: 사용자에게 보고 + 승인 요청**

보고 내용:
- 생성한 2개 slash command 파일 경로·목적.
- `CLAUDE.md`에 추가한 자연어 트리거 섹션.
- (선택) 스모크 테스트 결과.

사용자 "ok" 승인 전에 다음 단계로 진행하지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add .claude/commands/add-source.md .claude/commands/remove-source.md CLAUDE.md
git commit -m "$(cat <<'EOF'
chore(harness): /add-source, /remove-source slash commands

사용자가 자연어 또는 slash command로 소스를 추가·제거하면 정해진 절차 (URL 검증 → 메타 추론 → 사용자 확인 → sources.js 편집 → smoke test → 커밋)를 따르도록 명시. DB 파괴적 쿼리는 자동 실행하지 않음.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 결과

### Spec coverage

| 스펙 섹션 | 구현 Task |
|-----------|----------|
| 1. 개요·목표 | 전체 |
| 2. 아키텍처 & 데이터 모델 | Task 1 (DB), Task 2·5 (파이프라인 흐름) |
| 3. 소스 레지스트리 | Task 2 (구조), Task 6 (신규 9개) |
| 4. API 엔드포인트 | Task 3 |
| 5. 파이프라인 변경점 | Task 2 (Article.sourceId, enabled), Task 5 (구독자별 루프, personalize) |
| 6. 프론트엔드 변경점 | Task 4 |
| 7. 구현 순서 (커밋 단위) | 본 플랜의 Task 1~7과 1:1 매칭 |
| 8. 하네스 자동화 | Task 7 |
| 9. 테스트·검증 계획 | 각 Task의 smoke test 단계에 분산 반영 |
| 10. 향후 단계 | 스코프 외 — 플랜 본문에 상기만 |

### Placeholder scan

"TBD", "TODO", "implement later", "fill in details" 등 → 없음. 모든 코드·명령·커밋 메시지 전문 명시.

### Type consistency

- `normalizeArticle(raw, { id, name, type })` — Task 2 정의 / Task 2의 rss.js·rsshub.js / Task 6의 rsshub.js 수정에서 일관.
- `Article.sourceId` — Task 2 정의 / Task 5 `keptItems.filter(it => subscriber.sourceIds.has(it.sourceId))`에서 일관.
- `getSubscribersWithSources()` 반환 타입 `[{ email, sourceIds: Set<string> }]` — Task 5 정의 / main.js 소비부에서 일관.
- `sendOne({ to, subject, html, session, date })` — Task 5 정의 / main.js 호출부에서 일관.
- `personalize(items, subscriber)` — Task 5 정의 / main.js 호출부에서 일관.
- `categories` map key들 (`ai-official`, `ai-media`, `community`, `tech-analyst`, `newsletter`, `influencer`) — Task 2 sources.js / Task 3 API / Task 4 SourcePicker / Task 6 신규 소스 전부 동일 키 사용.
- `source.route` (Task 6 Step 11의 신규 필드) — Task 6 Step 12에서 `threads-choi`에만 사용, 나머지 X 소스는 생략 (하위 호환).

위 일치성 확인 완료. 불일치 없음.
