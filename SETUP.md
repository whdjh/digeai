# Digeai 프로젝트 셋업 가이드

Claude Code 시작 전에 아래 순서대로 외부 서비스를 먼저 세팅한다.
모든 키는 수집한 뒤 한 번에 입력한다.

---

## 1. GitHub 레포 생성

> **이 프로젝트는 Public(오픈소스)으로 공개한다.** 단, 키 노출 사고를 막기 위해 아래 1-A 단계의 시크릿 차단 장치를 **반드시** 함께 설정한다.

1. github.com → New repository
2. Repository name: `digeai`
3. **Public** 선택
4. Create repository
5. 로컬에 클론

```bash
git clone https://github.com/{username}/digeai.git
cd digeai
```

---

## 1-A. 시크릿 차단 장치 (Public 레포 필수 세팅)

Public 레포에서 키가 잠깐만 노출돼도 봇이 GitHub 전역을 스캔해 수 분 내 도용한다. 아래 장치를 **모두** 적용해 다중 방어한다.

### (1) `.gitignore`에 환경 파일 패턴 등록

레포 루트 `.gitignore`에 다음 패턴이 반드시 포함되어야 한다.

```gitignore
# 환경변수
.env
.env.*
!.env.example

# Netlify
.netlify/
```

`.env.example`은 값 비운 채로 커밋해 다른 기여자가 어떤 키가 필요한지 알 수 있게 한다.

### (2) GitHub Secret Scanning + Push Protection 활성화

GitHub은 Public 레포에 무료로 제공한다. **반드시 켤 것.**

1. 레포 → **Settings → Code security**
2. **Secret scanning** → Enable
3. **Push protection** → Enable
   - 이걸 켜면 알려진 시크릿 패턴(GitHub/AWS/Google/Resend 등)이 push될 때 **GitHub이 push 자체를 거부**한다. 가장 강력한 마지막 방어선.

### (3) 로컬 pre-commit 훅 — gitleaks

push 전에 로컬에서 시크릿을 잡는다.

```bash
# Mac 설치
brew install gitleaks

# 프로젝트 루트에 .pre-commit-config.yaml 생성
```

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks
```

```bash
# pre-commit 프레임워크 설치 (한 번만)
brew install pre-commit
pre-commit install
```

이제 매 커밋마다 gitleaks가 자동 실행되어 시크릿이 들어간 커밋을 거부한다.

### (4) CI에서도 gitleaks 스캔 (PR 보호)

`.github/workflows/security.yml`을 추가한다.

```yaml
name: Security
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
```

### (5) GitHub Actions 워크플로우 보안 규칙

Public 레포는 누구나 fork → PR을 보낼 수 있다. **외부 fork에서 Secrets가 새지 않도록 다음을 지킨다.**

- **`pull_request_target` 트리거 절대 사용 금지.** 이 트리거는 fork PR에서도 base 레포의 Secrets에 접근 가능하게 만든다 → 악성 PR이 시크릿을 탈취하는 대표 경로.
- 워크플로우는 `pull_request` 트리거만 사용 (이 경우 fork PR에는 Secrets가 자동 미주입됨 — 안전).
- Secrets가 필요한 작업(예: 뉴스레터 발송)은 `schedule` + `workflow_dispatch` + `push: main` 같은 신뢰된 이벤트에서만 실행.
- 모든 워크플로우 최상단에 **최소 권한** 명시:

```yaml
permissions:
  contents: read   # 필요한 권한만 추가
```

- 외부 액션은 SHA로 핀(`uses: actions/checkout@<commit-sha>`) 또는 최소 검증된 publisher만 사용.

### (6) 노출 사고 발생 시 대응

만약 키가 한 번이라도 push되었다면:

1. **즉시 해당 서비스에서 키 revoke + 재발급** (Turso, Gemini, Resend 각 대시보드)
2. git 히스토리에서 지우는 것은 **부차적**이다. Public 레포는 push 즉시 archive.org·GitHub 검색·각종 봇이 이미 크롤. **revoke가 1순위.**
3. GitHub Secret scanning이 켜져 있으면 자동으로 해당 서비스에 노출 알림이 가서 일부 키는 자동 비활성화되기도 함.

### 체크리스트

- [ ] `.gitignore`에 `.env*` 패턴 등록 (`.env.example` 제외)
- [ ] GitHub Settings → Secret scanning + Push protection 켰음
- [ ] 로컬에 `gitleaks` + `pre-commit install` 완료
- [ ] `.github/workflows/security.yml`로 CI 스캔 적용
- [ ] 모든 워크플로우 `permissions: contents: read` 명시
- [ ] `pull_request_target` 트리거를 쓰지 않음을 확인

---

## 2. Turso (DB)

1. [turso.tech](https://turso.tech) 접속 → GitHub로 가입
2. 대시보드 → Create Database
   - Name: `digeai`
   - Region: `nrt` (Tokyo, 한국에서 제일 가까움)
3. 생성된 DB 클릭 → **Generate Token** → 토큰 복사해두기
4. DB URL도 복사 (`libsql://digeai-{username}.turso.io` 형태)
5. 터미널에서 테이블 초기화

```bash
# Turso CLI 설치 (Mac)
brew install tursodatabase/tap/turso

# 로그인
turso auth login

# DB 접속
turso db shell digeai

# 아래 SQL 실행
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

# 확인
.tables

# 종료
.quit
```

수집한 값:
- `TURSO_DATABASE_URL` = `libsql://digeai-{username}.turso.io`
- `TURSO_AUTH_TOKEN` = 위에서 복사한 토큰

---

## 3. Gemini API

1. [aistudio.google.com](https://aistudio.google.com) 접속 → Google 계정 로그인
2. 좌측 **Get API key** → Create API key
3. 키 복사

수집한 값:
- `GEMINI_API_KEY` = 복사한 키

---

## 4. Resend (이메일 발송)

1. [resend.com](https://resend.com) 접속 → GitHub로 가입
2. 좌측 **API Keys** → Create API Key
   - Name: `digeai`
   - Permission: Full Access
3. 키 복사 (한 번만 보여줌)
4. 좌측 **Domains** → Add Domain
   - 도메인 없으면 일단 `onboarding@resend.dev` 테스트 주소로 시작 가능
   - 나중에 `digeai.dev` 도메인 구매 후 여기서 인증하면 됨

수집한 값:
- `RESEND_API_KEY` = 복사한 키

---

## 5. Netlify

1. [netlify.com](https://netlify.com) 접속 → GitHub로 가입
2. **Add new site** → Import an existing project → GitHub 연결
3. `digeai` 레포 선택
4. Build settings는 입력하지 않고 그대로 진행해도 됨 — 레포의 `netlify.toml`이 자동 인식됨 (`npm run build`, `dist`)
5. Deploy (지금은 코드가 없어서 실패해도 괜찮음)
6. **Site configuration** → Environment variables → Add variable
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - (Functions에서 Gemini/Resend를 호출할 일이 생기면 그때 `GEMINI_API_KEY`, `RESEND_API_KEY`도 추가. 현 SPEC상으로는 GitHub Actions에서만 사용하므로 불필요)

---

## 6. GitHub Actions Secrets

1. GitHub `digeai` 레포 → Settings → Secrets and variables → Actions
2. **New repository secret** 으로 아래 4개 등록

| Secret 이름 | 값 |
|-------------|-----|
| `TURSO_DATABASE_URL` | Turso DB URL |
| `TURSO_AUTH_TOKEN` | Turso 토큰 |
| `GEMINI_API_KEY` | Gemini API 키 |
| `RESEND_API_KEY` | Resend API 키 |

---

## 7. 로컬 환경변수 설정

프로젝트 루트에 `.env` 파일 생성

```bash
touch .env
```

아래 내용 입력:

```
# 서버 전용 시크릿 — 절대 VITE_ prefix 붙이지 말 것
TURSO_DATABASE_URL=libsql://digeai-{username}.turso.io
TURSO_AUTH_TOKEN=
GEMINI_API_KEY=
RESEND_API_KEY=

# 클라이언트(브라우저)에 노출되어도 되는 값만 VITE_ prefix
VITE_API_BASE_URL=http://localhost:8888
```

### 🔒 환경변수 보안 — 반드시 지킬 것

**시크릿이 브라우저 네트워크 콘솔이나 번들에 노출되면 즉시 도용 위험. 아래 규칙을 반드시 준수한다.**

1. **`VITE_` prefix는 공개값 전용**
   - Vite는 `VITE_*` 접두사가 붙은 변수를 빌드 시 클라이언트 번들에 **그대로 인라인**한다. → DevTools에서 누구나 볼 수 있음.
   - ❌ 절대 금지: `VITE_GEMINI_API_KEY`, `VITE_RESEND_API_KEY`, `VITE_TURSO_AUTH_TOKEN`
   - ✅ 허용: `VITE_API_BASE_URL` (어차피 fetch 요청 URL로 노출됨)

2. **시크릿은 서버에서만 읽는다**
   - `GEMINI_API_KEY`, `RESEND_API_KEY`, `TURSO_AUTH_TOKEN`은 **Netlify Functions / GitHub Actions** 안에서 `process.env`로만 접근.
   - React 컴포넌트(`src/`)에서 `import.meta.env.GEMINI_API_KEY` 같은 접근 절대 금지.

3. **클라이언트는 자체 API만 호출**
   - 브라우저에서 Turso·Gemini·Resend를 직접 호출하지 않는다. 모든 외부 호출은 Netlify Functions가 프록시.
   - 그래야 네트워크 탭에 시크릿이 헤더/바디로 새지 않는다.

4. **`.gitignore`에 `.env` 반드시 포함**
   - 프로젝트 루트의 `.gitignore`에 `.env`, `.env.local`, `.env.*.local` 등록 확인.
   - `.env.example`만 커밋 (값은 비워둔 채).

5. **에러 응답에 시크릿/스택트레이스 노출 금지**
   - Netlify Functions가 클라이언트에 반환하는 에러 메시지는 일반화된 문구만 (`서버 오류가 발생했습니다` 등). raw error/stack은 서버 로그(`console.error`)로만.

6. **GitHub Actions 로그 주의**
   - Secrets는 자동 마스킹되지만, `echo $GEMINI_API_KEY` 같은 출력은 절대 작성하지 않는다.
   - 디버깅 시 `::add-mask::`로 추가 마스킹 가능.

7. **Subscribe API 보호 (악성 트래픽 방지)**
   - 이메일 형식 검증·길이 제한·간단한 rate limit (IP당 분당 N회) 적용.
   - CORS는 본인 도메인(prod 도메인 + localhost dev)만 허용.
   - 봇 가입 폭주 방지를 위해 honeypot 필드나 Cloudflare Turnstile 등 추후 도입 검토.

8. **키 노출 시 즉시 회전**
   - 실수로라도 키가 git에 커밋되거나 외부에 노출되면 **즉시 해당 서비스 대시보드에서 키 revoke + 재발급**. git 히스토리에서 지우는 것만으로는 부족.

---

## 8. Netlify CLI 설치

```bash
npm install -g netlify-cli

# 로그인
netlify login

# 로컬 개발 서버 실행 (Functions + Vite 동시)
netlify dev
```

---

## 9. Context7 MCP 설정 (Claude Code용)

Claude Code가 라이브러리 최신 문서를 실시간 참조하게 해주는 설정.
`@google/genai`, `@libsql/client`, `resend` 등 정확한 코드를 뽑아줌.

```bash
claude mcp add --transport http context7 https://mcp.context7.com/mcp
```

또는 `~/.claude/claude.json` 직접 수정:

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

설정 후 Claude Code 프롬프트에 `use context7` 붙이면 최신 문서 참조함.

---

## 10. Claude Code 시작

위 세팅 완료 후 프로젝트 루트에서:

```bash
claude
```

첫 프롬프트 예시:

```
SPEC.md와 CLAUDE.md를 먼저 읽고 프로젝트 전체 구조를 파악해줘.
그 다음 개발 순서에 따라 순서대로 구현해줘. use context7
```

---

## 체크리스트

- [ ] GitHub Public 레포 생성 및 클론
- [ ] **시크릿 차단 장치 6종 적용 (1-A 단계)** ← Public 레포라면 가장 중요
- [ ] Turso DB 생성 + 테이블 초기화
- [ ] Gemini API 키 발급
- [ ] Resend 가입 + API 키 발급
- [ ] Netlify 연결 + 환경변수 등록
- [ ] GitHub Secrets 4개 등록
- [ ] 로컬 `.env` 파일 생성
- [ ] Netlify CLI 설치
- [ ] Context7 MCP 설정
- [ ] Claude Code 시작
