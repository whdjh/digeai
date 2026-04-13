# CHANGELOG

[Keep a Changelog](https://keepachangelog.com/) 형식. 사용자(구독자)에게 영향 있는 변경만 기록.

내부 리팩터링·문서 변경은 git log / `docs/sessions/`에서 확인.

## [Unreleased]

### Added
- 프로젝트 초기 문서 (CLAUDE.md, SPEC.md, SETUP.md)
- `.claude/` 하네스 구성 (permissions, 시크릿 보호 hook, slash commands, secret-auditor 에이전트)
- `docs/` 히스토리 구조 (decisions / sessions / runbooks)
- **랜딩 페이지** — 이메일 입력 → 구독, 토스트 응답, dark mode 자동, 모바일 반응형 (React + Tailwind v4)
- **구독 API** — `POST /api/subscribe` (Netlify Functions v2, CORS 화이트리스트, IP rate limit, Turso UPSERT)
- **뉴스 파이프라인** — 11개 큐레이션 소스(X 8 + 뉴스레터 3) → RSS/RSSHub 수집 → URL 정규화 dedup → 노이즈 필터(self-promo + URL-only RT) → 다양성 보장(source당 cap + 우선순위 보충) → Gemini 2.5 Flash 구조화 JSON 요약 (모델 fallback chain) → Resend 발송 (idempotencyKey로 중복 발송 방지)
- **GitHub Actions 자동화** — 매일 오전 8시·오후 5시 KST 자동 발송, 수동 트리거 지원, 실패 시 step summary
- **DB 초기화 스크립트** — `npm run db:init`로 Turso `subscribers` 테이블 멱등 생성
- **운영 runbook** — 첫 배포 / RSSHub 운영(공개 미러+self-host) / Resend 한도 초과 / RSSHub 장애 대응 절차
- **테스트 스크립트** — `scripts/inspect-collect.js` (수집 검증), `scripts/send-raw.js <email>` (Gemini 없이 raw 발송)
- **다양성 보장** — 한 소스가 메일을 도배하지 않게 source당 5건 cap, 최소 8개 소스 보충 (회사 공식 우선)
- **노이즈 필터** — GeekNews self-promo, URL-only 리트윗 등 자동 제외
