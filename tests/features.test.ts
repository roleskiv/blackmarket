import { describe, expect, it } from 'vitest';
import { createRng, gridFromRows, resolveCrate, resolveDealerHand, resolveSpin, cloneGrid, generateGrid, startSpin, finishSpin, evaluateLines } from '../src/engine';
import { SYMBOLS, type SymbolId } from '../src/config/symbols';
import type { CrateEffectKind } from '../src/config/game';

const rows: SymbolId[][] = [
  ['spade', 'heart', 'club', 'diamond', 'spade'],
  ['heart', 'pocket_watch', 'diamond', 'scatter', 'heart'],
  ['club', 'diamond', 'spade', 'heart', 'crystal_bag'],
  ['diamond', 'spade', 'heart', 'club', 'diamond'],
];
const base = () => gridFromRows(rows);

describe('crate effects', () => {
  it('every change record matches the grid diff, and scatters are never touched', () => {
    const effects: CrateEffectKind[] = ['add_wilds', 'transform_low', 'multiplier', 'expanding_wild', 'upgrade_premium'];
    for (const e of effects) {
      for (let seed = 1; seed < 40; seed++) {
        const g = base();
        const before = cloneGrid(g);
        const step = resolveCrate(createRng(seed), g, e);
        for (const c of step.changes) {
          expect(before[c.reel][c.row]).toBe(c.from);
          expect(g[c.reel][c.row]).toBe(c.to);
          expect(c.from).not.toBe('scatter');
        }
        let diffs = 0;
        for (let r = 0; r < 5; r++) for (let w = 0; w < 4; w++) if (before[r][w] !== g[r][w]) diffs++;
        expect(diffs).toBe(step.changes.length);
        expect(g[3][1]).toBe('scatter');
      }
    }
  });

  it('add_wilds places 2–4 wilds on reels 2–5 only', () => {
    for (let seed = 1; seed < 50; seed++) {
      const step = resolveCrate(createRng(seed), base(), 'add_wilds');
      expect(step.changes.length).toBeGreaterThanOrEqual(2);
      expect(step.changes.length).toBeLessThanOrEqual(4);
      step.changes.forEach((c) => {
        expect(c.to).toBe('wild');
        expect(c.reel).toBeGreaterThan(0);
      });
    }
  });

  it('transform_low converts every copy of one suit into one uncommon symbol', () => {
    const g = base();
    const step = resolveCrate(createRng(7), g, 'transform_low');
    expect(SYMBOLS[step.from!].rarity).toBe('common');
    expect(SYMBOLS[step.to!].rarity).toBe('uncommon');
    expect(g.flat()).not.toContain(step.from);
  });

  it('upgrade_premium converts one uncommon symbol into a premium', () => {
    const g = base();
    const step = resolveCrate(createRng(3), g, 'upgrade_premium');
    expect(SYMBOLS[step.from!].rarity).toBe('uncommon');
    expect(SYMBOLS[step.to!].rarity).toBe('premium');
    expect(g.flat()).not.toContain(step.from);
  });

  it('expanding_wild fills one middle reel with wilds (except scatters)', () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = base();
      const step = resolveCrate(createRng(seed), g, 'expanding_wild');
      expect([1, 2, 3]).toContain(step.reel);
      g[step.reel!].forEach((s) => expect(s === 'wild' || s === 'scatter').toBe(true));
    }
  });

  it('multiplier crate multiplies line wins only', () => {
    const r = [...rows.map((x) => x.slice())];
    r[0] = ['horned_skull', 'horned_skull', 'horned_skull', 'spade', 'heart'];
    const grid = gridFromRows(r);
    const plain = resolveSpin({ rng: createRng(1), bet: 100, forceGrid: grid, disableFeatures: true });
    const pending = startSpin({ rng: createRng(1), bet: 100, forceGrid: grid, forceCrate: 'multiplier' });
    const idx = pending.offers!.findIndex((o) => o.step.effect === 'multiplier');
    const boosted = finishSpin(pending, idx);
    expect([2, 3, 5]).toContain(boosted.multiplier);
    const linePlain = plain.lineWins.reduce((a, w) => a + w.win, 0);
    const lineBoost = boosted.lineWins.reduce((a, w) => a + w.win, 0);
    expect(lineBoost).toBe(linePlain * boosted.multiplier);
  });
});

describe("dealer's hand", () => {
  it('turns one reel into the dealt symbol and never deals a wild to reel 1', () => {
    for (let seed = 1; seed < 200; seed++) {
      const g = generateGrid(createRng(seed * 31));
      const step = resolveDealerHand(createRng(seed), g);
      g[step.reel].forEach((s) => expect(s === step.symbol || s === 'scatter').toBe(true));
      if (step.symbol === 'wild') expect(step.reel).toBeGreaterThan(0);
    }
  });

  it('final grid (not initial grid) is what gets evaluated', () => {
    const res = resolveSpin({ rng: createRng(99), bet: 100, forceGrid: base(), forceDealerHand: true });
    expect(res.steps[0].type).toBe('dealer_hand');
    expect(res.finalGrid).not.toEqual(res.initialGrid);
  });
});

describe('crate pick (1 of 3)', () => {
  it('offers three different, fully resolved effects and applies only the picked one', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = startSpin({ rng: createRng(seed), bet: 100, forceGrid: base(), forceCrate: 'add_wilds' });
      expect(p.offers).toHaveLength(3);
      expect(new Set(p.offers!.map((o) => o.step.effect)).size).toBe(3);
      const pick = seed % 3;
      const r = finishSpin(p, pick);
      expect(r.cratePick).toBe(pick);
      expect(r.crateOffers!.map((o) => o.effect)).toEqual(p.offers!.map((o) => o.step.effect));
      expect(r.finalGrid).toEqual(p.offers![pick].grid);
      expect(r.steps.filter((s) => s.type === 'crate')).toHaveLength(1);
    }
  });

  it('rejects an invalid pick', () => {
    const p = startSpin({ rng: createRng(2), bet: 100, forceGrid: base(), forceCrate: 'multiplier' });
    expect(() => finishSpin(p, 3)).toThrow();
  });
});

describe('multiplier potions', () => {
  it('multiply only line wins passing through the potion cell', () => {
    const r = rows.map((x) => x.slice());
    r[0] = ['horned_skull', 'horned_skull', 'horned_skull', 'spade', 'heart'];
    const grid = gridFromRows(r);
    const on = evaluateLines(grid, 4, 1, [{ cell: { reel: 1, row: 0 }, value: 3 }]);
    const off = evaluateLines(grid, 4, 1, [{ cell: { reel: 4, row: 3 }, value: 3 }]);
    const top = (w: typeof on) => w.find((x) => x.line === 0)!;
    expect(top(on).win).toBe(top(off).win * 3);
    expect(top(on).potionMultiplier).toBe(3);
    expect(top(off).potionMultiplier).toBe(1);
  });

  it('a forced potion is reported as a step and stacks with other multipliers', () => {
    const r = rows.map((x) => x.slice());
    r[0] = ['horned_skull', 'horned_skull', 'horned_skull', 'spade', 'heart'];
    const res = resolveSpin({ rng: createRng(4), bet: 100, forceGrid: gridFromRows(r), disableFeatures: true, forcePotion: { cell: { reel: 0, row: 0 }, value: 5 } });
    expect(res.steps.some((s) => s.type === 'potion')).toBe(true);
    expect(res.lineWins.find((w) => w.line === 0)!.win).toBe(SYMBOLS.horned_skull.pays[3] * 4 * 5);
  });
});
