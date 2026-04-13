# 첫 배포 (Bootstrap)

코드는 다 짜졌지만 실 운영하려면 외부 서비스 5곳에 계정·키를 만들고 환경변수에 주입해야 한다. 한 번만 하면 끝.

## 사전 준비 (계정 생성)

| 서비스 | 무료 한도 | 가입 |
|---|---|---|
| GitHub | 무료 (Actions 2,000분/월) | github.com — 이 repo가 올라갈 곳 |
| Netlify | 무료 (대역폭 100GB/월, Functions 125k req/월) | netlify.com — 프론트 + API 호스팅 |
| Turso | 무료 (DB 9개, 1GB 저장) | turso.tech — 구독자 DB |
| Google AI Studio | 무료 티어 (분당 RPM 한도 — pricing 페이지 확인) | aistudio.google.com — Gemini API 키 |
| Resend | 무료 (3,000건/월) | resend.com — 이메일 발송 |

## 1단계: Turso DB 생성 + 스키마 초기화

```bash
# Turso CLI 설치 (없으면)
brew install tursodatabase/tap/turso

# 로그인 + DB 생성
turso auth login
turso db create digeai

# 연결 정보 확인 (URL과 토큰)
turso db show digeai --url
turso db tokens create digeai

# 받은 값을 .env에 채우고 (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
# 스키마 초기화
npm run db:init
```

성공하면 `[init-db] subscribers 테이블 준비 완료 ✅` 출력.

## 2단계: 시크릿 발급

각 서비스 대시보드에서 발급한 키를 `.env`에 채운다:

```
GEMINI_API_KEY=AIza...      # aistudio.google.com → API key
RESEND_API_KEY=re_...       # resend.com → API Keys → Create API Key
MAIL_FROM=Digeai <news@your-domain.com>  # Resend에서 도메인 인증 후 (테스트는 onboarding@resend.dev)
```

⚠️ **절대 시크릿에 `VITE_` prefix 붙이지 마라** — 클라이언트 번들에 인라인되어 노출됨. `scan-vite-secrets.sh` 훅이 차단하지만 손으로 .env 편집 시엔 훅이 동작 안 함.

## 3단계: 로컬 검증

```bash
# 파이프라인 한 번 돌려 보기 (수신자 0명이라도 수집·요약까지 동작 확인)
npm run pipeline:evening

# 프론트 + Functions 같이
netlify dev   # http://localhost:8888
```

이메일 입력해서 구독해 보고 → Turso에 row 생기는지 확인:
```bash
turso db shell digeai "SELECT * FROM subscribers"
```

## 4단계: GitHub repo 생성 + push

```bash
# 원격 저장소 만든 다음
git remote add origin git@github.com:<user>/digeai.git
git push -u origin master   # 또는 main으로 rename 후 push
```

## 5단계: GitHub Secrets 등록

repo Settings → Secrets and variables → Actions → New repository secret:

```
GEMINI_API_KEY
RESEND_API_KEY
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
MAIL_FROM            (옵셔널)
RSSHUB_BASE_URL      (옵셔널 — self-host 시)
```

## 6단계: Netlify 배포

1. Netlify 대시보드 → Add new site → Import from Git → 이 repo 선택
2. 빌드 설정은 `netlify.toml` 자동 인식 (build cmd, publish dir, functions dir)
3. Site settings → Environment variables에 등록:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `PUBLIC_SITE_URL`= `https://<your-site>.netlify.app` (CORS용)
4. Deploy

배포 후 사이트 접속해서 이메일 구독 한 번 더 시험.

## 7단계: GitHub Actions 수동 트리거 (smoke test)

repo → Actions → Newsletter → Run workflow → session=`evening` → Run.

성공하면 구독자에게 실 메일이 발송된다. 자기 자신 이메일 하나 구독해 두고 시험할 것.

이후로는 23:00 UTC / 08:00 UTC cron이 자동 실행. 손 떼도 됨. 🎉

## 흔한 첫 배포 실패 패턴

| 증상 | 원인 | 해결 |
|---|---|---|
| `subscribers table not found` | DB 초기화 안 함 | `npm run db:init` 재실행 |
| `429 quota_exceeded` from Resend | 무료 한도 초과 | [resend-quota-exceeded.md](resend-quota-exceeded.md) |
| Functions 502 + Netlify 로그에 `Cannot find module 'xxx'` | dependency가 devDependencies에 있음 | dependencies로 옮기고 재배포 |
| CORS 오류 in 브라우저 | `PUBLIC_SITE_URL` 미설정 또는 오타 | Netlify env 확인 후 redeploy |
| Gemini 401 | API key 오타 또는 미활성 | aistudio에서 새 키 발급 |
| RSSHub X 소스 0건 | 공개 인스턴스 차단 | [rsshub-down.md](rsshub-down.md) |

## 체크리스트

- [ ] Turso DB 생성 + `npm run db:init` 성공
- [ ] 5종 시크릿 모두 발급 + `.env` 채움
- [ ] `npm run pipeline:evening` 로컬 성공 (수집/요약까지)
- [ ] `netlify dev`로 구독 폼 → 201 응답 + Turso row 생성 확인
- [ ] GitHub repo 생성 + push
- [ ] GitHub Secrets 4종 (필수) 등록
- [ ] Netlify 배포 + env 등록 (`PUBLIC_SITE_URL` 포함)
- [ ] GitHub Actions 수동 트리거 (`evening`) 성공 + 자기 이메일에 메일 도착
