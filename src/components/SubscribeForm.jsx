import { useState } from 'react'
import SourcePicker from './SourcePicker.jsx'
import SubscribeModal from './SubscribeModal.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function SubscribeForm({
  onResult,
  stats,
  onStatsChange,
  sources,
  categories,
  initialSelected,
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(() => new Set(initialSelected ?? []))
  const [modalOpen, setModalOpen] = useState(false)

  const trimmed = email.trim()
  const isFull = stats?.full === true
  const canSubmit =
    trimmed.length > 0 && selected.size > 0 && !loading && !isFull

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isFull) return

    if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) {
      setError('올바른 이메일 주소를 입력해주세요.')
      return
    }
    if (selected.size === 0) {
      setError('구독할 소스를 최소 1개 이상 선택해주세요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed.toLowerCase(),
          source_ids: [...selected],
        }),
      })

      let body = {}
      try {
        body = await res.json()
      } catch {
        // 비정상 응답
      }

      if (res.status === 201) {
        onResult({ variant: 'success', message: body.message ?? '구독이 완료되었습니다.' })
        setEmail('')
        onStatsChange?.((s) =>
          s ? { ...s, count: s.count + 1, full: s.count + 1 >= s.capacity } : s,
        )
      } else if (res.status === 400) {
        onResult({ variant: 'error', message: body.error ?? '입력을 확인해주세요.' })
      } else if (res.status === 403) {
        onResult({
          variant: 'error',
          message: body.error ?? '현재 구독자가 모두 찼습니다. 다음 기회를 기다려주세요.',
        })
        onStatsChange?.((s) => (s ? { ...s, full: true } : s))
      } else if (res.status === 409) {
        onResult({ variant: 'error', message: body.error ?? '이미 구독 중인 이메일입니다.' })
      } else if (res.status === 429) {
        onResult({
          variant: 'error',
          message: body.error ?? '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        })
      } else {
        onResult({
          variant: 'error',
          message: body.error ?? '잠시 후 다시 시도해주세요.',
        })
      }
    } catch {
      onResult({ variant: 'error', message: '네트워크 오류 — 연결을 확인해주세요.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={loading || isFull}
        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-neutral-300 backdrop-blur transition hover:border-amber-400/30 hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-3">
          <span className="text-[10px] font-semibold tracking-[0.22em] text-amber-300/80 uppercase">
            선호 소스 선택
          </span>
          <span className="font-mono text-xs tabular-nums text-neutral-500">
            <span className="text-neutral-100">{selected.size}</span>
            <span className="text-neutral-700">/</span>
            {sources.length}
          </span>
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform group-hover:translate-x-0.5"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 7h12m0 0L8 2m5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="email" className="sr-only">
          이메일 주소
        </label>
        <div className="relative flex-1">
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError('')
            }}
            disabled={loading || isFull}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'email-error' : undefined}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-base text-white placeholder:text-neutral-600 outline-none backdrop-blur transition focus:border-amber-400/50 focus:bg-white/[0.05] focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {error && (
            <p
              id="email-error"
              className="absolute -bottom-6 left-0 text-xs text-rose-300/90"
            >
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="group inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3.5 text-sm font-semibold tracking-tight text-neutral-950 shadow-[0_0_0_1px_rgb(245_158_11/0.3),0_10px_30px_-10px_rgb(245_158_11/0.45)] transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                />
              </svg>
              전송 중
            </>
          ) : isFull ? (
            '모집 마감'
          ) : (
            <>
              구독하기
              <svg
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 7h12m0 0L8 2m5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
        </button>
      </div>

      <SubscribeModal open={modalOpen} onClose={() => setModalOpen(false)}>
        <SourcePicker
          categories={categories}
          sources={sources}
          selected={selected}
          onChange={setSelected}
          disabled={loading || isFull}
        />
      </SubscribeModal>
    </form>
  )
}

export default SubscribeForm
