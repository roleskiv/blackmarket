import { runSimulation, WIN_CAP_X } from '../src/engine/simulate';

const spins = Number(process.argv[2] ?? 1_000_000);
const seed = Number(process.argv[3] ?? 12345);
const t = Date.now();
const r = runSimulation(spins, seed);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const vol = r.stdDev < 5 ? 'low' : r.stdDev < 10 ? 'medium' : r.stdDev < 20 ? 'high' : 'very high';
console.log(`BLACK MARKET — simulation estimate (UNCALIBRATED PROTOTYPE MATH)`);
console.log(`spins ${r.spins.toLocaleString()} · seed ${r.seed} · ${(Date.now() - t) / 1000}s`);
console.log(`RTP (observed)        ${pct(r.rtp)}  95% CI ${pct(r.rtpCi95[0])} – ${pct(r.rtpCi95[1])}`);
console.log(`  base / bonus        ${pct(r.baseRtp)} / ${pct(r.bonusRtp)}`);
console.log(`std dev per round     ${r.stdDev.toFixed(1)}× bet  (volatility index, ~${vol} by common rule of thumb)`);
console.log(`hit frequency         ${pct(r.hitFrequency)}`);
console.log(`bonus frequency       1 in ${(1 / r.bonusFrequency).toFixed(0)} (${r.bonusesTriggered} bonuses)`);
console.log(`avg bonus win         ${r.avgBonusWin.toFixed(1)}× bet`);
console.log(`crate / hand / potion ${pct(r.crateFrequency)} / ${pct(r.dealerHandFrequency)} / ${pct(r.potionFrequency)} of all spins`);
console.log(`largest round win     ${r.maxWinX.toFixed(1)}× bet · rounds hitting the ${WIN_CAP_X.toLocaleString()}× cap: ${r.cappedRounds}`);
console.log(`win distribution      ${r.distribution.map((d) => `${d.label} ${pct(d.share)}`).join(' · ')}`);
