import { describe, expect, it } from 'vitest';
import { SlotEngine, Wallet, InsufficientCreditsError, gridFromRows, applyArtifact, startBonus, createRng, rollArtifact, lockStickyWilds } from '../src/engine';
import { runSimulation } from '../src/engine/simulate';
import { FEATURE_CONFIG } from '../src/config/game';
import type { SymbolId } from '../src/config/symbols';

const scatterRows = (n: number): SymbolId[][] => {
  const rows: SymbolId[][] = [
    ['spade', 'heart', 'club', 'diamond', 'spade'],
    ['heart', 'club', 'diamond', 'spade', 'heart'],
    ['club', 'diamond', 'spade', 'heart', 'club'],
    ['diamond', 'spade', 'heart', 'club', 'diamond'],
  ];
  for (let i = 0; i < n; i++) rows[i % 4][i] = 'scatter';
  return rows;
};

describe('credit accounting', () => {
  it('debits the bet and credits the exact total win', () => {
    const e = new SlotEngine({ seed: 42, balance: 1000 });
    for (let i = 0; i < 200 && e.canSpin(); i++) {
      const before = e.balance;
      const o = e.spin();
      const cost = o.phase === 'base' ? o.result.bet : 0;
      expect(o.balanceBefore).toBe(before);
      expect(o.balanceAfter).toBe(before - cost + o.result.totalWin);
      expect(e.balance).toBe(o.balanceAfter);
    }
  });

  it('wallet rejects bets above balance and invalid amounts', () => {
    const w = new Wallet(50);
    expect(() => w.debit(100)).toThrow(InsufficientCreditsError);
    expect(() => w.debit(-5)).toThrow();
    expect(() => w.credit(1.5)).toThrow();
    w.debit(25);
    w.credit(10);
    expect(w.balance).toBe(35);
    expect(w.totalWagered).toBe(25);
    expect(w.totalWon).toBe(10);
  });

  it('free spins do not deduct a bet', () => {
    const e = new SlotEngine({ seed: 5, balance: 1000 });
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    expect(e.phase).toBe('bonus');
    const before = e.balance;
    const o = e.spin();
    expect(o.balanceAfter).toBe(before + o.result.totalWin);
  });
});

describe('scatter trigger & bonus state transitions', () => {
  it('3/4/5 scatters award the configured free spins', () => {
    for (const n of [3, 4, 5]) {
      const e = new SlotEngine({ seed: 1 });
      const o = e.spin({ forceGrid: gridFromRows(scatterRows(n)) });
      expect(o.bonusTriggered?.spins).toBe(FEATURE_CONFIG.freeSpinsAwarded[n]);
      expect(e.bonus?.spinsRemaining).toBe(FEATURE_CONFIG.freeSpinsAwarded[n]);
    }
  });

  it('2 scatters do not trigger', () => {
    const e = new SlotEngine({ seed: 1 });
    e.spin({ forceGrid: gridFromRows(scatterRows(2)) });
    expect(e.phase).toBe('base');
  });

  it('bonus runs to completion, sums wins and returns to base', () => {
    const e = new SlotEngine({ seed: 77, balance: 1000 });
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    const balanceAtStart = e.balance;
    let sum = 0;
    let last;
    let guard = 0;
    while (e.bonus && guard++ < 500) {
      last = e.spin();
      sum += last.result.totalWin;
      expect(last.phase).toBe('bonus');
    }
    expect(last!.bonusEnded).toBeDefined();
    expect(last!.bonusEnded!.totalWin).toBe(sum);
    expect(e.balance).toBe(balanceAtStart + sum);
    expect(e.phase).toBe('base');
  });

  it('bet is locked during the bonus', () => {
    const e = new SlotEngine({ seed: 1 });
    e.setBetIndex(0);
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    e.setBetIndex(5);
    expect(e.bet).toBe(25);
  });

  it('retrigger adds spins during the bonus', () => {
    const e = new SlotEngine({ seed: 3 });
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    const before = e.bonus!.spinsRemaining;
    const o = e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    const extra = o.result.artifact?.kind === 'hourglass' ? 2 : 0;
    expect(o.bonus!.spinsRemaining).toBe(before - 1 + FEATURE_CONFIG.retriggerSpins + extra);
  });

  it('artifacts persist and apply on later spins', () => {
    let b = startBonus(100, 10);
    b = applyArtifact(b, { kind: 'ledger' });
    b = applyArtifact(b, { kind: 'ledger' });
    b = applyArtifact(b, { kind: 'raven_feather' });
    b = applyArtifact(b, { kind: 'hourglass', extraSpins: 2 });
    b = applyArtifact(b, { kind: 'eye_sigil', from: 'spade', to: 'horned_skull' });
    expect(b.ledgers).toBe(2);
    expect(b.feathers).toBe(1);
    expect(b.spinsRemaining).toBe(12);
    expect(b.sigils).toEqual([{ from: 'spade', to: 'horned_skull' }]);
    expect(b.collected).toHaveLength(5);

    const e = new SlotEngine({ seed: 9 });
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    e.bonus = b;
    const o = e.spin();
    expect(o.result.multiplier % 3).toBe(0); // ledger ×3 (×crate if any)
    expect(o.result.finalGrid.flat()).not.toContain('spade');
    expect(o.result.steps.some((s) => s.type === 'raven_feather')).toBe(true);
  });

  it('raven feathers are capped', () => {
    let b = startBonus(100, 10);
    for (let i = 0; i < 6; i++) b = applyArtifact(b, { kind: 'raven_feather' });
    expect(b.feathers).toBe(FEATURE_CONFIG.maxWildFeathers);
    b.feathers = FEATURE_CONFIG.maxWildFeathers;
    const rng = createRng(1);
    for (let i = 0; i < 300; i++) expect(rollArtifact(rng, b)?.kind).not.toBe('raven_feather');
  });
});

describe('two-step spins (crate pick)', () => {
  it('debits on start, credits on pick, and blocks other spins meanwhile', () => {
    const e = new SlotEngine({ seed: 11, balance: 1000 });
    const s = e.startSpin({ forceCrate: 'add_wilds' });
    expect(s.crateOffers).toBe(3);
    expect(s.outcome).toBeUndefined();
    expect(e.balance).toBe(1000 - e.bet);
    expect(e.canSpin()).toBe(false);
    expect(() => e.startSpin()).toThrow();
    const o = e.pickCrate(2);
    expect(o.result.cratePick).toBe(2);
    expect(e.balance).toBe(1000 - e.bet + o.result.totalWin);
    expect(e.canSpin()).toBe(true);
  });

  it('settles immediately when no crate is offered', () => {
    const e = new SlotEngine({ seed: 11 });
    const s = e.startSpin({ forceDealerHand: true });
    expect(s.outcome).toBeDefined();
    expect(() => e.pickCrate(0)).toThrow();
  });
});

describe('iron shackles (sticky wilds)', () => {
  it('locks landed wilds up to the cap and re-applies them next spin', () => {
    let b = applyArtifact(startBonus(100, 10), { kind: 'iron_shackles' });
    const g = gridFromRows([
      ['spade', 'wild', 'club', 'wild', 'spade'],
      ['heart', 'club', 'wild', 'spade', 'heart'],
      ['club', 'diamond', 'spade', 'wild', 'club'],
      ['diamond', 'wild', 'heart', 'club', 'wild'],
    ]);
    b = lockStickyWilds(b, g);
    expect(b.stickyCells).toHaveLength(FEATURE_CONFIG.maxStickyWilds);
    const e = new SlotEngine({ seed: 3 });
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    e.bonus = { ...b, ledgers: 0 };
    const o = e.spin();
    for (const c of b.stickyCells) {
      const s = o.result.finalGrid[c.reel][c.row];
      expect(s === 'wild' || s === 'scatter').toBe(true);
    }
  });
});

describe('round win cap', () => {
  it('reduces a win that would exceed the cap and ends the bonus', () => {
    const e = new SlotEngine({ seed: 8, balance: 1000 });
    e.setBetIndex(0); // 25
    e.spin({ forceGrid: gridFromRows(scatterRows(3)) });
    const wilds = gridFromRows(Array.from({ length: 4 }, () => ['wild', 'wild', 'wild', 'wild', 'wild'] as SymbolId[]));
    e.bonus!.ledgers = 50;
    let last;
    let guard = 0;
    while (e.bonus && guard++ < 100) last = e.spin({ forceGrid: wilds, forceDealerHand: false });
    const total = e.history.filter((h) => h.phase === 'bonus').reduce((a, h) => a + h.win, 0) + e.history[e.history.length - 1].win;
    expect(last!.result.capped).toBe(true);
    expect(last!.bonusEnded?.capped).toBe(true);
    expect(total).toBe(FEATURE_CONFIG.maxWinX * 25);
  });
});

describe('seeded replay', () => {
  it('the same seed reproduces the same outcome sequence', () => {
    const a = new SlotEngine({ seed: 2024 });
    const b = new SlotEngine({ seed: 2024 });
    for (let i = 0; i < 500; i++) {
      const oa = a.spin();
      const ob = b.spin();
      expect(ob.result).toEqual(oa.result);
      if (!a.canSpin()) break;
    }
    expect(b.balance).toBe(a.balance);
  });

  it('different seeds diverge', () => {
    const a = new SlotEngine({ seed: 1 }).spin().result.initialGrid;
    const b = new SlotEngine({ seed: 2 }).spin().result.initialGrid;
    expect(a).not.toEqual(b);
  });
});

describe('simulation (100,000 spins)', () => {
  it('runs and reports sane estimates', () => {
    const r = runSimulation(100_000, 777);
    console.log(
      `[simulation estimate] RTP ${(r.rtp * 100).toFixed(2)}% · hit ${(r.hitFrequency * 100).toFixed(2)}% · bonus 1 in ${(1 / r.bonusFrequency).toFixed(0)}`,
    );
    expect(r.spins).toBe(100_000);
    expect(r.rtp).toBeGreaterThan(0.5);
    expect(r.rtp).toBeLessThan(1.5);
    expect(r.hitFrequency).toBeGreaterThan(0.1);
    expect(r.bonusesTriggered).toBeGreaterThan(0);
  });
});

describe('bonus buy', () => {
  it('debits the price, opens the vault at the current bet and settles like a normal bonus', () => {
    const e = new SlotEngine({ seed: 4242, balance: 1_000_000 });
    e.setBetIndex(2);
    const bet = e.bet;
    const price = FEATURE_CONFIG.bonusBuys[0].priceX * bet;
    const buy = e.buyBonus(0);
    expect(buy.cost).toBe(price);
    expect(e.balance).toBe(1_000_000 - price);
    expect(e.phase).toBe('bonus');
    expect(e.bonus!.bet).toBe(bet);
    expect(e.bonus!.spinsRemaining).toBe(FEATURE_CONFIG.bonusBuys[0].spins);
    let won = 0;
    let ended = false;
    while (e.bonus) {
      const o = e.spin();
      won += o.result.totalWin;
      if (o.bonusEnded) ended = true;
    }
    expect(ended).toBe(true);
    expect(e.balance).toBe(1_000_000 - price + won);
  });

  it('refuses a buy during the bonus or without enough credits', () => {
    const poor = new SlotEngine({ seed: 1, balance: 100 });
    expect(poor.canBuyBonus(0)).toBe(false);
    expect(() => poor.buyBonus(0)).toThrow();
    const e = new SlotEngine({ seed: 1, balance: 1_000_000 });
    e.buyBonus(1);
    expect(e.canBuyBonus(0)).toBe(false);
    expect(() => e.buyBonus(0)).toThrow();
  });
});

describe('vault deal', () => {
  it('offers deals when the vault opens and applies the chosen spins and multiplier', () => {
    const e = new SlotEngine({ seed: 77, balance: 1_000_000 });
    e.buyBonus(0);
    const deals = e.vaultDeals!;
    expect(deals.map((d) => d.spins)).toEqual(FEATURE_CONFIG.vaultDeals[9].map((d) => d.spins));
    const b = e.chooseDeal(2);
    expect(b.spinsRemaining).toBe(deals[2].spins);
    expect(b.dealMultiplier).toBe(deals[2].mult);
    expect(e.vaultDeals).toBeNull();
    const o = e.spin();
    expect(o.result.multiplier % deals[2].mult).toBe(0);
  });

  it('locks the deal once the first free spin starts', () => {
    const e = new SlotEngine({ seed: 78, balance: 1_000_000 });
    e.buyBonus(0);
    e.spin();
    expect(e.vaultDeals).toBeNull();
    expect(() => e.chooseDeal(1)).toThrow();
  });
});
