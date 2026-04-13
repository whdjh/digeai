---
description: 뉴스 파이프라인 로컬 실행 (morning | evening)
argument-hint: morning | evening
---

`node pipeline/main.js --session $ARGUMENTS` 실행해서 결과 분석.

인자가 비어있거나 morning/evening이 아니면 사용자에게 먼저 물어봐.

실행 후 체크:
1. **종료 코드** — 0이 아니면 stderr 분석
2. **단계별 진행** — collect → summarize → render → send 중 어디까지 갔는지
3. **수집 건수** — 각 source별 기사 수 (RSSHub 같은 불안정 소스는 0이어도 정상)
4. **요약 결과** — Gemini 응답 길이, 잘림/오류 여부
5. **발송 여부** — 실제 발송했는지, dry-run인지 (환경에 따라)

실패 시 원인 분류:
- **환경변수 누락** → `.env` 파일 존재 + 필수 키 (`TURSO_*`, `GEMINI_API_KEY`, `RESEND_API_KEY`) 채워졌는지
- **외부 API 응답 이상** → 재시도 로직 (max 3) 동작했는지, rate limit인지
- **단일 source 실패가 전체를 죽임** → 디스패처 격리 (`Promise.allSettled`) 누락 → 즉시 fix
- **DB 연결 실패** → Turso URL/토큰 유효성 확인

`--session evening`이면 오후 5시 콘텐츠, `morning`이면 오전 8시 콘텐츠.
