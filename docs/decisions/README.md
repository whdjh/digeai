# Architecture Decision Records (ADR)

기술적 결정의 **이유**를 남기는 곳. 코드는 *무엇*을 보여주고, ADR은 *왜*를 보여준다.

원본 영감: [Michael Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## 인덱스

- [0001 — Record architecture decisions](0001-record-architecture-decisions.md)
- [0002 — Batch summarize in one Gemini call](0002-batch-summarize-in-one-gemini-call.md)
- [0003 — 큐레이션 11개 소스 (X 8 + 뉴스레터 3)로 확정](0003-curate-eleven-sources.md)

## 새 ADR 작성

`/new-adr <제목>` 슬래시 커맨드로 자동 생성 권장.

수동 작성 시 파일명 규칙: `NNNN-kebab-case-title.md` (4자리 zero-pad, 0001부터).

## 템플릿

```markdown
# NNNN. <결정 제목>

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-...)

## Context

어떤 상황·제약·요구사항 때문에 결정이 필요했는지. 사실만.

## Decision

무엇을 하기로 했는지. 명확하고 단정적으로. "~할 것이다" 형태로.

## Consequences

이 결정의 결과 — 긍정/부정 모두. 트레이드오프, 향후 영향, 롤백 비용.
```

## 원칙

- **수정 금지** — 한 번 Accepted된 ADR은 내용을 바꾸지 않는다. 바꾸려면 새 ADR을 만들고 옛 것의 Status를 `Superseded by [NNNN](...)`로.
- **한 ADR = 한 결정** — 길어지면 쪼개라.
- **이유 우선** — *무엇*보다 *왜*가 핵심. 미래의 자신이 "이거 왜 이렇게 했지?"를 묻지 않게.
- **트리비얼한 결정은 적지 마** — "들여쓰기 2칸" 같은 건 ADR감 아님. ESLint 설정으로 끝.
