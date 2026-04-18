import { useEffect } from 'react'

const VARIANT_STYLES = {
  success:
    'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100 shadow-[0_10px_40px_-10px_rgb(16_185_129/0.4)]',
  error:
    'border-rose-400/20 bg-rose-400/[0.06] text-rose-100 shadow-[0_10px_40px_-10px_rgb(244_63_94/0.4)]',
}

const VARIANT_ACCENT = {
  success: 'bg-emerald-400',
  error: 'bg-rose-400',
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDismiss, 4000)
    return () => clearTimeout(id)
  }, [toast, onDismiss])

  if (!toast) return null

  const styles = VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.error
  const accent = VARIANT_ACCENT[toast.variant] ?? VARIANT_ACCENT.error

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 sm:top-6"
    >
      <div
        className={`fade-up flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border px-4 py-3 backdrop-blur-xl ${styles}`}
      >
        <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} />
        <p className="flex-1 text-sm font-medium">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="닫기"
          className="-mr-1 -mt-1 rounded-md p-1 text-current opacity-60 transition hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-current/40"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Toast
