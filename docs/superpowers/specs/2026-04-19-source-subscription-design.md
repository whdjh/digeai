# 소스별 체크박스 구독 기능 — 설계 스펙

- **작성일**: 2026-04-19
- **대상 브랜치**: `main` (단일 브랜치, 커밋 단위 진행)
- **관련 문서**: `CLAUDE.md`, `SPEC.md`

---

## 1. 개요

홈페이지 구독 폼에서 수집 소스를 개별 체크박스로 선택할 수 있도록 하고, 파이프라인이 구독자별 선호에 맞춰 개인화 발송한다. 신규 소스 9개를 추가해 총 20개 소스를 MVP로 확정한다. Claude Code 하네스에 `/add-source`·`/remove-source` slash command를 붙여 자연어 소스 관리 자동화를 제공한다.

### 목표

1. 구독자가 본인이 원하는 소스만 골라 구독할 수 있다.
2. 소스 추가/제거가 단일 파일 수정과 slash command 한 번으로 끝난다.
3. 기존 파이프라인 안정성(공용 Gemini 요약, 노이즈 필터, 다양성 보장)을 유지한다.
4. 미래 유료 티어(`plan = 'pro'`) 진입 시 최소 변경으로 개인화 요약을 켤 수 있다.

### 비목표 (YAGNI)

- 관리 페이지(선호 변경) 구현 — 성공 후 별도 단계 B에서 진행.
- 결제 시스템 연동 — 유료 기능 실구현 시점에 결정.
- 자동화된 테스트 도입 — MVP 범위 외, 수동 smoke test로 충분.

### 핵심 의사결정 요약

| 주제 | 결정 |
|------|------|
| 선호 변경 UX | D(변경 불가)로 시작, 성공 시 B(이메일 토큰 관리 링크) 도입 |
| 최소 체크 개수 | 1개 필수 (프론트·백엔드 둘 다 검증) |
| DB 방식 | 조인 테이블 `subscriber_sources` (정규화) |
| 파이프라인 개인화 | 요약·트렌드는 공용, 렌더링만 구독자별 필터 |
| 요약 유지 여부 | 유지 (일상 트윗 필터링에 `engineeringRelevance` 필요) |
| 유료 전환 경로 | `personalize(items, subscriber)` 훅만 남기고 MVP엔 identity 반환 |
| 소스 메타 위치 | `pipeline/config/sources.js` 단일 파일 (단일 진실 공급원) |
| 브랜치 전략 | `main` 직접 작업, 커밋 단위 순차 구현 |
| MVP 소스 수 | 20개 (기존 11 + 신규 9) |
| 기존 구독자 처리 | 0명 취급, 마이그레이션 불필요 |
| 배포 방식 | 로컬 검증 + 사용자 승인 → 커밋 → push (롤백 전제 없음) |

---

## 2. 아키텍처 & 데이터 모델

### 데이터 흐름

```
[프론트엔드]
  GET /api/sources  ──►  sources.js public 필드 (id, name, category, description)
  POST /api/subscribe  ──►  { email, source_ids: [...] }
                             │
                             ▼
[Netlify Functions]
  ① 이메일 유효성 + capacity + rate limit
  ② source_ids 검증 (sources.js의 enabled=true id 집합 매칭)
  ③ 트랜잭션: subscribers INSERT + subscriber_sources 복수 INSERT
                             │
                             ▼
[Turso DB]  subscribers  1 ──N  subscriber_sources

[파이프라인 (GitHub Actions)]
  수집 → dedup → 노이즈필터 → 윈도우 → 다양성 → 요약 → relevance필터
    │
    ├─► getSubscribersWithSources() — JOIN 1회
    │     return [{ email, sourceIds: Set<string> }]
    │
    ├─► personalize() — 유료 전환 훅 (MVP는 identity)
    │
    └─► 구독자별 루프: 본인 sourceIds에 맞는 기사만 필터 → 렌더 → 발송
```

### DB 스키마

```sql
-- 기존 (변경 없음)
CREATE TABLE subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 신규
CREATE TABLE IF NOT EXISTS subscriber_sources (
  subscriber_id INTEGER NOT NULL,
  source_id     TEXT    NOT NULL,       -- sources.js의 slug
  PRIMARY KEY (subscriber_id, source_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sources_source ON subscriber_sources(source_id);
```

### 무결성 정책

- **sources 테이블 없음** — `pipeline/config/sources.js`가 단일 진실 공급원. DB에 `source_id` TEXT로만 저장.
- **유효성 검증은 앱 계층**:
  - subscribe API에서 요청의 `source_ids`가 `sources.js`의 `enabled: true` id와 매칭되는지 확인.
  - 파이프라인은 `sources.js`의 현재 활성 소스 목록만 보고 필터 → 폐기된 `source_id`가 DB에 남아도 자연스럽게 무시됨.
- **소스 제거 시나리오**:
  - 1순위: `enabled: false`로 마킹. DB 레코드 방치해도 안전.
  - 완전 제거 필요 시: 일회성 SQL `DELETE FROM subscriber_sources WHERE source_id='xxx'`.

### 확장성 포인트

- **새 소스 추가** = `sources.js`에 객체 1개 추가 (+ 새 수집 타입이면 `pipeline/sources/{type}.js` 파일 1개).
- **새 수집 타입 추가** = 파일 1개 + `pipeline/sources/index.js`의 `collectors` 맵에 1줄.
- **관리 페이지(B)** = `subscribers.manage_token TEXT UNIQUE` 컬럼 1개 `ALTER TABLE`. 현재 구조와 충돌 없음.
- **유료 티어** = `subscribers.plan TEXT NOT NULL DEFAULT 'free'` 컬럼 1개 + `personalize()` 내부 분기 구현. 시그니처 변경 없음.

---

## 3. 소스 레지스트리 (`pipeline/config/sources.js`)

### 자료구조

```js
// pipeline/config/sources.js

export const categories = {
  'ai-official':  { label: 'AI 기업 공식', order: 1 },
  'ai-media':     { label: 'AI·테크 미디어', order: 2 },
  'community':    { label: '커뮤니티', order: 3 },
  'tech-analyst': { label: '테크 애널리스트', order: 4 },
  'newsletter':   { label: '뉴스레터·PM', order: 5 },
  'influencer':   { label: '인플루언서', order: 6 },
}

export const sources = [
  {
    id: 'openai',                             // stable slug (DB·API 키) — 영구 불변
    type: 'rsshub',                           // 어댑터 타입
    handle: 'OpenAI',                         // type=rsshub 전용
    // url: '...',                            // type=rss 전용
    name: 'OpenAI',                           // UI 표시명
    category: 'ai-official',
    description: 'OpenAI 공식 발표·제품 뉴스',
    defaultChecked: true,                     // 첫 가입 폼 기본 체크 여부
    enabled: true,                            // 일시 비활성 (수집·UI 둘 다 스킵)
  },
  // ... 20개
]
```

### 필드 책임 분리

| 필드 | 수집용 | UI용 | DB 키 |
|------|:---:|:---:|:---:|
| `id` | | | ✅ |
| `type`, `url`, `handle` | ✅ | | |
| `name`, `description`, `category`, `defaultChecked` | | ✅ | |
| `enabled` | ✅ | ✅ | |

`/api/sources`는 `{id, name, category, description, defaultChecked}` + `categories`만 반환. `type`/`handle`/`url`은 내부 인프라 정보이므로 절대 공개하지 않는다.

### 규칙

- **id는 영구 불변** — 한 번 배포 후 리네임 금지. 변경이 필요하면 `enabled: false` 후 새 id로 추가.
- **슬러그 컨벤션**: 소문자, 하이픈 구분 (`reddit-claudecode`, `hn`, `benedict-evans`, `stratechery`, `second-brush`).
- **카테고리 한도**: 6개로 제한. 초과 시 먼저 기존 카테고리 통합부터 고려.

### MVP 20개 카테고리 분류

| 카테고리 | 소스 (id) |
|---------|----------|
| **ai-official** | openai, openai-devs, google-ai, claude, claude-code |
| **ai-media** | geeknews, hn, techmeme |
| **community** | reddit-claudecode, threads-choi |
| **tech-analyst** | benedict-evans, platformer, the-generalist, stratechery |
| **newsletter** | lennys, sandhill, chamath, second-brush |
| **influencer** | lucas, journey |

신규 9개: `hn`, `techmeme`, `reddit-claudecode`, `threads-choi`, `benedict-evans`, `platformer`, `the-generalist`, `stratechery`, `second-brush`.

### 후속 보류 소스

다음은 구현 난이도·안정성 이슈로 MVP에서 제외, 추후 별도 커밋으로 검토:

- Instagram (DIO, `@dio_work`) — RSSHub Instagram 라우트 불안정
- LinkedIn (정민) — RSSHub auth cookie 요구
- DCinside 특이점 갤러리 — RSS 없음, 커스텀 스크래퍼 필요
- Maily (조쉬 뉴스레터) — RSS 지원 여부 확인 필요
- Decoder 팟캐스트 — 본문 품질(쇼노트 수준) 검토 필요

---

## 4. API 엔드포인트

### GET /api/sources (신규)

**파일**: `netlify/functions/sources.js`

**Response 200**
```json
{
  "categories": {
    "ai-official":  { "label": "AI 기업 공식", "order": 1 },
    "ai-media":     { "label": "AI·테크 미디어", "order": 2 }
  },
  "sources": [
    {
      "id": "openai",
      "name": "OpenAI",
      "category": "ai-official",
      "description": "OpenAI 공식 발표·제품 뉴스",
      "defaultChecked": true
    }
  ]
}
```

- `enabled: false`는 응답에서 제외.
- `type`, `handle`, `url` 등 수집 인프라 필드는 응답에 **절대 포함하지 않음**.
- CORS: 기존 subscribe와 동일 화이트리스트.
- 캐싱: `Cache-Control: public, max-age=300` (5분).

### POST /api/subscribe (수정)

**Request body**
```json
{
  "email": "user@example.com",
  "source_ids": ["openai", "claude-code", "lennys"]
}
```

**검증 (기존 + 신규)**
- 이메일 형식·길이 (기존 유지).
- `source_ids`: 배열, 길이 ≥ 1, 각 요소가 `sources.js`의 `enabled: true` id 집합에 포함.
- 중복은 Set으로 정리 (클라이언트 실수 허용).

**처리 흐름**
1. CORS preflight → rate limit → 이메일 검증 → `source_ids` 검증
2. capacity 체크 (기존)
3. 트랜잭션 (libsql `client.batch()`):
   - `INSERT INTO subscribers(email) VALUES (?)` → `lastInsertRowid`
   - `INSERT INTO subscriber_sources(subscriber_id, source_id) VALUES (?, ?)` × N
   - 중간 실패 시 전부 롤백.

**Response**
| Status | Body | 의미 |
|--------|------|------|
| 201 | `{ "message": "구독이 완료되었습니다." }` | 성공 |
| 400 | `{ "error": "..." }` | 이메일/소스 검증 실패 |
| 403 | `{ "error": "구독자가 모두 찼습니다..." }` | capacity 초과 |
| 409 | `{ "error": "이미 구독 중인 이메일입니다." }` | 이메일 중복 |
| 429 | `{ "error": "요청이 너무 많습니다..." }` | rate limit |
| 500 | `{ "error": "서버 오류..." }` | 그 외 |

에러 메시지에 `source_id` 상세, DB 에러, 스택 트레이스 **노출 금지** (CLAUDE.md 보안 섹션).

### 후속 단계(B) API — 예고

- `GET  /api/subscription?token=xxx` — 본인 선호 조회
- `PUT  /api/subscription?token=xxx` — 선호 갱신
- `POST /api/unsubscribe?token=xxx` — 해지

MVP 구현 범위 외.

---

## 5. 파이프라인 변경점

### 새 흐름 (`pipeline/main.js`)

```
env 검증
  ↓
collectAll(enabledSources)                       ← sources.js의 enabled=true만
  ↓
dedup → filterNoise → 세션 윈도우 → diversify
  ↓
summarize (Gemini 공용 1회)
  ↓
relevance 임계값 필터 → keptItems (sourceId 포함)
  ↓
getSubscribersWithSources()                      ← email + sourceIds Set JOIN 조회
  ↓
for each subscriber:
  myItems = keptItems.filter(it => subscriber.sourceIds.has(it.sourceId))
  if (myItems.length === 0) continue             ← 본인 소스 기사 0건이면 발송 스킵
  personalized = personalize(myItems, subscriber) ← 유료 전환 훅 (MVP는 identity)
  { subject, html } = renderEmail({ session, date, items: personalized, trend })
  await sendOne({ to: subscriber.email, subject, html, session, date })
```

### 변경 파일

| 파일 | 변경 |
|------|------|
| `pipeline/config/sources.js` | 필드 확장 + `categories` export |
| `pipeline/sources/index.js` | `enabled: true` 필터링 후 collect |
| `pipeline/sources/rss.js`, `rsshub.js` | `normalizeArticle`에 `source.id` 전달 |
| `pipeline/lib/article.js` | `Article.sourceId` 필드 추가 |
| `pipeline/send.js` | `getSubscribers()` → `getSubscribersWithSources()`, `sendOne()` 분리 |
| `pipeline/personalize.js` **(신규)** | `export function personalize(items, subscriber) { return items }` — identity |
| `pipeline/main.js` | 구독자별 루프·개인화 호출·발송 집계 |

### Article 타입 확장

```ts
type Article = {
  sourceId: string;         // 신규 — 구독자별 필터링 키 (sources.js의 id)
  source: string;           // 기존 유지 — UI 표시명
  sourceType: 'rss' | 'rsshub';
  title: string;
  url: string;
  publishedAt: Date;
  content?: string;
  // summarize 후 주입:
  summary?: string;
  engineeringRelevance?: number;
}
```

### send.js 인터페이스

```js
// 기존 getSubscribers() 제거
export async function getSubscribersWithSources() {
  // SELECT s.email, ss.source_id FROM subscribers s
  // JOIN subscriber_sources ss ON s.id = ss.subscriber_id
  // → [{ email, sourceIds: Set<string> }]
}

export async function sendOne({ to, subject, html, session, date }) {
  // 1명 발송 + idempotencyKey (기존 포맷 유지)
}
```

발송 pool(동시성 5)은 `main.js`에서 구독자 배열에 대해 실행.

### 기존 보존 요소

- `idempotencyKey` 포맷 `digeai/${session}/${kstYYYYMMDD}/${email}` — 변경 없음. 재실행 안전성 유지.
- `filterNoise`, `diversify`, `engineeringRelevance` 필터 — 유지.
- `summarize.js` — 유지 (공용 1회 호출).

### 유료 전환 훅

```js
// pipeline/personalize.js — MVP 구현
export function personalize(items, subscriber) {
  // 유료 전환 시 여기서 subscriber.plan 체크 후 Gemini 재호출로 교체.
  return items
}
```

교체 포인트 1곳. 시그니처 변경 없이 확장.

---

## 6. 프론트엔드 변경점

### 컴포넌트 구조

```
App.jsx                      ← sources fetch + 상태 hoist
├── SubscribeForm.jsx        ← 이메일 input + submit + 제출 로직
│    └── SourcePicker.jsx (신규)  ← 카테고리별 체크박스 리스트
└── Toast.jsx                ← 변경 없음
```

### 데이터 흐름

```
App.mount
  → fetch /api/sources → { categories, sources }
  → initialSelected = new Set(sources.filter(s => s.defaultChecked).map(s => s.id))

<SubscribeForm sources categories initialSelected ... />
  → <SourcePicker sources categories selected={selected} onChange={setSelected} />
  → onSubmit: POST /api/subscribe { email, source_ids: [...selected] }
```

### SourcePicker API

```jsx
<SourcePicker
  categories={{ 'ai-official': { label, order }, ... }}
  sources={[ { id, name, category, description, defaultChecked }, ... ]}
  selected={Set<string>}
  onChange={(newSet) => void}
  disabled={boolean}   // 제출 중
/>
```

렌더 구조: `categories.order`로 정렬된 섹션, 각 섹션 안에서 소스 `name` 등록순 정렬.

### 상태·검증

- **선택 상태**: `Set<string>` (id 기준). `toggle(id)`은 `new Set` 복제 후 add/delete.
- **submit 검증**:
  - 이메일 유효성 (기존).
  - `selected.size === 0` → 인라인 경고 "최소 1개 이상 선택해주세요" + submit 버튼 `disabled`.
- **로딩 상태**:
  - `/api/sources` 응답 전 — 스켈레톤 + 폼 전체 `disabled`.
  - `/api/sources` 실패 — 에러 토스트 + 재시도 버튼.

### 기본 체크 정책

- `defaultChecked: true` 소스만 초기 체크 (안전한 기본값: AI 기업 공식 5개 추천).
- 유저가 즉시 submit해도 의미 있는 구독 구성.

### 스타일·접근성

- 기존 다크 에디토리얼 글래스 톤 유지 (`5d9a3ed` 커밋 반영).
- 체크박스: 커스텀 Tailwind, 체크 시 앰버 배경.
- 카테고리 제목: `<h3>` (sr-only 아님) — 스크린리더 탐색 가능.
- 선택 개수 live region: `aria-live="polite"`.
- submit 비활성 사유: `aria-describedby`로 버튼에 연결.
- 모든 체크박스 `<label htmlFor>` 연결, label 전체가 클릭 영역.

---

## 7. 구현 순서 (커밋 단위)

`main` 브랜치 직접 작업. **각 커밋 전 사용자 승인 체크포인트 필수**.

### 체크포인트 워크플로우

```
[커밋 N 착수]
  ├─ 1. 변경 구현 (파일 수정)
  ├─ 2. 로컬 smoke test 실행 (netlify dev / node pipeline/main.js)
  ├─ 3. 결과를 사용자에게 보고
  ├─ 4. 사용자가 확인 + "ok" 승인
  ├─ 5. git commit
  └─ 6. git push   ← Netlify 자동 배포 트리거
```

커밋은 이미 로컬 검증 + 사용자 확인 통과한 상태에서만 push됨. **프로덕션 장애 전제 없음**.

### 커밋 순서 (7개)

| # | 커밋 제목 | 변경 파일 | 배포 후 상태 |
|---|----------|----------|------------|
| **1** | `feat(db): subscriber_sources 테이블 + 인덱스` | Turso SQL 실행 + `SPEC.md`·`CLAUDE.md` DB 섹션 업데이트 | 빈 테이블 생성. 기존 API/파이프라인 영향 0 |
| **2** | `refactor(sources): sources.js 구조 확장 + Article.sourceId` | `pipeline/config/sources.js`, `pipeline/lib/article.js`, `pipeline/sources/{rss,rsshub,index}.js` | 파이프라인이 `enabled=true`만 수집, Article에 `sourceId` 포함. 기존 동작 동일 |
| **3** | `feat(api): GET /api/sources + POST /api/subscribe source_ids 필수` | `netlify/functions/sources.js` (신규), `subscribe.js` 수정 | 새 API 공개. subscribe는 `source_ids[]` 검증·트랜잭션 INSERT |
| **4** | `feat(ui): SourcePicker 체크박스 구독 폼` | `src/App.jsx`, `src/components/SubscribeForm.jsx`, `src/components/SourcePicker.jsx` (신규) | 홈페이지 체크박스 구독 활성. 커밋 3과 같은 날 연달아 배포 필수 |
| **5** | `feat(pipeline): 구독자별 개인화 발송 + personalize 훅` | `pipeline/send.js`, `pipeline/personalize.js` (신규), `pipeline/main.js` | 파이프라인이 구독자별 sourceIds 기반 필터링·발송 |
| **6** | `feat(sources): 신규 9개 소스 추가 (Reddit·HN·Techmeme·Substack·Threads)` | `pipeline/config/sources.js` (객체 9개 append) | 수집 소스 11 → 20개 |
| **7** | `chore(harness): /add-source, /remove-source slash commands` | `.claude/commands/add-source.md`, `remove-source.md`, `CLAUDE.md` 자연어 트리거 규칙 | 자연어로 소스 관리 가능 |

### 배포 간 일시 불일치 구간

- **커밋 3 직후 ~ 커밋 4 배포 전**: 프론트는 아직 이메일만 보내는데 API는 `source_ids` 필수 → 구독 실패.
- **대응**: 커밋 3과 4를 **같은 push 묶음에 연달아** 커밋. Netlify는 가장 최근 빌드를 배포하므로 둘이 한 배포 사이클에 들어감.
- **커밋 4 배포 ~ 커밋 5 배포 전**: 신규 가입자의 `source_ids`는 DB에 저장되나 파이프라인이 아직 무시 → 해당 구독자가 전 소스 이메일 수신. 일시적. 현재 구독자 본인 1명뿐이라 실질 영향 없음.

### 하위 호환성 원칙

- DB 스키마 **추가만**, 삭제·컬럼 타입 변경 없음.
- `sources.js`의 기존 필드(`type`, `name`, `url`, `handle`) 유지 — 확장만.
- `Article` 타입은 기존 필드 보존, `sourceId`만 추가.
- idempotencyKey 포맷 그대로 — 재실행 안전성 유지.

---

## 8. 하네스 자동화

### 목적

사용자가 Claude Code에 `"<X 소스 추가해줘>"` / `"<Y 삭제해줘>"` 자연어로 말하거나 slash command를 호출하면, 정해진 절차대로 `sources.js`를 편집·검증·커밋한다.

### `/add-source <URL 또는 핸들>`

**파일**: `.claude/commands/add-source.md`

**절차**:
1. **인자 파싱** — URL·핸들 문자열 받기.
2. **수집 타입 판정**:
   | 입력 | type | 파라미터 |
   |------|------|---------|
   | `twitter.com/{u}` or `@{u}` + X 맥락 | `rsshub` | `handle` |
   | `threads.com/@{u}` | `rsshub` | `threads` route |
   | `instagram.com/{u}` | `rsshub` | `instagram` route |
   | `reddit.com/r/{sub}` | `rss` | `url` = `reddit.com/r/{sub}/.rss` |
   | `news.ycombinator.com` | `rss` | 고정 URL |
   | 그 외 일반 URL | `rss` | `url` + `/feed`·`/rss` 후보 자동 탐지 |
3. **실제 수집 시험** — `curl -sS -o /dev/null -w "%{http_code}"`로 200 확인. 실패 시 `/feed`, `/rss`, `/atom.xml` 순 재시도.
4. **id slug 추천** — 도메인·핸들에서 자동 생성 (`reddit-claudecode`, `benedict-evans` 등).
5. **유저 확인 프롬프트**:
   ```
   다음 내용으로 추가할게:
     id: reddit-claudecode
     type: rss
     url: https://www.reddit.com/r/ClaudeCode/.rss
     name: r/ClaudeCode
     category: community
     description: Claude Code 실전 사용 후기·팁
     defaultChecked: false
   이대로 진행?
   ```
6. **승인 시**:
   - `pipeline/config/sources.js`에 객체 추가 (해당 카테고리 그룹 끝에 삽입).
   - 로컬 smoke test: `node pipeline/main.js --session evening` 로그에서 `[{name}] 수집: N건` 확인.
   - 커밋 메시지: `feat(sources): add {name} ({id})`.

### `/remove-source <id 또는 name>`

**파일**: `.claude/commands/remove-source.md`

**절차**:
1. **타겟 찾기** — `sources.js`에서 조회. 없으면 비슷한 id 제안.
2. **제거 방식 확인**:
   ```
   '{id}' 소스를 어떻게 처리할까?
     A) enabled: false로 비활성 (DB 레코드 유지) — 추천
     B) 완전 제거 + DB cleanup SQL 안내 출력
   ```
3. **A 선택 시**: 객체 `enabled: false` 수정 → 커밋 `chore(sources): disable {name}`.
4. **B 선택 시**: 객체 삭제 → 유저에게 Turso 실행 SQL 출력 (자동 실행 X) → 커밋 `feat(sources): remove {name}`.

### `CLAUDE.md` 자연어 트리거 추가

```md
## 소스 추가/제거 자연어 처리

사용자가 "X 소스 추가해줘" / "Y 삭제·제거·빼줘" 같은 자연어로 요청하면
각각 `.claude/commands/add-source.md`, `.claude/commands/remove-source.md`의
절차를 그대로 따른다. URL·핸들이 불명확하면 되묻기.
```

### 안전장치

- **DB 파괴적 작업은 절대 자동 실행 금지** — `DELETE FROM subscriber_sources` 같은 쿼리는 사용자에게 SQL 출력만.
- **id 변경은 불가** — "id 수정" 요청이 와도 거부. "비활성 후 새 id로 추가"만 안내.
- **커밋 전 smoke test 필수** — 수집 실패한 소스는 `sources.js`에 들어가면 안 됨.
- **사용자 확인 프롬프트 필수** — id/category/description은 자동 추론이지만 사용자 승인 후에만 편집.

### `.claude/settings.json` 권한 조정 (적용 완료)

**변경 요약**:
- `ask: []` — 작업 중 확인 프롬프트 제거 (사용자 요구).
- `allow` 추가: `Bash(curl:*)`, `Bash(source:*)`, `Bash(echo:*)` — slash command 지원.
- `deny` 추가: `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(git reset --hard:*)`, `Bash(git branch -D:*)`, `Bash(npm publish:*)` — 파괴적 작업 원천 차단.
- `.env` 읽기·쓰기 deny 유지 (시크릿 보호).
- `scan-vite-secrets.sh` pre-hook 유지 (Write/Edit 시 자동 검증).

---

## 9. 테스트·검증 계획

### 커밋별 검증 명령

| # | 검증 스텝 | 기대 결과 |
|---|----------|----------|
| 1 | `turso db shell {DB}` → `.schema subscriber_sources` | 테이블·인덱스 존재 |
| 2 | `node pipeline/main.js --session evening` | 수집 건수 기존과 동일, 각 Article에 `sourceId` 포함 |
| 3 | `curl localhost:8888/api/sources` → JSON / `curl -X POST /api/subscribe -d '{"email":"t@t.com"}'` → 400 | sources API 200, subscribe `source_ids` 없이 400 |
| 4 | `netlify dev` → 체크박스 UI 확인 → 실제 구독 → `SELECT * FROM subscriber_sources WHERE subscriber_id=?` | 선택한 source_id N개 저장 |
| 5 | 로컬 `node pipeline/main.js --session evening` → 이메일 HTML | 본인 체크 소스 기사만 포함 |
| 6 | `node pipeline/main.js` 로그에 `[Reddit r/ClaudeCode] 수집: N건` 등 | 신규 9개 소스에서 각 1건 이상 수집 |
| 7 | `/add-source https://www.reddit.com/r/LocalLLaMA/` | sources.js 객체 추가 + smoke test 통과 |

### 자동화 테스트

MVP 범위 외. 수동 검증만 수행. 향후 Vitest 도입 시 우선순위:
- `pipeline/lib/article.js` `normalizeArticle` (순수 함수).
- `pipeline/dedup.js`.
- `subscribe.js` 엔드포인트 — `source_ids` 검증 로직 (유효·빈·알 수 없는 id 케이스).

### 수동 smoke test 체크리스트 (MVP 배포 후)

- [ ] 기존 본인 레코드 삭제 (Turso shell).
- [ ] 배포된 사이트에서 체크박스 1개만 골라 재구독.
- [ ] `subscriber_sources`에 source_id 1개 기록 확인.
- [ ] `workflow_dispatch`로 `evening` 세션 수동 트리거.
- [ ] 수신 이메일이 선택한 1개 소스 기사로만 구성.
- [ ] 비선택 소스 기사 섞여있지 않음 확인.

### 관찰 지표

- GitHub Actions 로그: 수집 건수·dedup·발송 성공/실패.
- Resend 대시보드: 발송 수·bounce율.
- Turso 대시보드: 쿼리 지연·커넥션 수.
- Netlify Functions 로그: `/api/subscribe`·`/api/sources` 호출량.

### 배포·롤백 전략

- 각 커밋은 로컬 smoke test + 사용자 승인 통과 후에만 `git push`.
- `git push` 직후 Netlify 자동 배포.
- 배포 후 이상 발견 시 → 다음 커밋을 `fix` 커밋으로 push (forward fix).
- DB 스키마는 추가만 — 이전 코드 버전으로 되돌려도 기존 동작 유지 (하위 호환).

---

## 10. 향후 단계 (스코프 외)

### 단계 B — 관리 페이지

**트리거**: MVP가 안정적으로 운영되고 구독자 복수가 확보된 후.

**구현**:
- `subscribers.manage_token TEXT UNIQUE` 컬럼 추가.
- 이메일 발송 시 하단에 `/manage?token=xxx` 링크 자동 삽입.
- `GET /api/subscription?token=...` / `PUT /api/subscription?token=...` / `POST /api/unsubscribe?token=...` 엔드포인트.
- 관리 페이지 React 라우트: 체크박스 재렌더링, 선호 갱신.

**추가 비용**: 0원 (Netlify Functions 무료 티어, Turso 컬럼 1개, Resend 호출 수 변동 없음).

### 단계 C — 유료 티어 (pro plan)

**트리거**: 구독자 수·요구 검증 후.

**구현**:
- `subscribers.plan TEXT NOT NULL DEFAULT 'free'` 컬럼 추가.
- 결제 연동 (Stripe/Toss/Paddle 중 선택).
- `personalize()` 내부에 `subscriber.plan === 'pro'`면 Gemini 재호출로 개인화 요약·트렌드 생성.
- 관리 페이지에서 plan 변경·결제 UI.

**비용**: 결제 수수료 (Stripe 2.9% + $0.30 등), 초기 고정비 0원.

### 단계 D — 추가 소스 (RSSHub 난이도 높은 것)

MVP에서 보류한 소스들을 순차적으로 커밋 추가:
- Instagram (DIO) — RSSHub Instagram 라우트 안정화.
- LinkedIn (정민) — RSSHub auth cookie 설정.
- DCinside (특이점 갤러리) — 커스텀 스크래퍼 `pipeline/sources/dcgall.js` 신규.
- Maily (조쉬) — RSS 지원 확인 후.
- Decoder 팟캐스트 — 쇼노트 파싱.

각 소스는 `/add-source` slash command로 자연스럽게 처리.

---

## 부록: 결정 이유 기록

| 결정 | 대안 | 기각 사유 |
|------|------|-----------|
| 조인 테이블 사용 | JSON 컬럼 | 구독자별 필터링·집계 쿼리 품질 우선 |
| 공용 요약 유지 | 구독자별 요약 | 무료 티어 한도, 요약 품질 |
| 공용 요약 + relevance 필터 유지 | 요약 제거 | 일상 트윗 섞임 위험 치명적 |
| `sources.js` 단일 파일 | 백엔드·UI 파일 분리 | 소스 추가 시 동기화 부담 |
| `main` 직접 작업 | feature 브랜치 | 혼자 개발 + 커밋 단위 순차 배포로 안전 |
| 자동 테스트 없음 | Vitest 도입 | MVP 범위, 수동 smoke test로 충분 |
| `ask: []` | 보수적 ask 유지 | 작업 흐름상 프롬프트 과다, 안전망은 deny로 보완 |
