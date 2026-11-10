/**
 * Monte-Carlo simulation of the real engine (resolveRound). Used to check
 * the closed-form calculation, to measure the things it does not cover
 * (volatility, win distribution, effect of the maximum-win cap) and as a
 * regression test.
 */
import { BET_COINS, type MathModel } from '../engine/model';
import { SeededRng } from '../engine/rng';
import { resolveRound, type RoundMode } from '../engine/round';

/** Upper edges (in bets, exclusive) of the win-distribution buckets. */
export const BUCKET_EDGES = [0, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export interface SimStats {
  model: string;
  mode: RoundMode;
  rounds: number;
  /** Sums in coins. */
  sum: number;
  sumSq: number;
  sumWays: number;
  sumScatter: number;
  sumFeature: number;
  hits: number;
  triggers: number;
  capped: number;
  maxCoins: number;
  freeSpins: number;
  finalMultiplierSum: number;
  /** buckets[i] counts wins w with EDGES[i-1] <= w < EDGES[i]; index 0 is "no win"; last is the cap. */
  buckets: number[];
  bucketCoins: number[];
  /** Feature wins only (rounds that triggered), same bucket edges. */
  featureBuckets: number[];
  sumFeatureSq: number;
}

export function emptyStats(model: string, mode: RoundMode): SimStats {
  const n = BUCKET_EDGES.length + 1;
  return {
    model,
    mode,
    rounds: 0,
    sum: 0,
    sumSq: 0,
    sumWays: 0,
    sumScatter: 0,
    sumFeature: 0,
    hits: 0,
    triggers: 0,
    capped: 0,
    maxCoins: 0,
    freeSpins: 0,
    finalMultiplierSum: 0,
    buckets: new Array<number>(n).fill(0),
    bucketCoins: new Array<number>(n).fill(0),
    featureBuckets: new Array<number>(n).fill(0),
    sumFeatureSq: 0,
  };
}

function bucketOf(coins: number): number {
  if (coins === 0) return 0;
  const bets = coins / BET_COINS;
  for (let i = 1; i < BUCKET_EDGES.length; i++) if (bets < BUCKET_EDGES[i]) return i;
  return BUCKET_EDGES.length;
}

export function simulate(model: MathModel, mode: RoundMode, rounds: number, seed: number): SimStats {
  const rng = new SeededRng(seed);
  const st = emptyStats(model.id, mode);
  st.rounds = rounds;
  for (let i = 0; i < rounds; i++) {
    const round = resolveRound(model, rng, mode);
    const total = round.totalCoins;
    const base = round.steps[0];
    let ways = 0;
    for (const w of base.wins) ways += w.coins;
    st.sum += total;
    st.sumSq += total * total;
    if (total > 0) st.hits++;
    if (round.capped) st.capped++;
    if (total > st.maxCoins) st.maxCoins = total;
    const b = bucketOf(total);
    st.buckets[b]++;
    st.bucketCoins[b] += total;
    if (round.steps.length > 1) {
      const feature = total - base.coins;
      st.triggers++;
      st.sumWays += Math.min(ways, base.coins);
      st.sumScatter += base.coins - Math.min(ways, base.coins);
      st.sumFeature += feature;
      st.sumFeatureSq += feature * feature;
      st.freeSpins += round.steps.length - 1;
      st.finalMultiplierSum += round.steps[round.steps.length - 1].multiplier;
      st.featureBuckets[bucketOf(feature)]++;
    } else {
      st.sumWays += base.coins;
    }
  }
  return st;
}

export function mergeStats(a: SimStats, b: SimStats): SimStats {
  const out = structuredClone(a);
  for (const key of Object.keys(out) as Array<keyof SimStats>) {
    const va = out[key];
    const vb = b[key];
    if (key === 'maxCoins') out.maxCoins = Math.max(a.maxCoins, b.maxCoins);
    else if (typeof va === 'number' && typeof vb === 'number') (out[key] as number) = va + vb;
    else if (Array.isArray(va) && Array.isArray(vb)) (out[key] as number[]) = va.map((v, i) => v + vb[i]);
  }
  return out;
}

export interface SimSummary {
  rounds: number;
  /** Return as a fraction of the amount staked (bet, or buy price). */
  rtp: number;
  /** Half-width of the 95% confidence interval of rtp. */
  rtpCi95: number;
  /** Standard deviation of the round win in units of the stake. */
  stdDev: number;
  hitFrequency: number;
  triggerFrequency: number;
  rtpWays: number;
  rtpScatter: number;
  rtpFeature: number;
  meanFeatureBets: number;
  meanFreeSpins: number;
  meanFinalMultiplier: number;
  maxWinBets: number;
  cappedRounds: number;
}

export function summarize(st: SimStats, model: MathModel): SimSummary {
  const stake = (st.mode === 'buy' ? model.buyPriceBets : 1) * BET_COINS;
  const n = st.rounds;
  const mean = st.sum / n;
  const variance = Math.max(0, st.sumSq / n - mean * mean);
  const sd = Math.sqrt(variance);
  return {
    rounds: n,
    rtp: mean / stake,
    rtpCi95: (1.96 * sd) / Math.sqrt(n) / stake,
    stdDev: sd / stake,
    hitFrequency: st.hits / n,
    triggerFrequency: st.triggers / n,
    rtpWays: st.sumWays / n / stake,
    rtpScatter: st.sumScatter / n / stake,
    rtpFeature: st.sumFeature / n / stake,
    meanFeatureBets: st.triggers ? st.sumFeature / st.triggers / BET_COINS : 0,
    meanFreeSpins: st.triggers ? st.freeSpins / st.triggers : 0,
    meanFinalMultiplier: st.triggers ? st.finalMultiplierSum / st.triggers : 0,
    maxWinBets: st.maxCoins / BET_COINS,
    cappedRounds: st.capped,
  };
}
