# 0001. Record architecture decisions

- Date: 2026-04-13
- Status: Accepted

## Context

프로젝트가 시간이 지나면 "왜 이렇게 했지?"라는 질문이 반복된다. 코드는 *무엇*을 하는지만 보여줄 뿐, 그 결정 뒤의 트레이드오프와 제약은 git log에 흩어지거나 사라진다. digeai는 1인 프로젝트지만 외부 의존성(Turso, Resend, Gemini, RSSHub 등)이 많아 결정의 이유가 특히 중요하다.

## Decision

기술·아키텍처 결정은 `docs/decisions/`에 ADR(Architecture Decision Record) 형식으로 남긴다. Michael Nygard의 [원본 포스트](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)와 동일한 가벼운 양식 (Context / Decision / Consequences). 작성은 `/new-adr` 슬래시 커맨드로 마찰을 줄인다.

## Consequences

- 새로운 기여자(미래의 자신 포함)가 결정 맥락을 빠르게 파악 가능.
- ADR이 늘어나면 인덱스가 길어짐 → README의 인덱스로 검색 가능하게 유지.
- 사소한 결정까지 ADR로 만들면 노이즈가 됨 → "트리비얼하지 않은 결정만"을 가이드라인으로 유지.
- 결정을 바꿀 때마다 새 ADR을 만들어야 하므로 약간의 부담이 있지만, 이력 추적성을 얻는다.
