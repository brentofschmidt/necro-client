// Compact relative-time formatter — outputs strings like "1m", "3h", "2w",
// "5mo", "1y" (always trailing). Suffix the call-site if you want " ago".
//
// Buckets:
//   < 60s          → "<1m"
//   < 60m          → "Nm"
//   < 24h          → "Nh"
//   < 7d           → "Nd"
//   < ~30d         → "Nw"
//   < ~365d        → "Nmo"   (avoids collision with "Nm" minutes)
//   ≥ ~365d        → "Ny"
//
// Returns 'unknown' if the input doesn't parse.

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export function formatRelativeShort(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (isNaN(t)) return 'unknown'
  const diff = Math.max(0, now - t)
  if (diff < MINUTE) return '<1m'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`
  if (diff < MONTH) return `${Math.floor(diff / WEEK)}w`
  if (diff < YEAR) return `${Math.floor(diff / MONTH)}mo`
  return `${Math.floor(diff / YEAR)}y`
}
