import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.ReactNode} props.children
 * @param {string} [props.title]
 */
function SubscribeModal({ open, onClose, title = '구독 소스 선택', children }) {
  const cardRef = useRef(null)
  const previouslyFocused = useRef(null)
  const onCloseRef = useRef(onClose)

  // onClose 최신 참조를 ref에 유지 — useEffect deps에서 제외해 부모 리렌더마다
  // effect가 재실행되면서 포커스·스크롤이 튀는 문제 방지.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    document.body.style.overflow = 'hidden'

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
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
      first?.focus({ preventScroll: true })
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(rafId)
      document.body.style.overflow = ''
      const prev = previouslyFocused.current
      if (prev && typeof prev.focus === 'function') {
        prev.focus({ preventScroll: true })
      }
    }
  }, [open])

  if (!open) return null

  function onBackdropMouseDown(e) {
    if (e.target === e.currentTarget) onClose()
  }

  const content = (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/75 backdrop-blur-sm overflow-y-auto"
      onMouseDown={onBackdropMouseDown}
    >
      <div className="flex min-h-full items-stretch justify-center sm:items-center sm:p-4">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscribe-modal-title"
          className="relative flex w-full flex-col bg-neutral-950 sm:w-full sm:max-w-xl sm:rounded-2xl sm:border sm:border-white/10 sm:bg-neutral-950/95 sm:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/6 px-5 py-4 sm:px-6">
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

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            {children}
          </div>

          <div className="shrink-0 border-t border-white/6 px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-400/40 sm:w-auto"
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

export default SubscribeModal
