# 0002. 한 세션의 전체 기사를 한 번의 Gemini 호출로 요약

- Date: 2026-04-13
- Status: Accepted

## Context

각 기사를 개별로 Gemini에 호출하면 N개 기사에 N개 호출이 필요하다. Gemini 무료 티어는 분당 요청 수(RPM)에 한도가 있고 일일 토큰 한도도 있다. 한 세션(8시간 윈도우)에 9개 소스에서 30~60건 들어올 수 있어, 개별 호출은:

- RPM 한도에 쉽게 부딪힘
- 응답 지연 누적 → GitHub Actions 10분 timeout 위협
- 트렌드 한 줄 요약(전체를 관통하는)을 만들기 어려움 (개별 호출은 다른 기사를 모름)

## Decision

기사 전체를 **한 번의 Gemini 호출에 묶어** prompt에 번호로 나열하고, `responseJsonSchema`로 `{ items: [...], trend: string }` 구조를 강제한다. 청킹 임계값 `CHUNK_SIZE = 30`을 두어 30개 초과 시에만 청크로 나누고, 각 청크의 items를 머지하고 trend는 마지막 청크 것을 사용한다.

`responseMimeType: 'application/json'` + `responseJsonSchema` 조합으로 응답이 항상 유효 JSON임이 보장되므로 파싱 실패 대비 코드는 최소화 (그래도 JSON.parse는 try/catch 안에 두진 않음 — schema 위반은 진짜 라이브러리 버그라 fail-fast가 낫다).

## Consequences

- **장점**: API 호출 1~3회로 끝나 RPM 한도 안전, 전체 맥락을 본 trend 생성 가능, 응답 시간 짧음.
- **단점**: 한 호출의 응답 토큰이 길어짐. 30개 기사 × 80자 요약 ≈ 2,400자 + trend ≈ 2,500자. Gemini 2.5 Flash의 출력 한도(8k 토큰)에는 여유.
- **트레이드오프**: 청킹 시 trend가 마지막 청크만 반영함 → 정확하지 않을 수 있음. 60개 이상 들어오는 경우가 드물 거라 일단 이대로. 흔해지면 별도 trend-only 호출 1번 추가 검토.
- 한 호출이 실패하면 모든 기사 요약이 사라짐 → retry 3회 + exponential backoff로 완화.
