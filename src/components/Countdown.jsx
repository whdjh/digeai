import { useEffect, useState } from 'react'

const KST_SEND_UTC_HOURS = [23, 8]

function msUntilNextDelivery() {
  const now = new Date()
  const nowSec =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()
  const targets = KST_SEND_UTC_HOURS.map((h) => h * 3600).sort((a, b) => a - b)
  for (const t of targets) {
    if (nowSec < t) return (t - nowSec) * 1000 - now.getUTCMilliseconds()
  }
  return (86400 - nowSec + targets[0]) * 1000 - now.getUTCMilliseconds()
}

function labelForNext() {
  const now = new Date()
  const nowSec =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()
  if (nowSec < 8 * 3600) return '오후 5시 KST'
  if (nowSec < 23 * 3600) return '오전 8시 KST'
  return '오전 8시 KST'
}

function Countdown() {
  const [ms, setMs] = useState(() => msUntilNextDelivery())

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextDelivery()), 1000)
    return () => clearInterval(id)
  }, [])

  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const s = String(totalSec % 60).padStart(2, '0')

  return (
    <div>
      <p className="flex items-baseline gap-3 font-mono text-4xl font-semibold tabular-nums tracking-tight text-white sm:text-[2.75rem]">
        <span>{h}</span>
        <span className="text-neutral-700">:</span>
        <span>{m}</span>
        <span className="text-neutral-700">:</span>
        <span className="text-neutral-400">{s}</span>
      </p>
      <p className="mt-2 text-xs tracking-[0.14em] text-neutral-500 uppercase">
        {labelForNext()}
      </p>
    </div>
  )
}

export default Countdown
