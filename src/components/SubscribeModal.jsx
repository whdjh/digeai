import { useEffect, useRef } from 'react'

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.ReactNode} props.children
 * @param {string} [props.title]
 */
function SubscribeModal({ open, onClose, title = '뉴스레터 구독', children }) {
  const cardRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    document.body.style.overflow = 'hidden'

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !cardRef.current) return
      const focusables = cardRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)

    const rafId = requestAnimationFrame(() => {
      if (!cardRef.current) return
      const first = cardRef.current.querySelector(
        'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      first?.focus()
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(rafId)
      document.body.style.overflow = ''
      const prev = previouslyFocused.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open, onClose])

  if (!open) return null

  function onBackdropMouseDown(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-sm"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={onBackdropMouseDown}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscribe-modal-title"
          className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-neutral-950/95 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
        >
          <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
            <h2
              id="subscribe-modal-title"
              className="text-[11px] font-semibold tracking-[0.24em] text-neutral-200 uppercase"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded-md p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="max-h-[min(70vh,600px)] overflow-y-auto px-6 py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscribeModal
