# Resend 월간 한도 초과

## 증상

- Resend API가 `429` 또는 `quota_exceeded` 응답
- GitHub Actions의 `pipeline/send.js` 단계에서 다수 발송 실패
- stderr에 실패 이메일 다수 출력

## 즉시 조치 (5분)

1. **다음 발송 스케줄 일시 중단**
   - GitHub UI → Actions → Newsletter workflow → ⋯ → Disable workflow
   - 또는 `.github/workflows/newsletter.yml`의 cron 두 줄 주석 처리 후 push
2. Resend 대시보드에서 사용량 확인 → [resend.com/emails](https://resend.com/emails)

## 원인 파악

- **무료 티어 한도**: 월 3,000건 (구독자 50명 × 2회/일 × 30일 ≈ 3,000)
- 실제 발송 카운트가 예상 초과면 **중복 발송** 의심:
  - `pipeline/send.js`에서 `idempotencyKey` 누락 가능성 (CLAUDE.md / SPEC.md 참조)
  - GitHub Actions 재실행으로 인한 중복인지 워크플로우 run 이력 확인

## 복구

| 옵션 | 비용 | 적용 시점 |
|------|------|-----------|
| **A. 한도 리셋 대기** | $0 | 다음 달 1일까지 발송 정지 유지 |
| **B. Pro 플랜 업그레이드** | $20/월 (50,000건) | 결제 후 즉시 한도 풀림 |
| **C. 발송 빈도 축소** | $0 | 하루 2회 → 1회. cron 한 줄로 줄이고 `pipeline/main.js`의 session 인자 통합 |

복구 후 cron/workflow 활성화하고 push.

## 사후

- 실패한 N명 구독자에게 사과 메일 — 다음 정상 발송에 직전 회차 요약 동봉
- Resend 대시보드에서 한도 80% 도달 알림 활성화
- 구독자 수가 한도를 위협하는 수준이면 → ADR로 유료 전환 결정 기록 (`/new-adr`)
- `idempotencyKey` 누락이 원인이었으면 → 코드 수정 + 같은 장애 reproduction 방지 테스트 추가
