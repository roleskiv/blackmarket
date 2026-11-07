import { describe, expect, it } from 'vitest';
import { evaluateLine, evaluateLines, evaluateScatter, gridFromRows } from '../src/engine';
import { PAYLINES } from '../src/config/paylines';
import { SYMBOLS, type SymbolId } from '../src/config/symbols';

const X: SymbolId = 'pocket_watch'; // filler
// A grid with no line wins: reel 2 shares no symbol with reel 1, so no line can start.
const blankRows = (): SymbolId[][] => [
  ['spade', 'pocket_watch', 'club', 'diamond', 'spade'],
  ['heart', 'candle_skull', 'diamond', 'spade', 'heart'],
  ['club', 'plague_mask', 'spade', 'heart', 'club'],
  ['diamond', 'crystal_bag', 'heart', 'club', 'diamond'],
];

describe('paylines', () => {
  it('defines exactly 25 unique 5-reel paylines within 4 rows', () => {
    expect(PAYLINES).toHaveLength(25);
    const keys = new Set(PAYLINES.map((p) => p.join(',')));
    expect(keys.size).toBe(25);
    for (const p of PAYLINES) {
      expect(p).toHaveLength(5);
      p.forEach((r) => expect(r >= 0 && r <= 3).toBe(true));
    }
  });
});

describe('line evaluation', () => {
  it('pays 3, 4 and 5 of a kind from the left', () => {
    expect(evaluateLine(['heart', 'heart', 'heart', X, X])).toMatchObject({ symbol: 'heart', count: 3, pay: SYMBOLS.heart.pays[3] });
    expect(evaluateLine(['heart', 'heart', 'heart', 'heart', X])).toMatchObject({ count: 4, pay: SYMBOLS.heart.pays[4] });
    expect(evaluateLine(['heart', 'heart', 'heart', 'heart', 'heart'])).toMatchObject({ count: 5, pay: SYMBOLS.heart.pays[5] });
  });

  it('does not pay 2 of a kind or non-leftmost runs', () => {
    expect(evaluateLine(['heart', 'heart', X, 'heart', 'heart'])).toBeNull();
    expect(evaluateLine([X, 'heart', 'heart', 'heart', 'heart'])).toBeNull();
  });

  it('a no-win grid produces no line wins', () => {
    expect(evaluateLines(gridFromRows(blankRows()), 4)).toEqual([]);
  });

  it('multiplies by line bet and multiplier', () => {
    const rows = blankRows();
    rows[0] = ['horned_skull', 'horned_skull', 'horned_skull', 'spade', 'heart'];
    const wins = evaluateLines(gridFromRows(rows), 4, 3);
    expect(wins).toHaveLength(1);
    const top = wins.find((w) => w.line === 0)!;
    expect(top.win).toBe(SYMBOLS.horned_skull.pays[3] * 4 * 3);
    expect(top.cells).toEqual([{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }]);
  });

  it('evaluates multiple winning lines in one spin', () => {
    const rows = blankRows();
    rows[0] = ['cursed_dagger', 'cursed_dagger', 'cursed_dagger', 'spade', 'heart'];
    rows[3] = ['crystal_bag', 'crystal_bag', 'crystal_bag', 'crystal_bag', 'heart'];
    const wins = evaluateLines(gridFromRows(rows), 1);
    expect(wins.map((w) => w.line)).toEqual(expect.arrayContaining([0, 3]));
  });
});

describe('wild substitution', () => {
  it('wild substitutes for regular symbols', () => {
    expect(evaluateLine(['heart', 'wild', 'heart', X, X])).toMatchObject({ symbol: 'heart', count: 3 });
    expect(evaluateLine(['wild', 'wild', 'heart', 'heart', X])).toMatchObject({ symbol: 'heart', count: 4 });
  });

  it('wild does not substitute for scatter, and scatter breaks a line', () => {
    expect(evaluateLine(['scatter', 'wild', 'wild', X, X])).toBeNull();
    expect(evaluateLine(['heart', 'heart', 'scatter', 'heart', 'heart'])).toBeNull();
    expect(evaluateLine(['wild', 'wild', 'scatter', X, X])).toBeNull();
  });

  it('pays the better of a pure-wild run or the substituted symbol', () => {
    // 3 wilds then a heart: wild ×3 (150) beats heart ×4 (50)
    expect(evaluateLine(['wild', 'wild', 'wild', 'heart', X])).toMatchObject({ symbol: 'wild', count: 3, pay: SYMBOLS.wild.pays[3] });
    // 2 wilds then 3 horned skulls: skull ×5 (2500) beats nothing
    expect(evaluateLine(['wild', 'wild', 'horned_skull', 'horned_skull', 'horned_skull'])).toMatchObject({ symbol: 'horned_skull', count: 5 });
    expect(evaluateLine(['wild', 'wild', 'wild', 'wild', 'wild'])).toMatchObject({ symbol: 'wild', count: 5, pay: SYMBOLS.wild.pays[5] });
  });
});

describe('scatter', () => {
  it('counts scatters anywhere and pays on total bet', () => {
    const rows = blankRows();
    rows[0][0] = 'scatter';
    rows[2][2] = 'scatter';
    rows[3][4] = 'scatter';
    const s = evaluateScatter(gridFromRows(rows), 100);
    expect(s.count).toBe(3);
    expect(s.win).toBe(SYMBOLS.scatter.pays[3] * 100);
  });
  it('two scatters pay nothing', () => {
    const rows = blankRows();
    rows[0][0] = 'scatter';
    rows[1][1] = 'scatter';
    expect(evaluateScatter(gridFromRows(rows), 100).win).toBe(0);
  });
});
