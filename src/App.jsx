import { useEffect, useMemo, useState } from 'react'
import SubscribeForm from './components/SubscribeForm.jsx'
import Toast from './components/Toast.jsx'
import Countdown from './components/Countdown.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function App() {
  const [toast, setToast] = useState(null)
  const [stats, setStats] = useState(null)
  const [sourceData, setSourceData] = useState(null) // { categories, sources }
  const [sourceError, setSourceError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadStats() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stats`)
        if (!res.ok) return
        const body = await res.json()
        if (!cancelled) setStats(body)
      } catch {
        // 통계는 선택적
      }
    }

    async function loadSources() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sources`)
        if (!res.ok) throw new Error('sources fetch failed')
        const body = await res.json()
        if (!cancelled) setSourceData(body)
      } catch {
        if (!cancelled) setSourceError(true)
      }
    }

    loadStats()
    loadSources()

    return () => {
      cancelled = true
    }
  }, [])

  const [year] = useState(() => new Date().getFullYear())

  const count = stats?.count ?? 0
  const capacity = stats?.capacity ?? 0
  const isFull = stats?.full === true
  const percent = capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0

  const sourceCount = sourceData?.sources?.length ?? 0
  const initialSelected = useMemo(() => {
    if (!sourceData) return []
    return sourceData.sources.filter((s) => s.defaultChecked).map((s) => s.id)
  }, [sourceData])

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950">
      <div className="aurora" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="relative z-10 border-b border-white/6">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-5">
          <span className="text-[11px] font-semibold tracking-[0.32em] text-neutral-200 uppercase">
            DIGEAI
          </span>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-20 sm:pb-28">
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-12">
          <section className="fade-up lg:col-span-7">
            <p className="mb-8 inline-flex items-center gap-3 text-[11px] tracking-[0.22em] text-amber-300/90 uppercase">
              <span className="h-px w-10 bg-amber-300/50" />
              Daily AI Digest
            </p>

            <h1 className="text-5xl leading-[1.02] font-semibold tracking-[-0.035em] text-white text-balance sm:text-6xl md:text-[4.5rem]">
              매일 두 번,
              <br />
              <span className="text-neutral-500">AI의 흐름을</span>{' '}
              <span className="text-neutral-500">놓치지 않게.</span>
            </h1>

            <p className="mt-7 max-w-lg text-[15px] leading-relaxed text-neutral-400">
              {sourceCount > 0 ? (
                <>
                  <strong className="font-medium text-neutral-200">{sourceCount}개</strong>의
                  큐레이션 소스 중 원하는 것을 골라{' '}
                </>
              ) : (
                '큐레이션된 AI 소식을 '
              )}
              <strong className="font-medium text-neutral-200">Gemini 2.5 Flash</strong>로
              요약해{' '}
              <strong className="font-medium text-neutral-200">오전 8시 · 오후 5시 KST</strong>에
              이메일로 전달합니다.
            </p>

            <div className="mt-10 max-w-xl">
              {sourceError ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-5 text-sm text-rose-200">
                  소스 목록을 불러오지 못했습니다. 새로고침해주세요.
                </div>
              ) : !sourceData ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-sm text-neutral-500">
                  소스 목록을 불러오는 중…
                </div>
              ) : (
                <SubscribeForm
                  onResult={setToast}
                  stats={stats}
                  onStatsChange={setStats}
                  sources={sourceData.sources}
                  categories={sourceData.categories}
                  initialSelected={initialSelected}
                />
              )}
            </div>

            {stats && (
              <div className="mt-12 flex max-w-lg items-center gap-4">
                <span className="text-[10px] tracking-[0.22em] text-neutral-600 uppercase">
                  {isFull ? '마감' : '구독자'}
                </span>
                <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/6">
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                      isFull
                        ? 'bg-rose-400'
                        : 'bg-linear-to-r from-amber-400 to-amber-300'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-neutral-500">
                  <span className="text-neutral-200">{count}</span>
                  <span className="text-neutral-700">/</span>
                  {capacity}
                </span>
              </div>
            )}

            {isFull && (
              <p className="mt-3 max-w-lg text-xs text-rose-300/80">
                정원이 가득 찼습니다. 다음 기회를 기다려주세요.
              </p>
            )}
          </section>

          <aside className="fade-up flex flex-col gap-5 lg:col-span-5 lg:pl-6">
            <div className="glass rounded-2xl p-7">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
                  다음 발송까지
                </p>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
              </div>
              <Countdown />
            </div>

            <div className="glass rounded-2xl p-7">
              <p className="mb-5 text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
                How it works
              </p>
              <ol className="space-y-4">
                {[
                  {
                    n: '01',
                    title: '선택',
                    desc: '관심 있는 소스만 체크박스로 고르기',
                  },
                  {
                    n: '02',
                    title: '요약',
                    desc: 'Gemini 2.5 Flash로 2~3문장 한글 요약',
                  },
                  {
                    n: '03',
                    title: '전달',
                    desc: '원문 링크와 함께 이메일로 발송',
                  },
                ].map((step) => (
                  <li key={step.n} className="flex items-start gap-4">
                    <span className="mt-0.5 font-mono text-[11px] tabular-nums text-amber-300/70">
                      {step.n}
                    </span>
                    <div className="flex-1 border-l border-white/6 pl-4">
                      <p className="text-sm font-medium tracking-tight text-neutral-100">
                        {step.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-[11px] tracking-widest text-neutral-600 uppercase sm:flex-row sm:items-center sm:justify-between">
          <p className="normal-case tracking-normal">
            구독 이메일은 뉴스레터 발송 외 용도로 사용되지 않습니다.
          </p>
          <p className="font-mono tabular-nums">© {year} DIGEAI</p>
        </div>
      </footer>
    </div>
  )
}

export default App
