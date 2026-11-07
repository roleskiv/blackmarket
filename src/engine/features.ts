/**
 * Feature resolution — Black Market Crates, the Dealer's Hand and the bonus
 * persistent modifiers. Every function is pure apart from the RNG it is given
 * and mutates only the grid passed in, returning an explicit list of changes
 * so the UI can animate exactly what the engine decided.
 */
import { FEATURE_CONFIG, REELS, ROWS, type CrateEffectKind } from '../config/game';
import { symbolsOfRarity, type SymbolId } from '../config/symbols';
import { shuffled, type Rng } from './rng';
import type { Cell, CellChange, FeatureStep, Grid } from './types';

const COMMON = symbolsOfRarity('common');
const UNCOMMON = symbolsOfRarity('uncommon');
const PREMIUM = symbolsOfRarity('premium');

/** Wilds may only be placed on reels 2–5 (index 1–4), matching the reel strips. */
const WILD_REELS = [1, 2, 3, 4];

function setCell(grid: Grid, cell: Cell, to: SymbolId, changes: CellChange[]) {
  const from = grid[cell.reel][cell.row];
  if (from === to) return;
  grid[cell.reel][cell.row] = to;
  changes.push({ ...cell, from, to });
}

function cellsWhere(grid: Grid, pred: (s: SymbolId, c: Cell) => boolean): Cell[] {
  const out: Cell[] = [];
  for (let reel = 0; reel < REELS; reel++)
    for (let row = 0; row < ROWS; row++) if (pred(grid[reel][row], { reel, row })) out.push({ reel, row });
  return out;
}

/** Choose a symbol from `pool`, preferring ones that are on the grid. */
function pickPresent(rng: Rng, grid: Grid, pool: SymbolId[]): SymbolId {
  const present = pool.filter((s) => grid.some((col) => col.includes(s)));
  const from = present.length ? present : pool;
  return from[rng.int(from.length)];
}

export function transformAll(grid: Grid, from: SymbolId, to: SymbolId): CellChange[] {
  const changes: CellChange[] = [];
  for (const c of cellsWhere(grid, (s) => s === from)) setCell(grid, c, to, changes);
  return changes;
}

export function addRandomWilds(rng: Rng, grid: Grid, count: number): CellChange[] {
  const candidates = shuffled(
    rng,
    cellsWhere(grid, (s, c) => WILD_REELS.includes(c.reel) && s !== 'wild' && s !== 'scatter'),
  );
  const changes: CellChange[] = [];
  for (const c of candidates.slice(0, count)) setCell(grid, c, 'wild', changes);
  return changes;
}

/**
 * Resolve a Black Market Crate. Rules:
 *  - add_wilds:       2–4 Wilds land on random non-scatter, non-wild cells of reels 2–5.
 *  - transform_low:   one card suit (preferring one on screen) → one random uncommon symbol, everywhere.
 *  - multiplier:      ×2 / ×3 / ×5 on all line wins this spin.
 *  - expanding_wild:  one of reels 2–4 becomes fully Wild (scatters stay).
 *  - upgrade_premium: one uncommon symbol (preferring one on screen) → one random premium, everywhere.
 */
export function resolveCrate(rng: Rng, grid: Grid, forced?: CrateEffectKind): FeatureStep & { type: 'crate' } {
  const kind = forced ?? rng.weighted(FEATURE_CONFIG.crateEffects).kind;
  switch (kind) {
    case 'add_wilds': {
      const [lo, hi] = FEATURE_CONFIG.addWildsRange;
      const n = lo + rng.int(hi - lo + 1);
      return { type: 'crate', effect: kind, changes: addRandomWilds(rng, grid, n), multiplier: 1 };
    }
    case 'transform_low': {
      const from = pickPresent(rng, grid, COMMON);
      const to = UNCOMMON[rng.int(UNCOMMON.length)];
      return { type: 'crate', effect: kind, changes: transformAll(grid, from, to), multiplier: 1, from, to };
    }
    case 'multiplier': {
      const m = rng.weighted(FEATURE_CONFIG.multiplierValues).value;
      return { type: 'crate', effect: kind, changes: [], multiplier: m };
    }
    case 'expanding_wild': {
      const reels = FEATURE_CONFIG.expandingWildReels;
      const reel = reels[rng.int(reels.length)];
      const changes: CellChange[] = [];
      for (let row = 0; row < ROWS; row++)
        if (grid[reel][row] !== 'scatter') setCell(grid, { reel, row }, 'wild', changes);
      return { type: 'crate', effect: kind, changes, multiplier: 1, reel };
    }
    case 'upgrade_premium': {
      const from = pickPresent(rng, grid, UNCOMMON);
      const to = PREMIUM[rng.int(PREMIUM.length)];
      return { type: 'crate', effect: kind, changes: transformAll(grid, from, to), multiplier: 1, from, to };
    }
  }
}

/**
 * Resolve the Dealer's Hand. Rules: the dealer deals one symbol (weighted
 * table in FEATURE_CONFIG) and points at one reel; every non-scatter cell on
 * that reel becomes that symbol. A Wild is never dealt onto reel 1.
 */
export function resolveDealerHand(rng: Rng, grid: Grid): FeatureStep & { type: 'dealer_hand' } {
  const symbol = rng.weighted(FEATURE_CONFIG.dealerHandSymbols).symbol;
  const reels = symbol === 'wild' ? WILD_REELS : [0, 1, 2, 3, 4];
  const reel = reels[rng.int(reels.length)];
  const changes: CellChange[] = [];
  for (let row = 0; row < ROWS; row++)
    if (grid[reel][row] !== 'scatter') setCell(grid, { reel, row }, symbol, changes);
  return { type: 'dealer_hand', reel, symbol, changes };
}
