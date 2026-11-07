/**
 * Seedable pseudo-random number generator (mulberry32).
 *
 * Deterministic for a given seed, which makes every spin replayable in tests.
 * NOTE: mulberry32 is fine for a demo-credit prototype; a real-money product
 * would require a certified RNG.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  /** Pick from items using their `weight` field. */
  weighted<T extends { weight: number }>(items: readonly T[]): T;
  /** Current internal state (for snapshot / replay). */
  readonly state: number;
  readonly seed: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    weighted(items) {
      const total = items.reduce((a, i) => a + i.weight, 0);
      let r = next() * total;
      for (const item of items) {
        r -= item.weight;
        if (r < 0) return item;
      }
      return items[items.length - 1];
    },
    get state() {
      return s;
    },
    seed: seed >>> 0,
  };
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

/** Fisher–Yates shuffle of a copy, driven by the given RNG. */
export function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
