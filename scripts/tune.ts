/**
 * Reel-strip tuner. Searches strip space by simulated annealing against the
 * closed-form calculator until the model hits its return targets, then writes
 * the strips to src/engine/models/<id>.ts.
 *
 *   npm run math:tune -- --id bm2-96 --target 0.961 [--from bm2-96] [--iters 30000] [--seed 7]
 *
 * The committed model files are the product; this script documents how they
 * were derived and lets a mathematician re-derive or re-target them.
 */
import { writeFileSync } from 'node:fs';
import { analyze, baseHitFrequency, featureValue, modeTables, type ModeTables } from '../src/math/analytic';
import { arrangeBlocks, rulesFor, stripViolations, symbolCounts } from '../src/math/strips';
import { BET_COINS, validateModel, type MathModel } from '../src/engine/model';
import { SHARED_RULES } from '../src/engine/paytable';
import { SeededRng } from '../src/engine/rng';
import { CRATE, SCATTER, WILD, formatStrip } from '../src/engine/symbols';

const arg = (name: string, dflt?: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const id = arg('id', 'bm2-96')!;
const target = Number(arg('target', '0.961'));
const iters = Number(arg('iters', '30000'));
const seed = Number(arg('seed', '7'));
const from = arg('from');

// ── Starting point ────────────────────────────────────────────────────────
function initialModel(): MathModel {
  const runs = (sym: number, heights: number[]): Array<[number, number]> => heights.map((h) => [sym, h]);
  const baseReel = (r: number): Array<[number, number]> => [
    ...runs(0, [1, 1, 2, 2, 3, 3]),
    ...runs(1, [1, 1, 2, 2, 3, 3]),
    ...runs(2, [1, 1, 2, 2, 2, 3]),
    ...runs(3, [1, 1, 2, 2, 2, 3]),
    ...runs(4, [1, 1, 2, 3]),
    ...runs(5, [1, 1, 2, 3]),
    ...runs(6, [1, 1, 2, 2]),
    ...runs(7, [1, 1, 2, 2]),
    ...runs(8, [1, 2, 2]),
    ...runs(9, [1, 1, 2]),
    ...runs(10, [1, 2]),
    ...runs(11, [1, 2]),
    ...(r >= 1 && r <= 3 ? runs(WILD, [1, 1, 1]) : []),
    ...runs(SCATTER, [1, 1]),
    ...runs(CRATE, [3,4]),
  ];
  const freeReel = (r: number): Array<[number, number]> => [
    ...runs(0, [1, 2, 2, 3]),
    ...runs(1, [1, 2, 2, 3]),
    ...runs(2, [1, 2, 2, 3]),
    ...runs(3, [1, 2, 2, 3]),
    ...runs(4, [1, 1, 2, 3]),
    ...runs(5, [1, 1, 2, 3]),
    ...runs(6, [1, 1, 2, 2]),
    ...runs(7, [1, 1, 2, 2]),
    ...runs(8, [1, 2, 3]),
    ...runs(9, [1, 2, 3]),
    ...runs(10, [1, 2, 2]),
    ...runs(11, [1, 1, 2]),
    ...(r >= 1 && r <= 3 ? runs(WILD, [1,1,1,1]) : []),
    ...runs(SCATTER, [1]),
    ...runs(CRATE, [2, 3, 4]),
  ];
  return {
    id,
    rtpLabel: '',
    buyRtpLabel: '',
    ...SHARED_RULES,
    base: {
      strips: [0, 1, 2, 3, 4].map((r) => arrangeBlocks(baseReel(r), rulesFor('base', r), seed * 100 + r)),
      revealWeights: [140, 140, 130, 130, 90, 90, 80, 80, 50, 40, 20, 10],
    },
    free: {
      strips: [0, 1, 2, 3, 4].map((r) => arrangeBlocks(freeReel(r), rulesFor('free', r), seed * 100 + 50 + r)),
      revealWeights: [100, 100, 100, 100, 100, 100, 90, 90, 80, 60, 50, 30],
    },
  };
}

async function loadModel(modelId: string): Promise<MathModel> {
  const mod = (await import(`../src/engine/models/${modelId}.ts`)) as { default: MathModel };
  return structuredClone(mod.default);
}

// ── Objective ─────────────────────────────────────────────────────────────
interface Metrics {
  rtp: number;
  buyRtp: number;
  hit: number;
  trigger: number;
  waysShare: number;
  fsSpins: number;
  fsMult: number;
  fsWilds: number;
}

const TARGETS = {
  hit: 0.30,
  trigger: 1 / 215,
  waysShare: 0.615,
  fsSpins: 12.6,
  fsMult: 7.5,
};

function shapePenalty(model: MathModel): number {
  // Keep strips looking like a slot: rarer symbols pay more, sane lengths,
  // and a recognisable number of crates and wilds.
  let p = 0;
  for (const [kind, mode] of [
    ['base', model.base],
    ['free', model.free],
  ] as const) {
    mode.strips.forEach((strip, r) => {
      const n = strip.length;
      const c = symbolCounts(strip);
      const lo = kind === 'base' ? 88 : 80;
      const hi = kind === 'base' ? 112 : 104;
      if (n < lo) p += (lo - n) ** 2 * 0.02;
      if (n > hi) p += (n - hi) ** 2 * 0.02;
      // Non-increasing frequency from lows to highs (pairs share a rank).
      const rank = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7];
      for (let a = 0; a < 12; a++) {
        for (let b = 0; b < 12; b++) {
          if (rank[a] < rank[b] && c[a] < c[b] + (rank[b] - rank[a] >= 3 ? 1 : 0)) p += (c[b] - c[a] + 1) * 0.45;
        }
        if (c[a] < 2) p += (2 - c[a]) * 0.5;
      }
      const crate = c[CRATE];
      if (crate < 5) p += (5 - crate) * 0.2;
      if (crate > 10) p += (crate - 10) * 0.2;
      if (r >= 1 && r <= 3) {
        const w = c[WILD];
        const [wl, wh] = kind === 'base' ? [2, 4] : [3, 7];
        if (w < wl) p += (wl - w) * 0.4;
        if (w > wh) p += (w - wh) * 0.4;
      }
      const sc = c[SCATTER];
      const [sl, sh] = kind === 'base' ? [2, 3] : [1, 2];
      if (sc < sl) p += (sl - sc) * 2;
      if (sc > sh) p += (sc - sh) * 2;
    });
  }
  // Crates should reveal cheap symbols at least as often as dear ones.
  for (const mode of [model.base, model.free]) {
    const w = mode.revealWeights;
    for (let a = 0; a < 11; a++) if (w[a] < w[a + 1]) p += ((w[a + 1] - w[a]) / w[a + 1]) * 3;
  }
  return p;
}

class Evaluator {
  private baseTables!: ModeTables;
  private freeTables!: ModeTables;
  private hit = 0;
  private feature!: ReturnType<typeof featureValue>;

  constructor(readonly model: MathModel) {
    this.refresh('base');
    this.refresh('free');
  }

  refresh(kind: 'base' | 'free', hitAffected = true): void {
    if (kind === 'base') {
      this.baseTables = modeTables(this.model, this.model.base);
      if (hitAffected) this.hit = baseHitFrequency(this.model);
    } else {
      this.freeTables = modeTables(this.model, this.model.free);
      this.feature = featureValue(this.model, this.freeTables);
    }
  }

  metrics(): Metrics {
    const m = this.model;
    const b = this.baseTables;
    let trig = 0;
    let scat = 0;
    let feat = 0;
    let waysTrig = 0;
    for (let j = 3; j <= 5; j++) {
      trig += b.scatterDist[j];
      scat += b.scatterDist[j] * m.scatterPays[j - 3];
      feat += b.scatterDist[j] * this.feature.coins[j - 3];
      for (const row of b.win) waysTrig += row[j];
    }
    const ways = b.meanWaysCoins / BET_COINS;
    const rtp = ways + (scat + feat) / BET_COINS;
    return {
      rtp,
      buyRtp: (waysTrig + scat + feat) / trig / BET_COINS / m.buyPriceBets,
      hit: this.hit,
      trigger: trig,
      waysShare: ways / rtp,
      fsSpins: this.feature.spins[0],
      fsMult: this.feature.finalMultiplier[0],
      fsWilds: this.freeTables.meanWilds,
    };
  }

  cost(): number {
    const x = this.metrics();
    const rel = (v: number, t: number) => ((v - t) / t) ** 2;
    return (
      2e6 * rel(x.rtp, target) +
      6e5 * rel(x.buyRtp, target) +
      3000 * rel(x.hit, TARGETS.hit) +
      60 * rel(x.trigger, TARGETS.trigger) +
      80 * rel(x.waysShare, TARGETS.waysShare) +
      30 * rel(x.fsSpins, TARGETS.fsSpins) +
      30 * rel(x.fsMult, TARGETS.fsMult) +
      shapePenalty(this.model)
    );
  }
}

// ── Search ────────────────────────────────────────────────────────────────
function anneal(model: MathModel): MathModel {
  const rng = new SeededRng(seed);
  const ev = new Evaluator(model);
  let cost = ev.cost();
  let best = structuredClone(model);
  let bestCost = cost;
  const symbolsFor = (kind: 'base' | 'free', r: number) => {
    const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, CRATE, SCATTER];
    if (rulesFor(kind, r).allowWild) list.push(WILD);
    return list;
  };

  for (let it = 0; it < iters; it++) {
    const temp = 0.5 * (1 - it / iters) ** 2 + 1e-4;
    // Free-strip moves cost a feature DP, so try them less often.
    const kind: 'base' | 'free' = rng.nextInt(5) === 0 ? 'free' : 'base';
    const mode = kind === 'base' ? model.base : model.free;
    const r = rng.nextInt(5);
    const strip = mode.strips[r];
    const saved = strip.slice();
    const syms = symbolsFor(kind, r);
    const move = rng.nextInt(6);
    const i = rng.nextInt(strip.length);
    const savedWeights = mode.revealWeights.slice();
    if (move >= 4) {
      // Shift crate-reveal weight between two symbols (total stays constant).
      const a = rng.nextInt(12);
      const b = rng.nextInt(12);
      const k = 1 + rng.nextInt(6);
      if (a === b || mode.revealWeights[a] - k < 5) continue;
      mode.revealWeights[a] -= k;
      mode.revealWeights[b] += k;
    } else if (move === 0) {
      strip[i] = syms[rng.nextInt(syms.length)];
    } else if (move === 1) {
      strip.splice(i, 0, syms[rng.nextInt(syms.length)]);
    } else if (move === 2) {
      strip.splice(i, 1);
    } else {
      const j = rng.nextInt(strip.length);
      [strip[i], strip[j]] = [strip[j], strip[i]];
    }
    if (stripViolations(strip, rulesFor(kind, r)) > 0) {
      mode.strips[r] = saved;
      continue;
    }
    ev.refresh(kind, move >= 4 || r <= 2);
    const c2 = ev.cost();
    const accept = c2 <= cost || rng.nextInt(1_000_000) / 1_000_000 < Math.exp((cost - c2) / temp);
    if (accept) {
      cost = c2;
      if (cost < bestCost) {
        bestCost = cost;
        best = structuredClone(model);
      }
    } else {
      mode.strips[r] = saved;
      mode.revealWeights = savedWeights;
      ev.refresh(kind, move >= 4 || r <= 2);
    }
    if (it % 2000 === 0) {
      const x = ev.metrics();
      console.log(
        `it ${it} cost ${cost.toFixed(4)} best ${bestCost.toFixed(4)} rtp ${(x.rtp * 100).toFixed(3)} buy ${(x.buyRtp * 100).toFixed(3)} hit ${(x.hit * 100).toFixed(2)} trig 1/${(1 / x.trigger).toFixed(0)}`,
      );
    }
  }
  return best;
}

function report(model: MathModel): void {
  const a = analyze(model);
  const hit = baseHitFrequency(model);
  console.log(`\n== ${model.id} ==`);
  console.log(`RTP total ${(a.rtp.total * 100).toFixed(4)}%  ways ${(a.rtp.ways * 100).toFixed(3)}  scatter ${(a.rtp.scatter * 100).toFixed(3)}  feature ${(a.rtp.feature * 100).toFixed(3)}`);
  console.log(`Buy: mean ${a.buy.meanBets.toFixed(3)} bets, RTP ${(a.buy.rtp * 100).toFixed(4)}%`);
  console.log(`Hit ${(hit * 100).toFixed(3)}%  trigger 1 in ${(1 / a.triggerProb).toFixed(1)}  mean feature ${a.meanFeatureBets.toFixed(2)} bets`);
  console.log(`Feature (10/15/25): coins ${a.feature.coins.map((c) => (c / BET_COINS).toFixed(2))} spins ${a.feature.spins.map((s) => s.toFixed(2))} final× ${a.feature.finalMultiplier.map((s) => s.toFixed(2))}`);
  console.log(`Free: ways/spin ${(a.free.meanWaysCoins / BET_COINS).toFixed(4)} bets, wilds/spin ${a.free.meanWilds.toFixed(3)}`);
  for (const [k, mode] of [['base', model.base], ['free', model.free]] as const) {
    console.log(`${k} lengths ${mode.strips.map((s) => s.length).join(',')}`);
    mode.strips.forEach((s) => console.log('  ' + symbolCounts(s).join(' ')));
  }
}

function writeModel(model: MathModel): void {
  const a = analyze(model);
  model.rtpLabel = `${(a.rtp.total * 100).toFixed(2)}%`;
  model.buyRtpLabel = `${(a.buy.rtp * 100).toFixed(2)}%`;
  validateModel(model);
  const strips = (mode: MathModel['base']) =>
    mode.strips.map((s) => `      '${formatStrip(s)}',`).join('\n');
  const constName = model.id.replace(/[^a-z0-9]/gi, '_').toUpperCase();
  const src = `/**
 * GENERATED by scripts/tune.ts — do not edit by hand.
 * Math model ${model.id}: theoretical RTP ${model.rtpLabel}, feature buy ${model.buyRtpLabel}
 * (closed form, before the max-win cap; see docs/PAR_SHEET.md).
 * Strip listings use the one-letter codes from src/engine/symbols.ts.
 */
import type { MathModel } from '../model';
import { SHARED_RULES } from '../paytable';
import { parseStrip } from '../symbols';

const ${constName}: MathModel = {
  id: '${model.id}',
  rtpLabel: '${model.rtpLabel}',
  buyRtpLabel: '${model.buyRtpLabel}',
  ...SHARED_RULES,
  base: {
    strips: [
${strips(model.base)}
    ].map(parseStrip),
    revealWeights: [${model.base.revealWeights.join(', ')}],
  },
  free: {
    strips: [
${strips(model.free)}
    ].map(parseStrip),
    revealWeights: [${model.free.revealWeights.join(', ')}],
  },
};

export default ${constName};
`;
  writeFileSync(new URL(`../src/engine/models/${model.id}.ts`, import.meta.url), src);
}

const start = from ? await loadModel(from) : initialModel();
start.id = id;
report(start);
const tuned = iters > 0 ? anneal(start) : start;
if (iters > 0) report(tuned);
if (iters > 0 || process.argv.includes('--write')) {
  writeModel(tuned);
  console.log(`\nWrote src/engine/models/${id}.ts`);
}
