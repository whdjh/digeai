# Digeai

AI 뉴스 자동 수집 → 요약 → 이메일 발송 서비스.

큐레이션된 X(Twitter) 계정과 뉴스레터에서 AI 관련 소식을 수집하고, Gemini API로 요약해서 매일 오전 8시, 오후 5시에 구독자에게 이메일을 발송한다.

## 수집 소스

총 **20개 큐레이션 소스** (AI 공식 X · 커뮤니티 · AI·테크 미디어 · 테크 애널리스트 · 뉴스레터). 상세 목록은 [`SPEC.md`](./SPEC.md#수집-소스) 참조.

**X / Threads** — RSSHub self-host 경유

| 분류 | 이름 | handle |
|------|------|--------|
| 회사 공식 | OpenAI | `OpenAI` |
| 회사 공식 | OpenAI Developers | `OpenAIDevs` |
| 회사 공식 | Google AI | `GoogleAI` |
| 회사 공식 | Claude | `claudeai` |
| 회사 공식 | Claude Code | `claude_code` |
| 매체 | GeekNews | `GeekNewsHada` |
| 인플루언서 | Lucas | `lucas_flatwhite` |
| 인플루언서 | Journey | `atmostbeautiful` |
| 커뮤니티 | Threads @choi.openai | `choi.openai` (route: threads) |

**RSS**

| 분류 | 이름 | URL |
|------|------|-----|
| 뉴스레터 | Lenny's Newsletter | lennysnewsletter.com |
| 뉴스레터 | Sandhill (Ali Afridi) | sandhill.io |
| 뉴스레터 | Chamath | chamath.substack.com |
| 뉴스레터 | Second Brush (데일리 프롬프트) | blog.secondbrush.co.kr |
| 커뮤니티 | r/ClaudeCode | reddit.com/r/ClaudeCode |
| AI 미디어 | Hacker News | news.ycombinator.com |
| AI 미디어 | Techmeme | techmeme.com |
| 테크 애널리스트 | Benedict Evans | ben-evans.com |
| 테크 애널리스트 | Platformer | platformer.news |
| 테크 애널리스트 | The Generalist | readthegeneralist.com |
| 테크 애널리스트 | Stratechery | stratechery.com |

## 기술 스택

| 역할 | 도구 |
|------|------|
| 프론트엔드 | React + Vite + Tailwind CSS |
| 배포 | Netlify |
| 서버리스 API | Netlify Functions |
| 데이터베이스 | Turso (SQLite) |
| 파이프라인 | Node.js + GitHub Actions |
| AI 요약 | Google Gemini 2.5 Flash |
| 이메일 발송 | Resend |
| X 수집 | RSSHub (Render self-host) |

## 로컬 개발

```bash
# 의존성 설치
npm install

# 프론트엔드 + Netlify Functions
netlify dev

# 파이프라인 수동 실행
node pipeline/main.js --session morning
node pipeline/main.js --session evening
```

## 환경변수

`.env.example`을 `.env`로 복사 후 값을 채운다.

```
VITE_API_BASE_URL=http://localhost:8888   # 클라이언트 (공개)

TURSO_DATABASE_URL=                       # 서버 전용
TURSO_AUTH_TOKEN=
GEMINI_API_KEY=
RESEND_API_KEY=
RSSHUB_BASE_URL=                          # RSSHub self-host URL
RSSHUB_ACCESS_KEY=                        # RSSHub 인증 키
MAIL_FROM=                                # 발신 이메일 주소
```

## 파이프라인 흐름

```
수집 (20개 소스) → 중복 제거 → 노이즈 필터 → 세션 윈도우 필터
→ 다양성 보정 → Gemini 요약 → 관련성 필터 → 이메일 렌더 → 발송
```

- **morning** (오전 8시): 전날 오후 ~ 당일 오전 발행분
- **evening** (오후 5시): 당일 오전 ~ 오후 발행분

## 인프라

| 서비스 | 용도 | 플랜 |
|--------|------|------|
| Netlify | 프론트엔드 + Functions | Free |
| Turso | 구독자 DB | Free |
| Render | RSSHub self-host | Free |
| GitHub Actions | 파이프라인 스케줄 | Free |
| Gemini API | 뉴스 요약 | Free tier |
| Resend | 이메일 발송 | Free (3,000건/월) |
