# Digeai 기능 명세서

## 프로젝트 개요

AI 관련 뉴스를 큐레이션된 RSS 피드(회사 공식 블로그 + AI 인플루언서 X 계정 + 뉴스레터)에서 자동 수집하고 Gemini API로 요약해 매일 오전 8시, 오후 5시에 구독자 이메일로 발송하는 서비스. 서비스명은 **Digeai**, 구독은 이메일 입력 하나로만 처리한다.

---

## 기술 스택

| 역할 | 도구 | 비고 |
|------|------|------|
| 프론트엔드 | React + Vite + Tailwind CSS | |
| 배포 | Netlify | 무료 플랜 |
| 서버리스 API | Netlify Functions | Node.js 런타임 |
| 데이터베이스 | Turso | SQLite 호환, 무료 플랜 |
| 뉴스 수집/발송 파이프라인 | Node.js | GitHub Actions에서 실행 |
| 스케줄러 | GitHub Actions | cron 기반 |
| AI 요약 | Google Gemini 2.5 Flash API | 무료 티어 (RPM·일일 토큰 한도는 ai.google.dev/pricing 참조) |
| 이메일 발송 | Resend | 무료 티어: 3,000건/월 |
| 뉴스 수집 라이브러리 | rss-parser | RSS / RSSHub 둘 다 처리 |
| X(Twitter) 수집 | RSSHub 공개 인스턴스 (`rsshub.app`) | rate limit 발생 시 self-host로 이전 (코드는 URL만 변경) |

---

## 디렉토리 구조

```
project-root/
├── src/                          # React 앱
│   ├── main.jsx
│   ├── App.jsx
│   └── components/
│       ├── SubscribeForm.jsx      # 이메일 입력 폼
│       └── Toast.jsx              # 성공/실패 토스트
├── netlify/
│   └── functions/                 # Netlify Functions (서버리스 API)
│       └── subscribe.js           # POST /api/subscribe
├── pipeline/                      # Node.js 파이프라인
│   ├── main.js                    # 진입점 / 오케스트레이터 (morning / evening 인자)
│   ├── config/
│   │   └── sources.js             # source 레지스트리 (단일 진실 공급원)
│   ├── sources/                   # 수집 어댑터 (타입별 분리)
│   │   ├── index.js               # 디스패처: type → collector 매핑
│   │   ├── rss.js                 # 일반 RSS (회사 블로그 + 뉴스레터)
│   │   └── rsshub.js              # X 계정 (RSSHub 경유)
│   ├── lib/
│   │   ├── article.js             # Article 타입 + normalize
│   │   ├── retry.js               # 재시도 헬퍼 (max 3, exponential backoff)
│   │   └── url.js                 # URL 정규화 (쿼리 제거 등)
│   ├── dedup.js                   # 정규화된 URL 기반 중복 제거
│   ├── summarize.js               # Gemini (구조화 JSON 출력)
│   ├── render.js                  # 이메일 HTML 렌더링
│   ├── send.js                    # Resend 발송 (idempotencyKey)
│   └── templates/
│       └── email.html             # 이메일 템플릿
├── .github/
│   └── workflows/
│       └── newsletter.yml         # 스케줄 실행
├── CLAUDE.md
├── SPEC.md
├── package.json
├── vite.config.js
└── netlify.toml
```

---

## 데이터베이스 스키마

### subscribers 테이블

```sql
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### subscriber_sources 테이블

구독자별 선호 소스 (N:M 조인).

```sql
CREATE TABLE IF NOT EXISTS subscriber_sources (
  subscriber_id INTEGER NOT NULL,
  source_id     TEXT    NOT NULL,       -- pipeline/config/sources.js의 id
  PRIMARY KEY (subscriber_id, source_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sources_source ON subscriber_sources(source_id);
```

`source_id`는 `pipeline/config/sources.js`의 `id` 필드와 매칭되며, DB에 TEXT로만 저장된다 (sources 테이블은 없음). 폐기된 소스 id는 파이프라인이 자연스럽게 무시한다.

---

## Netlify Functions API 명세

### POST /api/subscribe

구독자 이메일 등록.

**Request body**
```json
{ "email": "user@example.com" }
```

**처리 흐름**
1. 이메일 형식 유효성 검사
2. 이메일 중복 확인
3. 이미 존재하면 409 반환
4. 신규면 INSERT 후 201 반환

**Response**
```json
// 201 신규 등록
{ "message": "구독이 완료되었습니다." }

// 409 이미 구독 중
{ "error": "이미 구독 중인 이메일입니다." }

// 400 유효성 오류
{ "error": "올바른 이메일 주소를 입력해주세요." }

// 500
{ "error": "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }
```

---

## 뉴스 수집 파이프라인

### 수집 소스

큐레이션된 소스만 사용하므로 별도 키워드 필터링 없이 **전부 수집 → 중복 제거 → 요약**.
새로운 소스 추가는 `pipeline/config/sources.js` 한 파일만 수정하면 된다.

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
| 테크 애널리스트 | the-generalist | The Generalist | rss | `https://www.generalist.com/feed` |
| 테크 애널리스트 | stratechery | Stratechery | rss | `https://stratechery.com/feed/` |
| 뉴스레터 | second-brush | Second Brush (데일리 프롬프트) | rss | `https://blog.secondbrush.co.kr/rss/` |

> X 8개는 RSSHub 경유. 공개 인스턴스(`rsshub.app`)는 X 차단으로 빈 응답이 잦으므로
> 운영 안정화 시 RSSHub self-host 필수. `docs/runbooks/rsshub-self-host.md` 참조.
> `RSSHUB_BASE_URL` 환경변수로 base 도메인 교체 가능 (코드 변경 X).

### Source 레지스트리 형식

```js
// pipeline/config/sources.js
export const sources = [
  { type: 'rss',    name: 'Anthropic', url: 'https://www.anthropic.com/news/rss.xml' },
  // ...
  { type: 'rsshub', name: 'Lucas',     handle: 'lucas_flatwhite' },
  { type: 'rsshub', name: 'Journey',   handle: 'atmostbeautiful' },
];
```

### Collector 인터페이스

모든 collector는 다음 형식의 `Article[]` 반환:

```ts
type Article = {
  source: string;            // 'Anthropic'
  sourceType: 'rss' | 'rsshub';
  title: string;
  url: string;
  publishedAt: Date;
  content?: string;          // 요약 품질용 (옵셔널)
};
```

### 디스패처 — 부분 실패 격리

```js
// pipeline/sources/index.js
const collectors = { rss, rsshub };

export async function collectAll(sources) {
  const results = await Promise.allSettled(
    sources.map(s => collectors[s.type].fetch(s))
  );
  // 실패한 source는 stderr 경고만, 나머지는 진행
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
```

### RSSHub 사용

X 계정은 RSSHub 공개 인스턴스 경유:

```
https://rsshub.app/twitter/user/{handle}
```

- 공개 인스턴스는 무료지만 X가 차단하면 빈 응답·에러 가능 → 부분 실패 격리로 흡수
- rate limit·차단이 잦아지면 self-host(Render/Railway/Fly.io)로 이전 (코드는 base URL 환경변수만 변경)
- 환경변수: `RSSHUB_BASE_URL=https://rsshub.app` (기본값)

### 중복 제거

`pipeline/lib/url.js`로 URL 정규화(소문자, 쿼리 파라미터·UTM 태그 제거, 끝 슬래시 제거) → `Set` 기반 dedup. `pipeline/dedup.js`에서 호출.

### 실행 인자

### 실행 인자

```bash
node pipeline/main.js --session morning   # 오전 발송
node pipeline/main.js --session evening   # 오후 발송
```

`morning`: 전날 오후 5시 ~ 당일 오전 8시 수집분
`evening`: 당일 오전 8시 ~ 오후 5시 수집분

수집 기간 필터는 각 기사의 `published` 필드 기준.

---

## Gemini 요약 명세

### 프롬프트 구조

```
다음은 오늘 수집된 AI 관련 뉴스 목록입니다.
각 기사를 1~2문장으로 요약하되, 기술적인 내용은 비전문가도 이해할 수 있도록 쉽게 작성해주세요.
요약 후 전체 뉴스를 관통하는 오늘의 AI 트렌드 한 줄을 마지막에 작성해주세요.

[기사 목록]
{기사 제목 + URL 목록}
```

### 구조화 출력 (필수)

응답을 안정적으로 파싱하기 위해 `responseMimeType` + `responseJsonSchema`를 반드시 사용한다.
이 옵션을 켜면 `response.text`가 스키마에 부합하는 유효 JSON임이 보장된다.

```js
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,
  config: {
    responseMimeType: 'application/json',
    responseJsonSchema: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title:   { type: Type.STRING },
              url:     { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            propertyOrdering: ['title', 'url', 'summary'],
          },
        },
        trend: { type: Type.STRING },
      },
      propertyOrdering: ['items', 'trend'],
    },
  },
});

const result = JSON.parse(response.text);
```

### 모델

`gemini-2.5-flash` (무료 티어 사용 — rate limit·일일 토큰 한도는 [ai.google.dev/pricing](https://ai.google.dev/pricing)에서 최신 수치 확인)

---

## 이메일 템플릿 명세

### 공통 구조

```
[헤더] 로고 + 발송 일시
[트렌드] 오늘의 한 줄 요약 (Gemini 생성)
[뉴스 목록] 제목 + 요약 + 원문 링크 (반복)
[푸터] 서비스명 + 발송 안내
```

### 발송 제목

```
오전: 🌅 [Digeai] {날짜} 오전 - AI 뉴스 {N}건
오후: 🌇 [Digeai] {날짜} 오후 - AI 뉴스 {N}건
```

### 중복 발송 방지

GitHub Actions 재실행 등으로 동일 세션이 두 번 트리거되어도 중복 발송이 일어나지 않도록 Resend `idempotencyKey`를 항상 지정한다.

```js
await resend.emails.send(
  { from, to, subject, html },
  { idempotencyKey: `digeai/${session}/${yyyymmdd}/${email}` },
);
```

Resend는 24시간 동안 동일 키의 요청을 캐시하므로 같은 날 같은 세션의 동일 수신자에게는 한 번만 전송된다.

---

## GitHub Actions 스케줄

```yaml
# .github/workflows/newsletter.yml

on:
  schedule:
    - cron: '0 23 * * *'   # 매일 오전 8시 KST (UTC+9)
    - cron: '0 8 * * *'    # 매일 오후 5시 KST (UTC+9)
  workflow_dispatch:         # 수동 실행 지원
```

### 실행 스텝

1. Node.js 설치
2. `npm ci`
3. `github.event.schedule` 값으로 morning/evening 분기 (workflow_dispatch는 수동 입력 또는 기본값 evening)
4. `node pipeline/main.js --session {session}`

```yaml
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Determine session
        id: session
        run: |
          if [ "${{ github.event.schedule }}" = "0 23 * * *" ]; then
            echo "name=morning" >> "$GITHUB_OUTPUT"
          else
            echo "name=evening" >> "$GITHUB_OUTPUT"
          fi
      - run: node pipeline/main.js --session ${{ steps.session.outputs.name }}
        env:
          GEMINI_API_KEY:      ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY:      ${{ secrets.RESEND_API_KEY }}
          TURSO_DATABASE_URL:  ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN:    ${{ secrets.TURSO_AUTH_TOKEN }}
```

### 필요한 GitHub Secrets

```
GEMINI_API_KEY
RESEND_API_KEY
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

---

## 랜딩페이지 UI 명세

### 구성 요소

1. 서비스명 + 한 줄 소개
2. 발송 주기 안내 문구: "매일 오전 8시, 오후 5시에 AI 소식을 전달합니다"
3. 이메일 입력 필드 + 구독하기 버튼
4. 구독 완료/오류 토스트 메시지

### 상태 처리

| 상태 | 처리 |
|------|------|
| 입력값 없음 | 버튼 비활성화 |
| 이메일 형식 오류 | 인라인 오류 메시지 |
| 제출 중 | 버튼 로딩 스피너 |
| 성공 | 토스트: "구독이 완료되었습니다 🎉" |
| 이미 구독 | 토스트: "이미 구독 중인 이메일입니다" |
| 서버 오류 | 토스트: "잠시 후 다시 시도해주세요" |

---

## 환경변수 목록

### Netlify 환경변수 (Functions용)

```
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

### GitHub Secrets (Actions용)

```
GEMINI_API_KEY
RESEND_API_KEY
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

(`RSSHUB_BASE_URL`은 기본값 `https://rsshub.app`을 코드에서 fallback으로 처리. self-host로 옮길 때만 secret 추가.)

### 로컬 개발 (.env)

```
# 클라이언트 노출 가능한 값만 VITE_ prefix
VITE_API_BASE_URL=http://localhost:8888

# 서버 전용 시크릿 (절대 VITE_ 금지)
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
GEMINI_API_KEY=
RESEND_API_KEY=

# 선택: RSSHub 호스트 (기본값 https://rsshub.app)
RSSHUB_BASE_URL=
```

---

## Node.js 패키지 목록

```
rss-parser        # RSS 수집
@google/genai     # Gemini AI 요약 (신규 공식 SDK)
resend            # 이메일 발송
@libsql/client    # Turso DB
dotenv            # 환경변수
```

> `@google/generative-ai`는 2025년 8월 31일 지원 종료된 레거시 패키지. 반드시 `@google/genai`를 사용할 것.

---

## 개발 순서 권장

1. Turso 계정 생성 → DB 생성 → 테이블 초기화
2. Netlify Functions (subscribe) 구현 및 로컬 테스트 (`netlify dev`)
3. React 랜딩페이지 구현
4. Netlify 배포 및 환경변수 설정
5. Node.js 파이프라인 구현 — 모듈 단위로 진행:
   1. `lib/` (article, url, retry) — 순수 함수, 단위 테스트 쉬움
   2. `sources/rss.js` — 회사 블로그 1개로 먼저 검증
   3. `sources/rsshub.js` — Lucas/Journey 1개로 먼저 검증
   4. `sources/index.js` 디스패처 + `config/sources.js` 레지스트리
   5. `dedup.js`
   6. `summarize.js` (Gemini 구조화 JSON)
   7. `render.js` + 이메일 템플릿
   8. `send.js` (Resend + idempotencyKey)
   9. `main.js` 오케스트레이터로 묶기
6. 로컬에서 파이프라인 수동 실행 테스트
7. GitHub Actions 워크플로우 설정 및 수동 트리거 테스트
