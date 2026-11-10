import { describe, expect, it } from 'vitest';
import { BET_COINS, validateModel } from '../src/engine/model';
import { MODELS } from '../src/engine/models';
import { CryptoRng, ScriptedRng, SeededRng } from '../src/engine/rng';
import { evaluateWays, resolveRound, verifyRound } from '../src/engine/round';
import { CLUB, CRATE, HEART, HORNED_SKULL, SCATTER, SPADE, WILD, formatStrip, parseStrip } from '../src/engine/symbols';
import { tinyModel } from './helpers';

const model = MODELS['bm2-96'];
const col = (...s: number[]) => s;

describe('math models', () => {
  it('every shipped model passes structural validation', () => {
    for (const m of Object.values(MODELS)) expect(() => validateModel(m)).not.toThrow();
  });

  it('rejects scatters that could both be visible on one reel', () => {
    const bad = tinyModel();
    bad.base.strips[0] = parseStrip('cSsShdPKcc');
    expect(() => validateModel(bad)).toThrow(/scatters too close/);
  });

  it('rejects wilds on the outer reels', () => {
    const bad = tinyModel();
    bad.base.strips[4] = parseStrip('cWshdSPHcs');
    expect(() => validateModel(bad)).toThrow(/wild on reel 5/);
  });

  it('strip listings round-trip', () => {
    for (const strip of model.base.strips) expect(parseStrip(formatStrip(strip))).toEqual(strip);
  });
});

describe('all-ways evaluation', () => {
  it('pays pay × ways for the longest run from reel 1', () => {
    const grid = [
      col(CLUB, CLUB, HEART, SPADE),
      col(CLUB, HEART, HEART, SPADE),
      col(CLUB, CLUB, CLUB, HEART),
      col(SPADE, SPADE, SPADE, SPADE),
      col(CLUB, CLUB, CLUB, CLUB),
    ];
    const wins = evaluateWays(model, grid, -1);
    const club = wins.find((w) => w.symbol === CLUB)!;
    expect(club).toMatchObject({ reels: 3, ways: 2 * 1 * 3 });
    expect(club.coins).toBe(model.pays[CLUB][0] * 6);
    const heart = wins.find((w) => w.symbol === HEART)!;
    expect(heart).toMatchObject({ reels: 3, ways: 1 * 2 * 1 });
    // Spade: 1 × 1 × 0 on reel 3, so no win even though reel 4 is full of spades.
    expect(wins.find((w) => w.symbol === SPADE)).toBeUndefined();
  });

  it('wilds substitute and add ways', () => {
    const grid = [
      col(CLUB, HEART, SPADE, SPADE),
      col(WILD, CLUB, HEART, HEART),
      col(WILD, WILD, CLUB, HEART),
      col(HEART, HEART, HEART, HEART),
      col(SPADE, SPADE, SPADE, SPADE),
    ];
    const wins = evaluateWays(model, grid, -1);
    expect(wins.find((w) => w.symbol === CLUB)).toMatchObject({ reels: 3, ways: 1 * 2 * 3 });
    expect(wins.find((w) => w.symbol === HEART)).toMatchObject({ reels: 4, ways: 1 * 3 * 3 * 4 });
    // Spades: reel 1 ×2, reel 2 wild ×1, reel 3 wilds ×2, none on reel 4.
    expect(wins.find((w) => w.symbol === SPADE)).toMatchObject({ reels: 3, ways: 2 * 1 * 2 });
  });

  it('crates count only as the revealed symbol', () => {
    const grid = [
      col(CRATE, CRATE, CLUB, HEART),
      col(CRATE, SPADE, SPADE, SPADE),
      col(CRATE, CRATE, CRATE, CRATE),
      col(SPADE, SPADE, SPADE, SPADE),
      col(SPADE, SPADE, SPADE, SPADE),
    ];
    const skull = evaluateWays(model, grid, HORNED_SKULL);
    expect(skull).toEqual([{ symbol: HORNED_SKULL, reels: 3, ways: 2 * 1 * 4, coins: model.pays[HORNED_SKULL][0] * 8 }]);
    const club = evaluateWays(model, grid, CLUB);
    expect(club).toEqual([{ symbol: CLUB, reels: 3, ways: 3 * 1 * 4, coins: model.pays[CLUB][0] * 12 }]);
    // Unrevealed crates match nothing.
    expect(evaluateWays(model, grid, -1)).toEqual([]);
  });

  it('a way cannot start with a wild (reel 1 has none) and scatters never join ways', () => {
    const grid = [
      col(SCATTER, CLUB, HEART, SPADE),
      col(SCATTER, WILD, WILD, WILD),
      col(SCATTER, WILD, WILD, WILD),
      col(SCATTER, SCATTER, SCATTER, SCATTER),
      col(SCATTER, SCATTER, SCATTER, SCATTER),
    ];
    const wins = evaluateWays(model, grid, -1);
    expect(wins.map((w) => w.symbol).sort()).toEqual([CLUB, SPADE, HEART].sort());
    for (const w of wins) expect(w).toMatchObject({ reels: 3, ways: 9 });
  });
});

describe('round resolution', () => {
  it('is deterministic for a given seed and verifies on replay', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const a = resolveRound(model, new SeededRng(seed), seed % 7 === 0 ? 'buy' : 'spin');
      const b = resolveRound(model, new SeededRng(seed), seed % 7 === 0 ? 'buy' : 'spin');
      expect(a).toEqual(b);
      expect(verifyRound(model, JSON.parse(JSON.stringify(a)))).toEqual({ ok: true });
    }
  });

  it('detects a tampered record', () => {
    const rng = new SeededRng(99);
    let round = resolveRound(model, rng);
    while (round.totalCoins === 0) round = resolveRound(model, rng);
    const forged = JSON.parse(JSON.stringify(round));
    forged.totalCoins += 20;
    expect(verifyRound(model, forged).ok).toBe(false);
    const moved = JSON.parse(JSON.stringify(round));
    moved.steps[0].stops[0] = (moved.steps[0].stops[0] + 1) % model.base.strips[0].length;
    expect(verifyRound(model, moved).ok).toBe(false);
    expect(verifyRound(MODELS['bm2-96'], { ...round, model: 'other' }).ok).toBe(false);
  });

  it('a bought round always opens the Vault', () => {
    const rng = new SeededRng(5);
    for (let i = 0; i < 300; i++) {
      const r = resolveRound(model, rng, 'buy');
      expect(r.steps[0].scatters).toBeGreaterThanOrEqual(3);
      expect(r.steps.length).toBeGreaterThan(1);
    }
  });

  it('keeps the feature bookkeeping consistent', () => {
    const rng = new SeededRng(2024);
    let features = 0;
    for (let i = 0; i < 4000; i++) {
      const r = resolveRound(model, rng, i % 4 === 0 ? 'buy' : 'spin');
      const [base, ...free] = r.steps;
      expect(r.steps.reduce((a, s) => a + s.coins, 0)).toBe(r.totalCoins);
      expect(r.totalCoins).toBeLessThanOrEqual(model.maxWinBets * BET_COINS);
      expect(base.multiplier).toBe(1);
      if (base.scatters < 3) {
        expect(free.length).toBe(0);
        continue;
      }
      features++;
      const award = model.freeSpinsAward[Math.min(base.scatters, 5) - 3];
      expect(base.spinsAwarded).toBe(award);
      let mult = 1;
      let left = award;
      let granted = award;
      free.forEach((s, i2) => {
        expect(s.index).toBe(i2 + 1);
        mult = Math.min(mult + s.wildsLanded, model.maxMultiplier);
        expect(s.multiplier).toBe(mult);
        left = left - 1 + s.spinsAwarded;
        granted += s.spinsAwarded;
        if (!r.capped) expect(s.spinsRemaining).toBe(left);
        const ways = s.wins.reduce((a, w) => a + w.coins, 0);
        if (!r.capped) expect(s.coins).toBe(ways * mult);
        expect(s.scatterCoins).toBe(0);
      });
      expect(granted).toBeLessThanOrEqual(model.maxFreeSpins);
      if (!r.capped) expect(free[free.length - 1].spinsRemaining).toBe(0);
    }
    expect(features).toBeGreaterThan(900);
  });

  it('stops at the maximum win and pays exactly the cap', () => {
    const capped = { ...model, id: 'cap-test', maxWinBets: 5 };
    const rng = new SeededRng(7);
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 20; i++) {
      const r = resolveRound(capped, rng, 'buy');
      expect(r.totalCoins).toBeLessThanOrEqual(5 * BET_COINS);
      if (r.capped) {
        seen++;
        expect(r.totalCoins).toBe(5 * BET_COINS);
        expect(r.steps[r.steps.length - 1].spinsRemaining).toBe(0);
        expect(verifyRound(capped, r).ok).toBe(true);
      }
    }
    expect(seen).toBe(20);
  });

  it('draws the crate reveal only when a crate is in view', () => {
    // Stops chosen from the strips: find one window with a crate and one without.
    const strips = model.base.strips;
    const stopWith = (r: number, want: boolean) =>
      strips[r].findIndex((_, p) => [0, 1, 2, 3].some((i) => strips[r][(p + i) % strips[r].length] === CRATE) === want &&
        ![0, 1, 2, 3].some((i) => strips[r][(p + i) % strips[r].length] === SCATTER));
    const none = [0, 1, 2, 3, 4].map((r) => stopWith(r, false));
    // Exactly five draws are consumed when there is no crate.
    expect(resolveRound(model, new ScriptedRng(none)).steps[0].reveal).toBe(-1);
    const some = [stopWith(0, true), ...none.slice(1)];
    expect(() => resolveRound(model, new ScriptedRng(some))).toThrow(/exhausted/);
    expect(resolveRound(model, new ScriptedRng([...some, 0])).steps[0].reveal).toBe(0);
  });
});

describe('random number sources', () => {
  it('SeededRng.nextInt is uniform (chi-square) and in range', () => {
    const rng = new SeededRng(123);
    for (const n of [2, 3, 7, 97, 100]) {
      const counts = new Array<number>(n).fill(0);
      const N = 200_000;
      for (let i = 0; i < N; i++) counts[rng.nextInt(n)]++;
      const e = N / n;
      const chi = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
      // Mean n−1, sd √(2(n−1)); allow five standard deviations.
      expect(chi).toBeLessThan(n - 1 + 5 * Math.sqrt(2 * (n - 1)) + 5);
    }
  });

  it('CryptoRng stays in range and covers it', () => {
    const rng = new CryptoRng();
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.nextInt(13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(13);
      seen.add(v);
    }
    expect(seen.size).toBe(13);
    expect(() => rng.nextInt(0)).toThrow();
  });
});
