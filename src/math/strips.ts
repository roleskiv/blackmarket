/**
 * Reel-strip construction rules and helpers used by the tuner and the tests.
 */
import { ROWS } from '../engine/model';
import { SeededRng } from '../engine/rng';
import { CRATE, SCATTER, WILD } from '../engine/symbols';

export interface StripRules {
  /** Longest allowed run per symbol id. */
  maxRun: number[];
  /** Whether wilds may appear on this reel. */
  allowWild: boolean;
}

/** Run-length limits by symbol id for a strip set. */
export function rulesFor(kind: 'base' | 'free', reel: number): StripRules {
  const maxRun = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, kind === 'free' ? 2 : 1, 1, 4];
  if (kind === 'free') maxRun[8] = maxRun[9] = maxRun[10] = maxRun[11] = 3;
  return { maxRun, allowWild: reel >= 1 && reel <= 3 };
}

/** Checks the structural rules a strip must satisfy (circularly). */
export function stripViolations(strip: readonly number[], rules: StripRules): number {
  const n = strip.length;
  let bad = 0;
  // Find a run boundary to start from so circular runs are measured whole.
  let start = 0;
  while (start < n && strip[start] === strip[(start + n - 1) % n]) start++;
  if (start === n) return n; // single-symbol strip
  let run = 0;
  for (let t = 0; t < n; t++) {
    const i = (start + t) % n;
    const s = strip[i];
    run = t > 0 && strip[(i + n - 1) % n] === s ? run + 1 : 1;
    if (run > rules.maxRun[s]) bad++;
    if (s === WILD && !rules.allowWild) bad++;
    if (s === SCATTER) {
      for (let d = 1; d < ROWS; d++) if (strip[(i + d) % n] === SCATTER) bad++;
      // Keep specials visually apart: no wild or crate touching a scatter.
      const prev = strip[(i + n - 1) % n];
      const next = strip[(i + 1) % n];
      if (prev === WILD || next === WILD || prev === CRATE || next === CRATE) bad++;
    }
  }
  return bad;
}

/** Builds a strip from [symbol, runLength] blocks, shuffled until it satisfies the rules. */
export function arrangeBlocks(blocks: Array<[number, number]>, rules: StripRules, seed: number): number[] {
  const rng = new SeededRng(seed);
  const order = blocks.map((b) => b);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const flat = () => order.flatMap(([s, h]) => new Array<number>(h).fill(s));
  const cost = () => {
    let merges = 0;
    for (let i = 0; i < order.length; i++) {
      if (order[i][0] === order[(i + 1) % order.length][0]) merges++;
    }
    return merges * 10 + stripViolations(flat(), rules);
  };
  let c = cost();
  for (let iter = 0; iter < 200000 && c > 0; iter++) {
    const i = rng.nextInt(order.length);
    const j = rng.nextInt(order.length);
    if (i === j) continue;
    [order[i], order[j]] = [order[j], order[i]];
    const c2 = cost();
    if (c2 <= c) c = c2;
    else [order[i], order[j]] = [order[j], order[i]];
  }
  if (c > 0) throw new Error('could not arrange strip');
  return flat();
}

export function symbolCounts(strip: readonly number[]): number[] {
  const out = new Array<number>(15).fill(0);
  for (const s of strip) out[s]++;
  return out;
}
