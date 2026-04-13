# RSSHub 인스턴스 장애 (X/Twitter 소스)

## 증상

- 파이프라인 로그에 `rsshub.app`에서 빈 응답, 500, timeout
- X 소스에서 수집된 기사 수가 며칠 연속 0
- 다른 source는 정상

## 즉시 조치 (5분)

별도 조치 없음 — `pipeline/sources/index.js` 디스패처가 `Promise.allSettled`로 격리되어 있으면 전체 파이프라인은 죽지 않고 다른 source만으로 발송됨 (CLAUDE.md / SPEC.md 참조).

**해당 안 되는 경우** = 디스패처가 단일 source 실패에 민감하다는 뜻 → 즉시 코드 수정 필요. 임시로 X source 비활성화 (아래 옵션 C).

## 원인 파악

- 공개 RSSHub 인스턴스(`rsshub.app`)는 X의 차단·rate limit으로 빈 응답·500을 자주 뱉는다 (알려진 이슈)
- [RSSHub Discord](https://discord.gg/rsshub) 또는 GitHub Issues에서 동일 증상 사용자 확인
- `curl -i https://rsshub.app/twitter/user/<handle>`로 직접 응답 확인

## 복구

| 옵션 | 비용 | 트레이드오프 |
|------|------|-------------|
| **A. 자체 RSSHub 셀프 호스팅** | 서버 비용 (Fly.io free tier로 가능) | 가장 안정적, 셋업 부담 |
| **B. 다른 공개 인스턴스 시도** | $0 | 빠르지만 또 죽을 수 있음. [public-instances 리스트](https://docs.rsshub.app/guide/instances) 참조 |
| **C. X source 일시 비활성화** | $0 | 가장 빠름. 콘텐츠 다양성 감소. `pipeline/config/sources.js`에서 X 항목 주석 처리 |

옵션 A 선택 시 셋업 가이드: [docs.rsshub.app/install/](https://docs.rsshub.app/install/). `pipeline/sources/rsshub.js`의 base URL을 자체 인스턴스 도메인으로 교체.

## 사후

- 단일 source 장애가 전체 파이프라인을 죽이는 코드 경로 발견 시 → 디스패처 격리 강화 + reproduction 테스트
- X 소스가 장기적으로 불안정하면 → 대체 소스(Mastodon, Bluesky AT Protocol RSS) 검토 ADR 작성
- 셀프 호스팅 RSSHub 채택 시 → 인프라 ADR + 모니터링 (uptime 체크) 추가
