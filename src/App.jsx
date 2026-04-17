import { useState } from 'react'
import SubscribeForm from './components/SubscribeForm.jsx'
import Toast from './components/Toast.jsx'

function App() {
  const [toast, setToast] = useState(null)

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

        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 sm:p-8">
          <p className="mb-5 text-center text-sm text-slate-600 dark:text-slate-300">
            매일 <strong className="font-semibold text-slate-900 dark:text-white">오전 8시</strong>와{' '}
            <strong className="font-semibold text-slate-900 dark:text-white">오후 5시</strong>에<br />
            AI 소식을 전달합니다.
          </p>
          <SubscribeForm onResult={setToast} />
        </section>

        <ul className="mt-10 grid w-full max-w-md grid-cols-1 gap-3 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-3">
          <li className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-900/40">
            회사 공식 블로그
          </li>
          <li className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-900/40">
            큐레이션 뉴스레터
          </li>
          <li className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-900/40">
            AI 인플루언서
          </li>
        </ul>

        <footer className="mt-16 text-center text-xs text-slate-500 dark:text-slate-500">
          <p>
            구독하신 이메일은 뉴스레터 발송 외 용도로 사용되지 않으며,
            <br />언제든지 수신 거부할 수 있습니다.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} Digeai</p>
        </footer>
      </main>
    </div>
  )
}

export default App
