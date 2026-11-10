/**
 * Round resolution. Pure and deterministic given the RNG draws: no clocks,
 * no I/O, no floating point in anything that affects a payout.
 *
 * A round is resolved in full before anything is shown. The client only
 * replays the returned record, so presentation (skipping, turbo, a dropped
 * connection) can never change an outcome.
 */
import { BET_COINS, REELS, ROWS, type MathModel, type ModeStrips } from './model';
import type { Rng } from './rng';
import { CRATE, PAY_SYMBOLS, SCATTER, WILD } from './symbols';

export type RoundMode = 'spin' | 'buy';

export interface WayWin {
  symbol: number;
  /** Number of consecutive reels from the left (3, 4 or 5). */
  reels: number;
  ways: number;
  /** Coins before the Vault multiplier: pay × ways. */
  coins: number;
}

export interface SpinStep {
  kind: 'base' | 'free';
  /** 1-based free-spin number; 0 for the base spin. */
  index: number;
  /** Strip position of the top visible row on each reel. */
  stops: number[];
  /** grid[reel][row], as landed (crates still closed). */
  grid: number[][];
  /** Symbol revealed by the crates in view, or -1 when no crate landed. */
  reveal: number;
  wins: WayWin[];
  scatters: number;
  /** Coins paid by scatters (base game only). */
  scatterCoins: number;
  wildsLanded: number;
  /** Multiplier applied to this spin's way wins (always 1 in the base game). */
  multiplier: number;
  /** Free spins awarded by this spin. */
  spinsAwarded: number;
  /** Free spins left after this spin. */
  spinsRemaining: number;
  /** Coins this spin adds to the round, after the multiplier and the win cap. */
  coins: number;
}

export interface RoundOutcome {
  model: string;
  mode: RoundMode;
  steps: SpinStep[];
  /** Total round win in coins (total bet = 20 coins). */
  totalCoins: number;
  /** True when the round was cut short by the maximum-win rule. */
  capped: boolean;
}

function windowAt(strips: number[][], stops: number[]): number[][] {
  const grid: number[][] = new Array(REELS);
  for (let r = 0; r < REELS; r++) {
    const strip = strips[r];
    const n = strip.length;
    const col = new Array<number>(ROWS);
    let p = stops[r];
    for (let i = 0; i < ROWS; i++) {
      col[i] = strip[p];
      if (++p === n) p = 0;
    }
    grid[r] = col;
  }
  return grid;
}

function countSymbol(grid: number[][], sym: number): number {
  let c = 0;
  for (let r = 0; r < REELS; r++) {
    const col = grid[r];
    for (let i = 0; i < ROWS; i++) if (col[i] === sym) c++;
  }
  return c;
}

function drawReveal(mode: ModeStrips, rng: Rng): number {
  const w = mode.revealWeights;
  let total = 0;
  for (let i = 0; i < PAY_SYMBOLS; i++) total += w[i];
  let x = rng.nextInt(total);
  for (let i = 0; i < PAY_SYMBOLS; i++) {
    if (x < w[i]) return i;
    x -= w[i];
  }
  /* c8 ignore next */
  throw new Error('unreachable');
}

/**
 * All-ways evaluation, left to right. For each paying symbol the win is
 * pay(symbol, n) × the product, over the first n reels, of the number of
 * matching positions (the symbol itself, Wilds, and crates that revealed it).
 */
export function evaluateWays(model: MathModel, grid: number[][], reveal: number): WayWin[] {
  const wins: WayWin[] = [];
  const first = grid[0];
  for (let s = 0; s < PAY_SYMBOLS; s++) {
    // A way must start on reel 1, which carries no Wilds.
    let present = false;
    for (let i = 0; i < ROWS; i++) {
      const v = first[i];
      if (v === s || (v === CRATE && reveal === s)) {
        present = true;
        break;
      }
    }
    if (!present) continue;
    let ways = 1;
    let reels = 0;
    for (let r = 0; r < REELS; r++) {
      const col = grid[r];
      let c = 0;
      for (let i = 0; i < ROWS; i++) {
        const v = col[i];
        if (v === s || v === WILD || (v === CRATE && reveal === s)) c++;
      }
      if (c === 0) break;
      ways *= c;
      reels++;
    }
    if (reels >= 3) {
      wins.push({ symbol: s, reels, ways, coins: model.pays[s][reels - 3] * ways });
    }
  }
  return wins;
}

/** Evaluates one landed window. Shared by play, replay verification and tests. */
export function evaluateSpin(
  model: MathModel,
  kind: 'base' | 'free',
  stops: number[],
  reveal: number,
): Pick<SpinStep, 'grid' | 'wins' | 'scatters' | 'wildsLanded'> & { waysCoins: number } {
  const mode = kind === 'base' ? model.base : model.free;
  const grid = windowAt(mode.strips, stops);
  const wins = evaluateWays(model, grid, reveal);
  let waysCoins = 0;
  for (const w of wins) waysCoins += w.coins;
  return {
    grid,
    wins,
    waysCoins,
    scatters: countSymbol(grid, SCATTER),
    wildsLanded: countSymbol(grid, WILD),
  };
}

function drawStops(mode: ModeStrips, rng: Rng): number[] {
  const stops = new Array<number>(REELS);
  for (let r = 0; r < REELS; r++) stops[r] = rng.nextInt(mode.strips[r].length);
  return stops;
}

function hasCrate(mode: ModeStrips, stops: number[]): boolean {
  for (let r = 0; r < REELS; r++) {
    const strip = mode.strips[r];
    const n = strip.length;
    for (let i = 0; i < ROWS; i++) if (strip[(stops[r] + i) % n] === CRATE) return true;
  }
  return false;
}

function scattersAt(mode: ModeStrips, stops: number[]): number {
  let c = 0;
  for (let r = 0; r < REELS; r++) {
    const strip = mode.strips[r];
    const n = strip.length;
    for (let i = 0; i < ROWS; i++) if (strip[(stops[r] + i) % n] === SCATTER) c++;
  }
  return c;
}

/**
 * Chains evaluated spins into a round: applies the Vault multiplier, free-spin
 * awards and the maximum-win rule. `next` supplies the stops and reveal for
 * each spin, which lets the same code serve live play and replay verification.
 */
function buildRound(
  model: MathModel,
  mode: RoundMode,
  next: (kind: 'base' | 'free', index: number) => { stops: number[]; reveal: number },
): RoundOutcome {
  const capCoins = model.maxWinBets * BET_COINS;
  const steps: SpinStep[] = [];
  let total = 0;
  let capped = false;

  const add = (coins: number): number => {
    if (total + coins >= capCoins) {
      const granted = capCoins - total;
      total = capCoins;
      capped = true;
      return granted;
    }
    total += coins;
    return coins;
  };

  // Base spin.
  const b = next('base', 0);
  const be = evaluateSpin(model, 'base', b.stops, b.reveal);
  const scatterCoins = be.scatters >= 3 ? model.scatterPays[Math.min(be.scatters, 5) - 3] : 0;
  const awarded = be.scatters >= 3 ? model.freeSpinsAward[Math.min(be.scatters, 5) - 3] : 0;
  const baseCoins = add(be.waysCoins + scatterCoins);
  let remaining = capped ? 0 : awarded;
  steps.push({
    kind: 'base',
    index: 0,
    stops: b.stops,
    grid: be.grid,
    reveal: b.reveal,
    wins: be.wins,
    scatters: be.scatters,
    scatterCoins,
    wildsLanded: be.wildsLanded,
    multiplier: 1,
    spinsAwarded: awarded,
    spinsRemaining: remaining,
    coins: baseCoins,
  });

  // The Vault: free spins with a multiplier that only ever grows.
  let multiplier = 1;
  let granted = awarded;
  let index = 0;
  while (remaining > 0) {
    index++;
    remaining--;
    const f = next('free', index);
    const fe = evaluateSpin(model, 'free', f.stops, f.reveal);
    multiplier = Math.min(multiplier + fe.wildsLanded, model.maxMultiplier);
    const extra = Math.min(fe.scatters, model.maxFreeSpins - granted);
    granted += extra;
    remaining += extra;
    const coins = add(fe.waysCoins * multiplier);
    if (capped) remaining = 0;
    steps.push({
      kind: 'free',
      index,
      stops: f.stops,
      grid: fe.grid,
      reveal: f.reveal,
      wins: fe.wins,
      scatters: fe.scatters,
      scatterCoins: 0,
      wildsLanded: fe.wildsLanded,
      multiplier,
      spinsAwarded: capped ? 0 : extra,
      spinsRemaining: remaining,
      coins,
    });
  }

  return { model: model.id, mode, steps, totalCoins: total, capped };
}

/** Plays one round. `buy` conditions the base spin on landing 3+ scatters. */
export function resolveRound(model: MathModel, rng: Rng, mode: RoundMode = 'spin'): RoundOutcome {
  return buildRound(model, mode, (kind) => {
    const strips = kind === 'base' ? model.base : model.free;
    let stops = drawStops(strips, rng);
    if (kind === 'base' && mode === 'buy') {
      // Rejection sampling: the bought spin is an ordinary base spin drawn
      // from the same strips, conditioned on triggering the feature.
      while (scattersAt(strips, stops) < 3) stops = drawStops(strips, rng);
    }
    const reveal = hasCrate(strips, stops) ? drawReveal(strips, rng) : -1;
    return { stops, reveal };
  });
}

/**
 * Recomputes a stored round from its recorded stops and reveals and checks
 * every figure. Used for audit and dispute resolution: a record that does
 * not verify was not produced by this model.
 */
export function verifyRound(model: MathModel, outcome: RoundOutcome): { ok: boolean; reason?: string } {
  if (outcome.model !== model.id) return { ok: false, reason: 'model mismatch' };
  const recorded = outcome.steps;
  let i = 0;
  let rebuilt: RoundOutcome;
  try {
    rebuilt = buildRound(model, outcome.mode, (kind) => {
      const step = recorded[i++];
      if (!step || step.kind !== kind) throw new Error('step sequence mismatch');
      const strips = kind === 'base' ? model.base : model.free;
      if (step.stops.length !== REELS) throw new Error('bad stops');
      step.stops.forEach((p, r) => {
        if (!Number.isInteger(p) || p < 0 || p >= strips.strips[r].length) throw new Error('stop out of range');
      });
      const crate = hasCrate(strips, step.stops);
      if (crate !== step.reveal >= 0) throw new Error('reveal presence mismatch');
      if (crate && (step.reveal >= PAY_SYMBOLS || strips.revealWeights[step.reveal] === 0)) {
        throw new Error('impossible reveal');
      }
      return { stops: step.stops, reveal: step.reveal };
    });
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  if (i !== recorded.length) return { ok: false, reason: 'extra steps' };
  if (outcome.mode === 'buy' && rebuilt.steps[0].scatters < 3) return { ok: false, reason: 'buy without trigger' };
  if (JSON.stringify(rebuilt) !== JSON.stringify(outcome)) return { ok: false, reason: 'figures differ' };
  return { ok: true };
}
