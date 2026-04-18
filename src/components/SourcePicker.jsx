import { useMemo } from 'react'

/**
 * 카테고리별 체크박스 리스트. 순수 presentational — 상태 없음.
 *
 * @param {Object} props
 * @param {Record<string, { label: string, order: number }>} props.categories
 * @param {Array<{ id: string, name: string, category: string, description: string, defaultChecked: boolean }>} props.sources
 * @param {Set<string>} props.selected
 * @param {(next: Set<string>) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
function SourcePicker({ categories, sources, selected, onChange, disabled = false }) {
  const grouped = useMemo(() => {
    const byCat = new Map()
    for (const s of sources) {
      if (!byCat.has(s.category)) byCat.set(s.category, [])
      byCat.get(s.category).push(s)
    }
    const orderedKeys = [...byCat.keys()].sort(
      (a, b) => (categories[a]?.order ?? 99) - (categories[b]?.order ?? 99),
    )
    return orderedKeys.map((key) => ({
      key,
      label: categories[key]?.label ?? key,
      items: byCat.get(key),
    }))
  }, [categories, sources])

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <p
        aria-live="polite"
        className="text-[11px] tracking-[0.22em] text-neutral-500 uppercase"
      >
        {selected.size}개 선택됨
      </p>

      {grouped.map(({ key, label, items }) => (
        <section key={key} className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold tracking-[0.24em] text-amber-300/80 uppercase">
            {label}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {items.map((s) => {
              const checked = selected.has(s.id)
              return (
                <li key={s.id}>
                  <label
                    htmlFor={`src-${s.id}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                      checked
                        ? 'border-amber-400/40 bg-amber-400/5'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                    } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input
                      id={`src-${s.id}`}
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(s.id)}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-amber-400"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-neutral-100">
                        {s.name}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                        {s.description}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default SourcePicker
