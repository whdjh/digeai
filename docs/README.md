# docs

프로젝트의 결정·작업·운영 히스토리 누적.

## 디렉토리

- **`decisions/`** — ADR (Architecture Decision Records). 왜 그렇게 결정했는지 남김. 한 번 적으면 수정 안 함 (변경 시 Status를 Superseded로 바꾸고 새 ADR 작성).
- **`sessions/`** — 세션별 작업 로그. 날짜별 파일 (`YYYY-MM-DD.md`).
- **`runbooks/`** — 장애·운영 대응 절차. "이런 상황이면 이렇게" 시나리오별 플레이북.

루트의 `CHANGELOG.md`는 사용자(구독자)에게 영향 있는 변경만 누적 ([Keep a Changelog](https://keepachangelog.com/) 형식).

## 흐름

| 상황 | 어디에 |
|------|--------|
| 기술 결정 굳어짐 | `decisions/` (ADR) — `/new-adr <제목>` |
| 세션 마무리 | `sessions/` — `/log-session [메모]` |
| 사용자 영향 변경 | `CHANGELOG.md` |
| 장애 대응 후 | `runbooks/` |

## 원칙

- **사실만 기록** — 추측·계획은 ADR이나 sessions에 분명히 표시
- **링크 우선** — 같은 내용 두 번 적지 말고 이전 기록을 링크
- **수정보다 새 항목** — ADR은 특히. 옛 결정을 부정하려면 새 ADR을 만들고 옛 것을 Superseded로
