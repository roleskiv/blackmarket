import { REELS, ROWS } from '../config/game';
import { SYMBOLS, SYMBOL_IDS, type SymbolId } from '../config/symbols';
import type { Rng } from './rng';
import type { Grid } from './types';

/**
 * Probability-weighted symbol generation.
 * Each cell is drawn independently from its reel's weight table, with one rule:
 * at most one scatter per reel (keeps scatter counting meaningful, 0–5).
 */
export function reelWeightTable(reel: number) {
  return SYMBOL_IDS.map((id) => ({ id, weight: SYMBOLS[id].weights[reel] })).filter((w) => w.weight > 0);
}

const TABLES = Array.from({ length: REELS }, (_, r) => reelWeightTable(r));
const NO_SCATTER_TABLES = TABLES.map((t) => t.filter((e) => e.id !== 'scatter'));

export function generateGrid(rng: Rng): Grid {
  const grid: Grid = [];
  for (let reel = 0; reel < REELS; reel++) {
    const col: SymbolId[] = [];
    let hasScatter = false;
    for (let row = 0; row < ROWS; row++) {
      const id = rng.weighted(hasScatter ? NO_SCATTER_TABLES[reel] : TABLES[reel]).id;
      if (id === 'scatter') hasScatter = true;
      col.push(id);
    }
    grid.push(col);
  }
  return grid;
}

export const cloneGrid = (g: Grid): Grid => g.map((c) => c.slice());

/** Build a grid from a row-major literal (rows of 5) — handy in tests. */
export function gridFromRows(rows: SymbolId[][]): Grid {
  const grid: Grid = [];
  for (let reel = 0; reel < REELS; reel++) grid.push(rows.map((r) => r[reel]));
  return grid;
}

/** Random filler symbols for spinning-reel visuals only (never used for outcomes). */
export function visualFiller(count: number): SymbolId[] {
  const pool = SYMBOL_IDS.filter((s) => s !== 'scatter');
  return Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
}
