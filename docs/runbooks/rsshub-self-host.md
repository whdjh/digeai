# RSSHub 운영 (공개 미러 우선 → self-host 백업)

## 왜 필요한가

X(Twitter)는 자체 RSS를 제공하지 않는다. RSSHub가 X 페이지를 RSS로 변환해주는데, 메인 공개 인스턴스(`rsshub.app`)는 X의 차단·rate limit으로 거의 매번 빈 응답을 준다. ADR-0003에 따라 X 8개 채널이 핵심 큐레이션이므로 대안 미러 또는 self-host가 필요하다.

## 0단계: 검증된 공개 미러 (먼저 시도, 카드 등록 X)

신용카드 등록·셋업 0분으로 운영 가능. 단 공개 미러는 운영 주체가 개인이라 갑자기 죽을 수 있음 — 안정 운영 원하면 1단계(self-host)로.

| 미러 | X 라우트 응답 (2026-04-13 검증) | 비고 |
|---|---|---|
| **`https://rsshub.pseudoyu.com`** | ✅ 11/11 소스 수집 (총 132건) | 현재 권장 |
| `https://rsshub.app` (메인) | ❌ 404 / 빈 응답 | X 차단 |
| `https://rsshub.rssforever.com` | ❌ 503 | 부하 |
| 그 외 (`rsshub.feeded.xyz` 등) | ❌ timeout | 죽었거나 차단 |

### 적용 방법

`.env` (로컬), GitHub Secrets (자동 발송), 양쪽에 동일 환경변수:

```bash
RSSHUB_BASE_URL=https://rsshub.pseudoyu.com
```

코드 변경 X — `pipeline/sources/rsshub.js`가 환경변수를 읽고 fallback은 `rsshub.app`. 환경변수만 설정하면 즉시 적용.

검증:

```bash
RSSHUB_BASE_URL=https://rsshub.pseudoyu.com node scripts/inspect-collect.js evening
# 출력: 11/11 소스에서 수집 (각각 3~20건)
```

### 미러가 죽으면

[RSSHub Public Instances 리스트](https://docs.rsshub.app/guide/instances) 에서 다른 인스턴스 시도. 또는 1단계로 진행.

다른 미러 빠르게 일괄 테스트하는 스크립트:

```bash
for base in https://rsshub.app https://rsshub.pseudoyu.com https://rsshub.rssforever.com; do
  echo "=== $base ==="
  curl -s -o /dev/null -w "%{http_code} bytes=%{size_download}\n" \
    "$base/twitter/user/OpenAI"
done
```

200 + bytes > 1000 응답 주는 곳 발견 시 RSSHUB_BASE_URL 교체.

---

## 1단계: Self-host (안정 운영 시 — 카드 등록 필요)

## 옵션 비교

| 호스팅 | 비용 | 안정성 | 셋업 시간 |
|---|---|---|---|
| **Fly.io** (추천) | 무료 한도(공유 CPU + 256MB) 안에서 운영 가능 | ✅ 장기 안정 | 30분 |
| Render | 무료(슬립 모드 있음) | ⚠️ cron 깨우는 게 번거로움 | 20분 |
| Railway | $5/월 크레딧 | ✅ | 15분 |
| 자체 VPS | $5~/월 | ✅ | 1시간+ |

이하 Fly.io 기준.

## Fly.io 셋업

### 1. flyctl 설치 + 가입

```bash
brew install flyctl
fly auth signup     # 또는 fly auth login
```

신용카드 등록 필요(무료 한도 내에서는 청구 X). 한도 초과 시에만 과금.

### 2. RSSHub 배포

RSSHub 공식 Docker 이미지를 그대로 사용한다.

```bash
mkdir digeai-rsshub && cd digeai-rsshub
fly launch --image diygod/rsshub:latest --no-deploy --name digeai-rsshub --region nrt
```

- `--region nrt`: 도쿄 (한국에서 가장 빠름)
- `--no-deploy`: 설정만 만들고 일단 배포 보류 (env 설정 후 deploy)

생성된 `fly.toml`에서 다음 부분 확인/수정:

```toml
[http_service]
  internal_port = 1200      # RSSHub 기본 포트
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0  # 미사용 시 자동 stop (무료 한도 절약)

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

### 3. (선택) Twitter 인증 강화

X 계정 라우트는 인증 없이도 작동하지만 더 안정적이려면 다음 환경변수 설정:

```bash
fly secrets set TWITTER_AUTH_TOKEN="<X 계정 쿠키 auth_token 값>"
```

쿠키 auth_token 추출법: 본인 X 계정 로그인 → DevTools → Application → Cookies → `auth_token` 복사. (서브 계정 만들어서 쓰는 걸 권장 — 본 계정 차단 위험 회피.)

### 4. 배포

```bash
fly deploy
```

배포 완료 후 도메인 확인:

```bash
fly status
# Hostname: digeai-rsshub.fly.dev
```

### 5. 동작 검증

브라우저나 curl로:

```bash
curl https://digeai-rsshub.fly.dev/twitter/user/OpenAI
```

XML 응답 + `<item>` 태그들이 나오면 성공. 빈 `<channel>`이면 X 차단 + 인증 강화 필요.

### 6. digeai에 연결

GitHub Secrets / Netlify env에 추가:

```
RSSHUB_BASE_URL=https://digeai-rsshub.fly.dev
```

`pipeline/sources/rsshub.js`가 이 환경변수를 읽으므로 코드 변경 불필요.

로컬 테스트:

```bash
RSSHUB_BASE_URL=https://digeai-rsshub.fly.dev npm run pipeline:evening
```

## 운영 모니터링

- Fly.io 대시보드 → digeai-rsshub → Metrics: 메모리·CPU 사용량 확인
- 무료 한도 임박 시 알림 받게 Billing 설정
- 한 달에 한 번 `fly deploy --image diygod/rsshub:latest`로 RSSHub 최신 버전 받기 (보안 패치 + 라우트 fix)

## 흔한 문제

| 증상 | 원인 | 해결 |
|---|---|---|
| `502 Bad Gateway` | 머신이 아직 cold start 중 | 5초 후 재시도 (auto-start가 켜지면 자동) |
| 모든 X 라우트 빈 응답 | X가 IP 차단 | `TWITTER_AUTH_TOKEN` 추가 + 머신 재시작 (`fly machine restart`) |
| 메모리 OOM | 캐시 누적 | `fly secrets set CACHE_EXPIRE=300` (기본 5분 캐시 유지) |
| 한도 초과 청구 | 머신 stop이 작동 안 함 | `min_machines_running = 0` 확인, `auto_stop_machines = "stop"` 확인 |

## 사후

- self-host 운영 안정 후엔 ADR로 운영 모델 기록 (`/new-adr "RSSHub self-host on Fly.io"`)
- Twitter API 정책 변경(예: API v2 무료 한도 부활) 시 self-host 폐기 검토
