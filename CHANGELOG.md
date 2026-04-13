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
- **뉴스 파이프라인** — 9개 소스 큐레이션 → RSS/RSSHub 수집 → 정규화 URL dedup → Gemini 2.5 Flash 구조화 JSON 요약 → Resend 발송 (idempotencyKey로 중복 발송 방지)
- **GitHub Actions 자동화** — 매일 오전 8시·오후 5시 KST 자동 발송, 수동 트리거 지원, 실패 시 step summary
- **DB 초기화 스크립트** — `npm run db:init`로 Turso `subscribers` 테이블 멱등 생성
- **운영 runbook** — 첫 배포 / Resend 한도 초과 / RSSHub 장애 대응 절차
