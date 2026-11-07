/**
 * Monte-Carlo simulation of the full game loop (base game + bonuses).
 * Results are SIMULATION ESTIMATES of uncalibrated prototype math only.
 *
 * Every paid spin is one "round" (the base spin plus any bonus it triggers).
 * RTP's 95% confidence interval uses the per-round standard deviation:
 *   CI = RTP ± 1.96 · σ / √N    (σ in units of the bet)
 */
import { FEATURE_CONFIG } from '../config/game';
import { SlotEngine } from './game';
import { createRng } from './rng';

export interface SimulationReport {
  spins: number;
  seed: number;
  totalWagered: number;
  totalWon: number;
  rtp: number;
  rtpCi95: [number, number];
  baseRtp: number;
  bonusRtp: number;
  /** Standard deviation of a round's return, in bets — a common volatility index. */
  stdDev: number;
  hitFrequency: number;
  bonusFrequency: number;
  bonusesTriggered: number;
  avgBonusWin: number;
  crateFrequency: number;
  dealerHandFrequency: number;
  potionFrequency: number;
  maxWinX: number;
  cappedRounds: number;
  /** Share of rounds by win size (× bet). */
  distribution: { label: string; share: number }[];
}

const BUCKETS: [string, number, number][] = [
  ['0×', 0, 0],
  ['< 1×', 1e-9, 1],
  ['1–5×', 1, 5],
  ['5–20×', 5, 20],
  ['20–100×', 20, 100],
  ['100–1,000×', 100, 1000],
  ['≥ 1,000×', 1000, Infinity],
];

/** Simulate `spins` paid base spins (free spins are played out inside each round). */
/**
 * `dealPick` decides the vault deal: 'default' always takes the full spins,
 * 'random' picks uniformly (the reported figure), or pass a fixed index.
 */
export function runSimulation(spins: number, seed = 12345, dealPick: 'default' | 'random' | number = 'random'): SimulationReport {
  const dealRng = createRng(seed ^ 0x5eed);
  const bet = 100;
  const engine = new SlotEngine({ seed, balance: 2 ** 50 });
  engine.setBetIndex(2); // 100
  let baseWon = 0;
  let bonusWon = 0;
  let hits = 0;
  let bonuses = 0;
  let crates = 0;
  let hands = 0;
  let potions = 0;
  let allSpins = 0;
  let maxWin = 0;
  let capped = 0;
  let sumX = 0;
  let sumX2 = 0;
  const counts = new Array(BUCKETS.length).fill(0);

  const tally = (o: ReturnType<SlotEngine['spin']>) => {
    allSpins++;
    for (const s of o.result.steps) {
      if (s.type === 'crate') crates++;
      if (s.type === 'dealer_hand') hands++;
      if (s.type === 'potion') potions++;
    }
  };

  for (let i = 0; i < spins; i++) {
    // Pick a random crate each time (offers are shuffled, so index 0 is a random pick).
    const o = engine.spin();
    tally(o);
    baseWon += o.result.totalWin;
    if (o.result.totalWin > 0) hits++;
    let round = o.result.totalWin;
    let wasCapped = o.result.capped;
    if (o.bonusTriggered) {
      bonuses++;
      const deals = engine.vaultDeals;
      if (deals && dealPick !== 'default') engine.chooseDeal(dealPick === 'random' ? dealRng.int(deals.length) : Math.min(dealPick, deals.length - 1));
      while (engine.bonus) {
        const f = engine.spin();
        tally(f);
        bonusWon += f.result.totalWin;
        round += f.result.totalWin;
        wasCapped ||= f.result.capped;
      }
    }
    if (wasCapped) capped++;
    const x = round / bet;
    sumX += x;
    sumX2 += x * x;
    maxWin = Math.max(maxWin, round);
    const b = x === 0 ? 0 : BUCKETS.findIndex(([, lo, hi], k) => k > 0 && x >= lo && x < hi);
    counts[b]++;
  }

  const wagered = spins * bet;
  const rtp = (baseWon + bonusWon) / wagered;
  const mean = sumX / spins;
  const sd = Math.sqrt(Math.max(0, sumX2 / spins - mean * mean));
  const half = (1.96 * sd) / Math.sqrt(spins);
  return {
    spins,
    seed,
    totalWagered: wagered,
    totalWon: baseWon + bonusWon,
    rtp,
    rtpCi95: [rtp - half, rtp + half],
    baseRtp: baseWon / wagered,
    bonusRtp: bonusWon / wagered,
    stdDev: sd,
    hitFrequency: hits / spins,
    bonusFrequency: bonuses / spins,
    bonusesTriggered: bonuses,
    avgBonusWin: bonuses ? bonusWon / bonuses / bet : 0,
    crateFrequency: crates / allSpins,
    dealerHandFrequency: hands / allSpins,
    potionFrequency: potions / allSpins,
    maxWinX: maxWin / bet,
    cappedRounds: capped,
    distribution: BUCKETS.map(([label], k) => ({ label, share: counts[k] / spins })),
  };
}

export const WIN_CAP_X = FEATURE_CONFIG.maxWinX;

export interface BonusBuyReport {
  tier: number;
  name: string;
  buys: number;
  priceX: number;
  avgWinX: number;
  rtp: number;
  rtpCi95: [number, number];
  stdDev: number;
  maxWinX: number;
  cappedShare: number;
}

/** Simulate `buys` bonus buys of one tier (estimates only, like runSimulation). */
export function runBonusBuySimulation(tier: number, buys: number, seed = 12345): BonusBuyReport {
  const engine = new SlotEngine({ seed, balance: 2 ** 50 });
  engine.setBetIndex(2);
  const bet = engine.bet;
  const { name, priceX } = FEATURE_CONFIG.bonusBuys[tier];
  let sumX = 0;
  let sumX2 = 0;
  let maxX = 0;
  let capped = 0;
  for (let i = 0; i < buys; i++) {
    engine.buyBonus(tier);
    let win = 0;
    let wasCapped = false;
    while (engine.bonus) {
      const o = engine.spin();
      win += o.result.totalWin;
      wasCapped ||= o.result.capped;
    }
    if (wasCapped) capped++;
    const x = win / bet;
    sumX += x;
    sumX2 += x * x;
    maxX = Math.max(maxX, x);
  }
  const mean = sumX / buys;
  const sd = Math.sqrt(Math.max(0, sumX2 / buys - mean * mean));
  const half = (1.96 * sd) / Math.sqrt(buys) / priceX;
  const rtp = mean / priceX;
  return { tier, name, buys, priceX, avgWinX: mean, rtp, rtpCi95: [rtp - half, rtp + half], stdDev: sd, maxWinX: maxX, cappedShare: capped / buys };
}

/** Average bonus win (× bet) for every vault deal at each awarded-spins level. */
export function runVaultDealSimulation(bonuses: number, seed = 12345) {
  const out: { awarded: number; deal: number; spins: number; mult: number; avgWinX: number; ci95: number }[] = [];
  for (const [awardedKey, deals] of Object.entries(FEATURE_CONFIG.vaultDeals)) {
    const awarded = Number(awardedKey);
    deals.forEach((d, i) => {
      const engine = new SlotEngine({ seed: seed + awarded * 10 + i, balance: 2 ** 50 });
      engine.setBetIndex(2);
      const bet = engine.bet;
      const tier = FEATURE_CONFIG.bonusBuys.findIndex((b) => b.spins === awarded);
      let sum = 0;
      let sum2 = 0;
      for (let n = 0; n < bonuses; n++) {
        if (tier >= 0) engine.buyBonus(tier);
        else engine.forceBonus(awarded);
        engine.chooseDeal(i);
        let w = 0;
        while (engine.bonus) w += engine.spin().result.totalWin;
        sum += w / bet;
        sum2 += (w / bet) ** 2;
      }
      const m = sum / bonuses;
      out.push({ awarded, deal: i, spins: d.spins, mult: d.mult, avgWinX: m, ci95: (1.96 * Math.sqrt(Math.max(0, sum2 / bonuses - m * m))) / Math.sqrt(bonuses) });
    });
  }
  return out;
}
