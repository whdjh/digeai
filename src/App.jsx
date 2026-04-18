import { useEffect, useState } from 'react'
import SubscribeForm from './components/SubscribeForm.jsx'
import Toast from './components/Toast.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function App() {
  const [toast, setToast] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stats`)
        if (!res.ok) return
        const body = await res.json()
        if (!cancelled) setStats(body)
      } catch {
        // 통계는 선택적 — 실패해도 폼은 정상 동작
      }
    }
    loadStats()
    return () => {
      cancelled = true
    }
  }, [])

  const count = stats?.count ?? 0
  const capacity = stats?.capacity ?? 0
  const isFull = stats?.full === true
  const percent = capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0

  return (
    <div className="min-h-screen bg-linear-to-b from-white to-violet-50 text-slate-900 dark:from-slate-950 dark:to-indigo-950 dark:text-slate-100">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <header className="mb-10 text-center">
          <p className="mb-3 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-medium uppercase tracking-wider text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            AI 뉴스 큐레이션
          </p>
          <h1 className="bg-linear-to-r from-violet-600 to-indigo-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent dark:from-violet-400 dark:to-indigo-400 sm:text-6xl">
            Digeai
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 sm:text-xl">
            큐레이션된 AI 뉴스를 매일 두 번, 이메일로
          </p>
        </header>

        {stats && (
          <section className="mb-6 w-full max-w-md" aria-live="polite">
            <div className="rounded-xl border border-slate-200 bg-white/70 px-5 py-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {isFull ? '모집 마감' : '현재 가입자'}
                </span>
                <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  <strong className="text-lg font-bold text-violet-600 dark:text-violet-400">
                    {count}
                  </strong>
                  <span className="text-slate-400 dark:text-slate-500"> / {capacity}명</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    isFull
                      ? 'bg-rose-500'
                      : 'bg-linear-to-r from-violet-500 to-indigo-500'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              {isFull && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  정원이 가득 찼습니다. 다음 기회를 기다려주세요.
                </p>
              )}
            </div>
          </section>
        )}

        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 sm:p-8">
          <p className="mb-5 text-center text-sm text-slate-600 dark:text-slate-300">
            매일 <strong className="font-semibold text-slate-900 dark:text-white">오전 8시</strong>와{' '}
            <strong className="font-semibold text-slate-900 dark:text-white">오후 5시</strong>에<br />
            AI 소식을 전달합니다.
          </p>
          <SubscribeForm onResult={setToast} stats={stats} onStatsChange={setStats} />
        </section>

        <footer className="mt-16 text-center text-xs text-slate-500 dark:text-slate-500">
          <p>
            구독하신 이메일은 뉴스레터 발송 외 용도로 사용되지 않습니다.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} Digeai</p>
        </footer>
      </main>
    </div>
  )
}

export default App
