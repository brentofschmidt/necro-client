// Translates a substat's `value` × catalog `conversion_per_point` text into
// a one-line "what this actually does" string for the character page.
//
// The catalog stores the per-point conversion as a human-readable line:
//   "+0.1% physical damage per point"
//   "+1% crit chance per point"
//   "+0.5% cast & swing speed per point"
//   "+1 mana restored per second per point"
//
// We parse that into (multiplier, isPercent, suffix) and multiply by the
// character's value:
//   AP 36   × +0.1% physical damage per point        → "+3.6% physical damage"
//   Haste 4 × +0.5% cast & swing speed per point     → "+2% cast & swing speed"
//   Mana regen 3 × +1 mana restored per second per point → "+3 mana restored per second"
//
// Returns null if the conversion text doesn't match the expected shape — the
// caller can fall back to the catalog's `affects` blurb in that case.

const CONVERSION_RE = /^\+?([\d.]+)(%)?\s+(.+?)\s+per\s+point$/i

export type StatEffectDescription = {
  total: number
  isPercent: boolean
  suffix: string
  formatted: string
}

export function describeStatEffect(
  value: number,
  conversionPerPoint: string,
): StatEffectDescription | null {
  if (!conversionPerPoint) return null
  const m = conversionPerPoint.match(CONVERSION_RE)
  if (!m) return null

  const perPoint = parseFloat(m[1])
  const isPercent = !!m[2]
  const suffix = m[3]

  // Round to 2 decimals, then trim trailing zeros so "+3.60%" → "+3.6%"
  // and "+5.00%" → "+5%".
  const total = Math.round(perPoint * value * 100) / 100
  const num = trimTrailingZeros(total)
  const sign = total > 0 ? '+' : total < 0 ? '' : ''
  const formatted = isPercent ? `${sign}${num}% ${suffix}` : `${sign}${num} ${suffix}`

  return { total, isPercent, suffix, formatted }
}

function trimTrailingZeros(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2).replace(/\.?0+$/, '')
}
