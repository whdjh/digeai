# 구독 해지 API — 구현 플랜

**Goal:** 현재 푸터의 "회신해 주세요" 안내를 원클릭 해지 링크로 교체. Gmail/Yahoo 대량 발송자 정책(RFC 8058) 대응 헤더까지 포함.

**Architecture:** HMAC-SHA256 서명 stateless 토큰. DB 스키마 변경 없음(`subscribers`·`subscriber_sources` CASCADE 삭제로 충분). 토큰 만료 없음(해지는 영구적이어야 함).

**비용:** 0원 — Node `crypto`, Netlify Function, Resend 기본 헤더 옵션.

---

## 토큰 설계

형식: `base64url(email).hex(hmacSHA256(email, SECRET))`

- stateless: DB 조회 없이 검증, 재발급/회전 불필요
- 영구 유효: 해지 링크는 구독자가 언제 열어도 동작해야 함
- 길이 합리적: 이메일 ~40B + sig 64 hex = URL에 무리 없음

## File Structure

### 생성

| 경로 | 책임 |
|------|------|
| `pipeline/lib/unsubscribe.js` | `signToken(email)` / `verifyToken(token)` 유틸 |
| `netlify/functions/unsubscribe.js` | `GET`·`POST /api/unsubscribe?t=<token>` — 토큰 검증 + DB DELETE + HTML 응답 |

### 수정

| 경로 | 변경 요약 |
|------|----------|
| `pipeline/render.js` | `renderEmail()` 시그니처에 `unsubscribeUrl` 추가, `{{unsubscribe_url}}` placeholder 치환 |
| `pipeline/send.js` | Resend `headers` 옵션에 `List-Unsubscribe` + `List-Unsubscribe-Post` 추가, `sendOne()` 이 `unsubscribeUrl` 받아 전달 |
| `pipeline/main.js` | 구독자별 URL 생성(`signToken(email)` → 절대 URL 조립) 후 render·send 에 전달 |
| `pipeline/templates/email.html` | 푸터 "회신해 주세요" → `<a href="{{unsubscribe_url}}">구독 해지</a>` |
| `.env.example` | `UNSUBSCRIBE_SECRET` + `PUBLIC_SITE_URL` 추가 |
| `.github/workflows/newsletter.yml` | env 블록에 두 secret 추가 |

---

## Task 순서

### Task 1 — 토큰 유틸
- `pipeline/lib/unsubscribe.js` 작성
- `UNSUBSCRIBE_SECRET` 미설정 시 throw
- 단위 테스트: 서명 → 검증 → tampering 검출

### Task 2 — Netlify Function
- `netlify/functions/unsubscribe.js` 작성
- GET/POST 둘 다 지원 (RFC 8058 one-click)
- 성공: `DELETE FROM subscribers WHERE email=?` (CASCADE로 subscriber_sources도 제거)
- 응답: 간단한 HTML 완료 페이지 (별도 React 페이지 X, 번들 부담 회피)
- 토큰 유효하지 않으면 400 + 에러 HTML
- rate limit 재사용 (subscribe.js 패턴)

### Task 3 — 파이프라인 통합
- `render.js` — `{{unsubscribe_url}}` placeholder 추가 + 시그니처 확장
- `send.js` — Resend `headers` 에 `List-Unsubscribe: <https://...>, <mailto:hello@...>` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- `main.js` — 구독자 루프 내에서 `${PUBLIC_SITE_URL}/api/unsubscribe?t=${signToken(email)}` 조립
- 템플릿 푸터 링크로 교체

### Task 4 — env 문서화 + secret 주입
- `.env.example` 주석 포함 추가
- `.github/workflows/newsletter.yml` 의 `env:` 블록에 `UNSUBSCRIBE_SECRET`, `PUBLIC_SITE_URL` 추가
- GH Actions Secrets 에 실제 값 등록(사용자 수동)

### Task 5 — 수동 검증
- 로컬 파이프라인 실행 → 받은 메일에 "구독 해지" 링크 존재 확인
- 링크 클릭 → 완료 페이지 뜸 확인
- Turso 에서 해당 row 삭제됐는지 확인
- 같은 이메일로 재구독 가능한지 확인
- Gmail 앱에서 "구독 취소" 버튼 노출 여부 확인 (List-Unsubscribe 헤더 효과)

---

## Out of Scope

- 해지 사유 수집 설문 — 차후 확장
- 재구독 UX — 현재 홈페이지에서 그대로 재가입 가능하므로 별도 페이지 불필요
- 부분 해지(특정 소스만 제외) — `subscriber_sources` 는 구독 시점에 관리, 해지는 전면 탈퇴만

## 결정 포인트

- **토큰 만료 없음** — 영구 해지 링크. 재가입 후 새 token 자동 재발급.
- **DB 전체 삭제** — 소프트 삭제(deleted_at) 대신 hard delete. CASCADE 로 조인 테이블 자동 정리. 재가입 시 동일 이메일 INSERT 가능.
- **원클릭 UX** — 확인 페이지 없음. 이탈 저항 없애 고객 만족도 우선.
