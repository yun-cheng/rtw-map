export type AllocItem = { base: number; lo: number; hi: number; locked: number | null; spill: number }

/**
 * Splits `total` nights over the items as integers. Locked items keep their nights; the rest
 * are scaled from `base`, clamped to [lo, hi]. If even the upper bounds are not enough, the excess
 * goes to items in proportion to `spill` (e.g. long-stay-friendly cities).
 */
export function allocate(items: AllocItem[], total: number): number[] {
  const free = items.map((x, i) => (x.locked === null ? i : -1)).filter((i) => i >= 0)
  const lockedSum = items.reduce((s, x) => s + (x.locked ?? 0), 0)
  const target = Math.max(free.length, total - lockedSum)
  const out = items.map((x) => x.locked ?? 0)
  if (!free.length) return out

  const sumAt = (f: number) => free.reduce((s, i) => s + clamp(items[i].base * f, items[i].lo, items[i].hi), 0)
  const loSum = free.reduce((s, i) => s + items[i].lo, 0)
  const hiSum = free.reduce((s, i) => s + items[i].hi, 0)

  let real: number[]
  if (target <= loSum) {
    // Not enough time even for the minimums: shrink proportionally (never below 1 night).
    real = free.map((i) => Math.max(1, (items[i].lo * target) / loSum))
  } else if (target >= hiSum) {
    const spills = free.map((i) => items[i].spill)
    const spillSum = spills.reduce((a, b) => a + b, 0)
    real = free.map((i, k) => items[i].hi + (target - hiSum) * (spillSum > 0 ? spills[k] / spillSum : 1 / free.length))
  } else {
    let lo = 0
    let hi = 64
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2
      if (sumAt(mid) < target) lo = mid
      else hi = mid
    }
    real = free.map((i) => clamp(items[i].base * hi, items[i].lo, items[i].hi))
  }

  // Largest-remainder rounding so the integers add up exactly to the target.
  const floors = real.map((r) => Math.max(1, Math.floor(r)))
  let left = target - floors.reduce((a, b) => a + b, 0)
  const order = real.map((r, k) => ({ k, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem)
  for (let n = 0; left > 0; n++, left--) floors[order[n % order.length].k]++
  for (let n = 0; left < 0 && n < 10_000; n++) {
    const k = floors.indexOf(Math.max(...floors))
    if (floors[k] <= 1) break
    floors[k]--
    left++
  }
  free.forEach((i, k) => (out[i] = floors[k]))
  return out
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
