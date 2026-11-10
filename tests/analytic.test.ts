import { describe, expect, it } from 'vitest';
import { BET_COINS } from '../src/engine/model';
import { MODELS } from '../src/engine/models';
import { evaluateSpin } from '../src/engine/round';
import { CRATE } from '../src/engine/symbols';
import { analyze, baseHitFrequency, modeTables } from '../src/math/analytic';
import { simulate, summarize } from '../src/math/simulate';
import { tinyModel } from './helpers';

/** Full-cycle brute force over every stop combination and every reveal. */
function bruteForce(kind: 'base' | 'free') {
  const model = tinyModel();
  const mode = kind === 'base' ? model.base : model.free;
  const L = mode.strips.map((s) => s.length);
  const totalW = mode.revealWeights.reduce((a, b) => a + b, 0);
  const cycle = L.reduce((a, b) => a * b, 1);
  const win: number[][] = Array.from({ length: 13 }, () => new Array<number>(6).fill(0));
  const prob: number[][] = Array.from({ length: 13 }, () => new Array<number>(6).fill(0));
  let hits = 0;
  const stops = [0, 0, 0, 0, 0];
  for (stops[0] = 0; stops[0] < L[0]; stops[0]++)
    for (stops[1] = 0; stops[1] < L[1]; stops[1]++)
      for (stops[2] = 0; stops[2] < L[2]; stops[2]++)
        for (stops[3] = 0; stops[3] < L[3]; stops[3]++)
          for (stops[4] = 0; stops[4] < L[4]; stops[4]++) {
            const plain = evaluateSpin(model, kind, stops, -1);
            const k = plain.wildsLanded;
            const j = plain.scatters;
            prob[k][j] += 1 / cycle;
            const crate = plain.grid.some((c) => c.includes(CRATE));
            if (!crate) {
              win[k][j] += plain.waysCoins / cycle;
              if (plain.waysCoins > 0 || j >= 3) hits += 1;
              continue;
            }
            for (let x = 0; x < 12; x++) {
              const w = mode.revealWeights[x] / totalW;
              if (w === 0) continue;
              const ev = evaluateSpin(model, kind, stops, x);
              win[k][j] += (ev.waysCoins * w) / cycle;
              if (ev.waysCoins > 0 || j >= 3) hits += w;
            }
          }
  return { win, prob, hit: hits / cycle };
}

describe('closed-form calculation vs brute-force enumeration (tiny model)', () => {
  for (const kind of ['base', 'free'] as const) {
    it(`${kind} strips: joint win/wild/scatter tables match the full cycle`, () => {
      const model = tinyModel();
      const tables = modeTables(model, kind === 'base' ? model.base : model.free);
      const bf = bruteForce(kind);
      for (let k = 0; k < 13; k++) {
        for (let j = 0; j < 6; j++) {
          expect(tables.prob[k][j]).toBeCloseTo(bf.prob[k][j], 12);
          expect(tables.win[k][j]).toBeCloseTo(bf.win[k][j], 9);
        }
      }
      if (kind === 'base') expect(baseHitFrequency(model)).toBeCloseTo(bf.hit, 9);
    });
  }
});

describe('closed-form calculation vs engine simulation (shipped models)', () => {
  for (const model of Object.values(MODELS)) {
    it(`${model.id}: base game components agree`, () => {
      const a = analyze(model);
      const st = simulate(model, 'spin', 1_500_000, 4242);
      const s = summarize(st, model);
      // Low-variance quantities are compared tightly.
      expect(s.hitFrequency).toBeCloseTo(baseHitFrequency(model), 2);
      expect(Math.abs(s.hitFrequency - baseHitFrequency(model))).toBeLessThan(0.002);
      expect(Math.abs(s.rtpWays - a.rtp.ways)).toBeLessThan(0.012);
      expect(Math.abs(s.triggerFrequency - a.triggerProb) / a.triggerProb).toBeLessThan(0.08);
      // Total return within its own confidence interval (4 standard errors).
      expect(Math.abs(s.rtp - a.rtp.total)).toBeLessThan((s.rtpCi95 / 1.96) * 4);
    });

    it(`${model.id}: feature value agrees with bought rounds`, () => {
      const a = analyze(model);
      const st = simulate(model, 'buy', 150_000, 777);
      const s = summarize(st, model);
      expect(Math.abs(s.rtp - a.buy.rtp)).toBeLessThan((s.rtpCi95 / 1.96) * 4);
      const expectSpins = a.buy.entryDist.reduce((acc, p, i) => acc + p * a.feature.spins[i], 0);
      const expectMult = a.buy.entryDist.reduce((acc, p, i) => acc + p * a.feature.finalMultiplier[i], 0);
      expect(Math.abs(s.meanFreeSpins - expectSpins)).toBeLessThan(0.08);
      expect(Math.abs(s.meanFinalMultiplier - expectMult)).toBeLessThan(0.08);
    });

    it(`${model.id}: published figures match the calculation`, () => {
      const a = analyze(model);
      expect(model.rtpLabel).toBe(`${(a.rtp.total * 100).toFixed(2)}%`);
      expect(model.buyRtpLabel).toBe(`${(a.buy.rtp * 100).toFixed(2)}%`);
      // Buying the feature must not return materially more or less than playing.
      expect(Math.abs(a.buy.rtp - a.rtp.total)).toBeLessThan(0.002);
      expect(a.rtp.total).toBeGreaterThan(0.9);
      expect(a.rtp.total).toBeLessThan(0.97);
      void BET_COINS;
    });
  }
});
