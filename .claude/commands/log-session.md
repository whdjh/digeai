---
description: 오늘 세션 작업 로그를 docs/sessions/YYYY-MM-DD.md에 append
argument-hint: [선택적 메모]
---

오늘 세션 로그를 `docs/sessions/$(date +%Y-%m-%d).md`에 append해.

순서:
1. `date +%Y-%m-%d`로 오늘 날짜, `date +%H:%M`으로 현재 시각 확인
2. 파일 없으면 `# YYYY-MM-DD` 헤더로 새로 만듦
3. 파일 끝에 새 세션 블록을 append (`docs/sessions/README.md`의 템플릿 형식)

세션 블록 항목:
- **한 일** — 이번 세션에서 실제 작업한 내용 (구체적으로, 파일명/모듈명 포함)
- **결정** — 굳혀진 선택. 큰 결정은 `/new-adr`로 따로 ADR 작성 권장
- **이슈 / 다음 액션** — 미해결 이슈, TODO (체크박스로)
- **변경 파일** — 파일 경로 + 한 줄 설명 (가능하면 `git status` / `git diff --name-only` 기반)

추가 메모: $ARGUMENTS

작성 후 파일 경로를 출력해.
