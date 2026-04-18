# CLAUDE.md — Digeai

## 프로젝트 개요

**Digeai** — AI 뉴스 자동 수집 → 요약 → 이메일 발송 서비스.
GeekNews, Reddit, RSS 피드에서 AI 관련 뉴스를 수집하고 Gemini API로 요약하고 링크와 함께 매일 오전 8시, 오후 5시에 구독자에게 이메일을 발송한다.

상세 기능 요구사항은 `SPEC.md`를 먼저 읽어라.

---

## 기술 스택

- **프론트엔드**: React + Vite + Tailwind CSS
- **배포**: Netlify
- **서버리스 API**: Netlify Functions (Node.js)
- **데이터베이스**: Turso (SQLite 호환, 서버리스 클라우드 DB)
- **파이프라인**: Node.js (GitHub Actions에서 실행)
- **스케줄러**: GitHub Actions
- **AI 요약**: Google Gemini 2.5 Flash (`@google/genai`)
- **이메일 발송**: Resend

---

## 디렉토리 구조

```
project-root/
├── src/                          # React 앱
│   ├── main.jsx
│   ├── App.jsx
│   └── components/
│       ├── SubscribeForm.jsx
│       └── Toast.jsx
├── netlify/
│   └── functions/                # Netlify Functions
│       └── subscribe.js
├── pipeline/
│   ├── main.js                   # 오케스트레이터 (morning/evening)
│   ├── config/
│   │   └── sources.js            # source 레지스트리
│   ├── sources/                  # 수집 어댑터 (type별 분리)
│   │   ├── index.js              # 디스패처
│   │   ├── rss.js                # 일반 RSS
│   │   └── rsshub.js             # X (RSSHub 경유)
│   ├── lib/
│   │   ├── article.js
│   │   ├── retry.js
│   │   └── url.js
│   ├── dedup.js
│   ├── summarize.js
│   ├── render.js
│   ├── send.js
│   └── templates/
│       └── email.html
├── .github/
│   └── workflows/
│       └── newsletter.yml
├── .env.example
├── netlify.toml
├── vite.config.js
└── package.json
```

---

## 로컬 개발 환경

### 설치

```bash
npm install
```

### 프론트엔드 + Netlify Functions 동시 실행

```bash
netlify dev
```

기본 포트: http://localhost:8888
Functions 엔드포인트: http://localhost:8888/api/{function-name}

### 파이프라인 수동 실행

```bash
# 오전 세션 테스트
node pipeline/main.js --session morning

# 오후 세션 테스트
node pipeline/main.js --session evening
```

### 환경변수

`.env.example`을 복사해 `.env`로 만들고 값을 채운다. Netlify Functions 로컬 실행 시 `.env`를 자동으로 읽는다.

```
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
GEMINI_API_KEY=
RESEND_API_KEY=
VITE_API_BASE_URL=http://localhost:8888
```

---

## 코딩 컨벤션

### 공통

- 모든 파일은 영문 파일명, 컴포넌트는 PascalCase, 유틸/훅은 camelCase
- 환경변수는 절대 하드코딩하지 않는다. 반드시 `.env` 또는 GitHub Secrets에서 읽는다
- 에러는 반드시 잡아서 사용자/로그에 명확한 메시지를 남긴다

### 🔒 환경변수 / 시크릿 (반드시 준수)

> 시크릿이 브라우저 번들이나 네트워크 탭에 노출되면 즉시 도용 위험. 상세는 `SETUP.md`의 "환경변수 보안" 섹션 참조.

- **시크릿에 절대 `VITE_` prefix 금지.** Vite는 `VITE_*` 변수를 빌드 시 클라이언트 번들에 인라인한다 → DevTools에서 누구나 조회 가능.
  - 시크릿: `GEMINI_API_KEY`, `RESEND_API_KEY`, `TURSO_AUTH_TOKEN`, `TURSO_DATABASE_URL`
  - `VITE_` 허용 대상: `VITE_API_BASE_URL`처럼 어차피 공개되는 값만.
- **시크릿은 서버 측에서만 읽는다.** Netlify Functions(`netlify/functions/*`)와 GitHub Actions(`.github/workflows/*`)에서 `process.env`로 접근. React 코드(`src/`)에서 `import.meta.env`로 시크릿 접근 금지.
- **클라이언트는 외부 서비스를 직접 호출하지 않는다.** Turso·Gemini·Resend 호출은 모두 Netlify Functions를 경유. 브라우저 fetch에 시크릿이 실리지 않게.
- **에러 응답에 raw error/stack/시크릿 노출 금지.** 사용자 응답은 일반화된 문구만, 디테일은 `console.error`로 서버 로그에만.
- **Subscribe API 보호.** 이메일 형식·길이 검증, IP 기반 간단한 rate limit, CORS 화이트리스트(prod 도메인 + localhost) 필수.
- **`.env`는 `.gitignore`에 항상 포함.** `.env.example`만 커밋. 키가 실수로 노출되면 즉시 해당 서비스에서 revoke + 재발급.

### React

- 컴포넌트는 함수형만 사용한다 (클래스 컴포넌트 금지)
- 스타일은 Tailwind CSS 유틸리티 클래스만 사용한다. 별도 CSS 파일이나 인라인 style 객체 작성 금지
- API 호출은 `fetch`를 직접 사용한다. axios 등 추가 라이브러리 설치 금지

### Netlify Functions

- 파일 하나당 함수 하나
- 함수 파일명 = API 경로 (subscribe.js → /api/subscribe)
- 모든 응답은 `Content-Type: application/json` 헤더를 포함한다
- Turso 클라이언트는 함수 내부에서 매 요청마다 초기화하고, `try/finally`로 `client.close()`를 호출한다 (cold start 고려 + 커넥션 누수 방지)

### Node.js 파이프라인

- 각 단계(collect, summarize, render, send)는 독립 모듈로 분리한다
- `main.js`는 오케스트레이터 역할만 한다. 비즈니스 로직을 직접 갖지 않는다
- 외부 API 호출 실패 시 최대 3회 재시도 후 예외를 올린다
- 발송 실패한 이메일 주소는 stderr로 출력한다 (GitHub Actions 로그에서 확인 가능)
- 타임존은 항상 `Asia/Seoul` 기준으로 처리한다

---

## Netlify 설정

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

---

## GitHub Actions 스케줄

```yaml
on:
  schedule:
    - cron: '0 23 * * *'   # 오전 8시 KST
    - cron: '0 8 * * *'    # 오후 5시 KST
  workflow_dispatch:
```

`workflow_dispatch`는 반드시 유지한다. 수동 트리거로 배포 직후 테스트할 수 있다.

---

## Turso 테이블 초기화

Turso 대시보드 또는 CLI에서 아래 SQL 블록들을 순서대로 실행해 테이블을 먼저 생성한다.

```bash
# CLI로 실행하는 경우
turso db shell {DB_NAME}
```

```sql
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```sql
CREATE TABLE IF NOT EXISTS subscriber_sources (
  subscriber_id INTEGER NOT NULL,
  source_id     TEXT    NOT NULL,
  PRIMARY KEY (subscriber_id, source_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sources_source ON subscriber_sources(source_id);
```

Netlify Functions과 파이프라인 모두 `@libsql/client` 패키지로 접근한다.
`TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN`으로 인증한다.

---

## 작업 순서

새 기능을 추가하거나 버그를 수정할 때 아래 순서를 따른다.

1. `SPEC.md`에서 해당 기능의 요구사항 확인
2. 관련 파일 수정
3. 로컬에서 `netlify dev` 또는 `node pipeline/main.js` 로 직접 테스트
4. 커밋 전 `.env` 파일이 `.gitignore`에 포함되어 있는지 확인

---

## 자주 하는 실수 방지

- **시크릿에 `VITE_` prefix 붙이지 마라.** Vite가 클라이언트 번들에 그대로 인라인해 브라우저 DevTools로 노출된다. 무료 티어 도용·이메일 스팸 발송으로 직결되는 치명적 실수.
- Gemini SDK는 반드시 `@google/genai`를 사용한다. `@google/generative-ai`는 2025년 8월 31일 지원 종료된 레거시 패키지다.
- Gemini 모델은 `gemini-2.5-flash`를 사용한다.
- Netlify Functions에서 `require`로 불러오는 패키지는 반드시 `package.json`의 `dependencies`에 있어야 한다.
- GitHub Actions의 cron은 UTC 기준이다. KST(UTC+9)로 변환해서 설정한다.
- Gemini 무료 티어는 분당 RPM·일일 토큰 한도가 있다 (수치는 모델별로 변동되므로 [ai.google.dev/pricing](https://ai.google.dev/pricing)에서 최신 값 확인). 기사가 많을 경우 배치로 묶어 한 번의 요청으로 처리한다.
- Resend 무료 티어는 월 3,000건이다. 구독자 수 × 2회(하루) × 30일을 초과하지 않도록 구독자 수를 모니터링한다.
- Resend 발송 시 `idempotencyKey`를 항상 지정한다. GitHub Actions 재실행으로 인한 중복 발송을 막는다 (자세한 키 포맷은 SPEC.md 참조).
- RSSHub 공개 인스턴스(`rsshub.app`)는 X 차단·rate limit으로 빈 응답이나 500을 자주 뱉는다. 한 source 실패가 전체 파이프라인을 죽이지 않도록 `Promise.allSettled` + stderr 경고로 격리한다 (SPEC.md 디스패처 참조).
- 큐레이션된 소스만 사용하므로 AI 키워드 필터는 적용하지 않는다 (불필요한 손실 방지).
