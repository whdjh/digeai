import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function SubscribeForm({ onResult }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const trimmed = email.trim()
  const canSubmit = trimmed.length > 0 && !loading

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) {
      setError('올바른 이메일 주소를 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed.toLowerCase() }),
      })

      let body = {}
      try {
        body = await res.json()
      } catch {
        // 서버가 비정상 응답 — generic 오류로 처리
      }

      if (res.status === 201) {
        onResult({ variant: 'success', message: body.message ?? '구독이 완료되었습니다.' })
        setEmail('')
      } else if (res.status === 400) {
        onResult({ variant: 'error', message: body.error ?? '올바른 이메일 주소를 입력해주세요.' })
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <label htmlFor="email" className="sr-only">
        이메일 주소
      </label>
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
        disabled={loading}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'email-error' : undefined}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-violet-400"
      />
      {error && (
        <p id="email-error" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center justify-center rounded-lg bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
      >
        {loading ? (
          <>
            <svg
              className="mr-2 h-5 w-5 animate-spin"
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
            구독 중...
          </>
        ) : (
          '구독하기'
        )}
      </button>
    </form>
  )
}

export default SubscribeForm
