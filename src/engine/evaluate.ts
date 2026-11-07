import { PAYLINES } from '../config/paylines';
import { REELS, ROWS } from '../config/game';
import { SYMBOLS, type SymbolId } from '../config/symbols';
import type { Cell, Grid, LineWin, ScatterWin } from './types';

/**
 * Evaluate one payline, left → right.
 * Rules:
 *  - Wild substitutes for every symbol except the scatter.
 *  - The scatter never forms part of a line.
 *  - A line pays the higher of: (a) the leading run of pure wilds as Wild,
 *    or (b) the first non-wild symbol extended with wilds.
 *  - Only 3, 4 or 5 consecutive matches from reel 1 pay.
 */
export function evaluateLine(symbols: SymbolId[]): { symbol: SymbolId; count: number; pay: number } | null {
  let wildRun = 0;
  while (wildRun < symbols.length && symbols[wildRun] === 'wild') wildRun++;

  let best: { symbol: SymbolId; count: number; pay: number } | null = null;
  if (wildRun >= 3) {
    best = { symbol: 'wild', count: wildRun, pay: payFor('wild', wildRun) };
  }

  const base = symbols[wildRun];
  if (base !== undefined && base !== 'scatter') {
    let count = wildRun;
    while (count < symbols.length && (symbols[count] === base || symbols[count] === 'wild')) count++;
    if (count >= 3) {
      const pay = payFor(base, count);
      if (!best || pay > best.pay) best = { symbol: base, count, pay };
    }
  }
  return best;
}

export function payFor(symbol: SymbolId, count: number): number {
  if (count < 3) return 0;
  const c = Math.min(count, 5) as 3 | 4 | 5;
  return SYMBOLS[symbol].pays[c];
}

export function evaluateLines(grid: Grid, lineBet: number, multiplier = 1): LineWin[] {
  const wins: LineWin[] = [];
  PAYLINES.forEach((rows, line) => {
    const symbols = rows.map((row, reel) => grid[reel][row]);
    const res = evaluateLine(symbols);
    if (!res) return;
    const cells: Cell[] = rows.slice(0, res.count).map((row, reel) => ({ reel, row }));
    wins.push({
      line,
      symbol: res.symbol,
      count: res.count as 3 | 4 | 5,
      cells,
      basePay: res.pay,
      win: res.pay * lineBet * multiplier,
    });
  });
  return wins;
}

/** Scatters pay anywhere, as a multiple of the TOTAL bet. Not multiplied. */
export function evaluateScatter(grid: Grid, totalBet: number): ScatterWin {
  const cells: Cell[] = [];
  for (let reel = 0; reel < REELS; reel++)
    for (let row = 0; row < ROWS; row++) if (grid[reel][row] === 'scatter') cells.push({ reel, row });
  const count = cells.length;
  return { count, cells, win: count >= 3 ? payFor('scatter', count) * totalBet : 0 };
}
