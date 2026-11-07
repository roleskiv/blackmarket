/**
 * Monte-Carlo simulation of the full game loop (base game + bonuses).
 * Results are SIMULATION ESTIMATES of uncalibrated prototype math only.
 */
import { SlotEngine } from './game';

export interface SimulationReport {
  spins: number;
  seed: number;
  totalWagered: number;
  totalWon: number;
  rtp: number;
  baseRtp: number;
  bonusRtp: number;
  hitFrequency: number;
  bonusFrequency: number;
  bonusesTriggered: number;
  avgBonusWin: number;
  crateFrequency: number;
  dealerHandFrequency: number;
  maxWinX: number;
}

/** Simulate `spins` paid base spins (free spins are played out but not counted as paid spins). */
export function runSimulation(spins: number, seed = 12345): SimulationReport {
  const bet = 100;
  const engine = new SlotEngine({ seed, balance: 2 ** 50 });
  engine.setBetIndex(2); // 100
  let baseWon = 0;
  let bonusWon = 0;
  let hits = 0;
  let bonuses = 0;
  let crates = 0;
  let hands = 0;
  let maxWin = 0;
  let featureSpins = 0;
  let currentBonus = 0;

  for (let i = 0; i < spins; i++) {
    const o = engine.spin();
    baseWon += o.result.totalWin;
    if (o.result.totalWin > 0) hits++;
    featureSpins++;
    for (const s of o.result.steps) {
      if (s.type === 'crate') crates++;
      if (s.type === 'dealer_hand') hands++;
    }
    let roundWin = o.result.totalWin;
    if (o.bonusTriggered) {
      bonuses++;
      currentBonus = 0;
      while (engine.bonus) {
        const f = engine.spin();
        featureSpins++;
        for (const s of f.result.steps) {
          if (s.type === 'crate') crates++;
          if (s.type === 'dealer_hand') hands++;
        }
        currentBonus += f.result.totalWin;
      }
      bonusWon += currentBonus;
      roundWin += currentBonus;
    }
    maxWin = Math.max(maxWin, roundWin);
  }

  const wagered = spins * bet;
  return {
    spins,
    seed,
    totalWagered: wagered,
    totalWon: baseWon + bonusWon,
    rtp: (baseWon + bonusWon) / wagered,
    baseRtp: baseWon / wagered,
    bonusRtp: bonusWon / wagered,
    hitFrequency: hits / spins,
    bonusFrequency: bonuses / spins,
    bonusesTriggered: bonuses,
    avgBonusWin: bonuses ? bonusWon / bonuses / bet : 0,
    crateFrequency: crates / featureSpins,
    dealerHandFrequency: hands / featureSpins,
    maxWinX: maxWin / bet,
  };
}
