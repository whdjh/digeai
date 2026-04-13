---
description: 새 ADR (Architecture Decision Record) 파일 생성
argument-hint: <결정 제목>
---

새 ADR을 `docs/decisions/`에 만들어.

순서:
1. `docs/decisions/`에서 `NNNN-*.md` 패턴 중 가장 큰 번호 찾기
2. +1해서 4자리 zero-pad (`0002`, `0003`, ...)
3. 인자로 받은 제목을 kebab-case로 변환해 파일명 만들기 (예: "Use libSQL for Turso" → `0002-use-libsql-for-turso.md`)
4. `docs/decisions/README.md`의 템플릿 따라 작성:
   - Date: 오늘 (`date +%Y-%m-%d`)
   - Status: Proposed (사용자가 확정 후 Accepted로 변경)
   - Context, Decision, Consequences는 사용자와 대화하며 채움
5. 작성 후 `docs/decisions/README.md`의 인덱스 섹션에 한 줄 추가:
   `- [NNNN — 제목](NNNN-slug.md)`

제목: $ARGUMENTS

만약 인자가 비어있으면 사용자에게 결정 제목을 먼저 물어봐.
