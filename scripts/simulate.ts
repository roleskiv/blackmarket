import { runSimulation } from '../src/engine/simulate';

const spins = Number(process.argv[2] ?? 1_000_000);
const seed = Number(process.argv[3] ?? 12345);
const t = Date.now();
const r = runSimulation(spins, seed);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
console.log(`BLACK MARKET — simulation estimate (UNCALIBRATED PROTOTYPE MATH)`);
console.log(`spins ${r.spins.toLocaleString()} · seed ${r.seed} · ${(Date.now() - t) / 1000}s`);
console.log(`RTP (observed)        ${pct(r.rtp)}  (base ${pct(r.baseRtp)} + bonus ${pct(r.bonusRtp)})`);
console.log(`hit frequency         ${pct(r.hitFrequency)}`);
console.log(`bonus frequency       1 in ${(1 / r.bonusFrequency).toFixed(0)} (${r.bonusesTriggered} bonuses)`);
console.log(`avg bonus win         ${r.avgBonusWin.toFixed(1)}× bet`);
console.log(`crate frequency       ${pct(r.crateFrequency)} of all spins`);
console.log(`dealer hand frequency ${pct(r.dealerHandFrequency)} of all spins`);
console.log(`largest round win     ${r.maxWinX.toFixed(1)}× bet (observed, not a max-win claim)`);
