// 세션 윈도우 (KST 기준):
//   morning : 어제 17:00 KST ~ 오늘 08:00 KST
//   evening : 오늘 08:00 KST ~ 오늘 17:00 KST
//
// KST = UTC+9. 'KST의 X시'를 UTC ms로 변환: Date.UTC(KST_y, KST_m, KST_d + offset, X) - 9h.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * @param {'morning'|'evening'} session
 * @param {Date} [now]
 * @returns {{ from: Date, to: Date }}
 */
export function getSessionWindow(session, now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  const y = kstNow.getUTCFullYear()
  const m = kstNow.getUTCMonth()
  const d = kstNow.getUTCDate()

  const kstHourToUtc = (offsetDays, hour) =>
    Date.UTC(y, m, d + offsetDays, hour) - KST_OFFSET_MS

  if (session === 'morning') {
    return { from: new Date(kstHourToUtc(-1, 17)), to: new Date(kstHourToUtc(0, 8)) }
  }
  return { from: new Date(kstHourToUtc(0, 8)), to: new Date(kstHourToUtc(0, 17)) }
}
