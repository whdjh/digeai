# 0003. 큐레이션 11개 소스 (X 8 + 뉴스레터 3)로 확정

- Date: 2026-04-13
- Status: Accepted
- Supersedes: SPEC.md의 초기 9개 소스 표

## Context

초기 SPEC.md의 소스 표(9개: 회사 RSS + 뉴스레터 + X 2개)와 사용자의 진짜 의도(X 8개 + 뉴스레터 3개) 사이에 차이가 있었다. 첫 운영 검증 도중 사용자가 명확히 정정함:

```
X(Twitter) 채널 8개:
  - OpenAI (@OpenAI)
  - OpenAI Developers (@OpenAIDevs)
  - Google AI (@GoogleAI)
  - Claude (@claudeai)
  - Claude Code Community (@claude_code)
  - GeekNews (@GeekNewsHada)
  - Lucas (@lucas_flatwhite)
  - Journey (@atmostbeautiful)

뉴스레터 3개:
  - Lenny's Newsletter
  - Ali Afridi (Sandhill)
  - Chamath
```

회사 공식 블로그·뉴스 RSS(openai.com/news/rss, blog.google/technology/ai/rss 등)는 *제외* — 사용자는 X 채널의 짧고 신선한 큐레이션을 선호한다.

## Decision

`pipeline/config/sources.js`를 위 11개로 정확히 교체. SPEC.md의 표도 동시 갱신해 단일 진실 공급원 유지.

회사 RSS 블로그를 추가로 보완 소스로 운영하지 않는다. X 채널이 회사들의 공식 신호이므로 충분.

## Consequences

- **장점**: 콘텐츠가 짧고 시의성 높음(트윗 단위), 큐레이터 의도와 정확히 일치.
- **장점**: 소스 단순화 — 11개로 일관 운영.
- **단점**: X 8개 모두 RSSHub 의존. 공개 인스턴스(`rsshub.app`)는 X 차단 때문에 거의 빈 응답 → 운영 안정화하려면 RSSHub self-host 필수.
  - 대응: [docs/runbooks/rsshub-self-host.md](../runbooks/rsshub-self-host.md) 가이드 작성, `RSSHUB_BASE_URL` 환경변수로 base 교체.
- **단점**: 회사 공식 발표(긴 form 블로그 글)는 X에 링크 형태로 올라오므로 짧은 소개만 받게 됨. 원문 링크는 그대로 메일에 포함되니 수신자가 클릭해서 본다.
- **롤백**: sources.js만 되돌리면 끝. ADR을 새로 만들 것 (이 문서를 Superseded로).
