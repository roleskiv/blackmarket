import { runBonusBuySimulation, runSimulation, runVaultDealSimulation, WIN_CAP_X } from '../src/engine/simulate';

const spins = Number(process.argv[2] ?? 1_000_000);
const seed = Number(process.argv[3] ?? 12345);
const t = Date.now();
const r = runSimulation(spins, seed);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const vol = r.stdDev < 5 ? 'low' : r.stdDev < 10 ? 'medium' : r.stdDev < 20 ? 'high' : 'very high';
console.log(`BLACK MARKET — simulation estimate (UNCALIBRATED PROTOTYPE MATH), vault deals picked at random`);
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

const buys = Number(process.argv[4] ?? Math.max(10_000, Math.round(spins / 10)));
console.log(`\nBonus buys (${buys.toLocaleString()} each)`);
for (let i = 0; i < 2; i++) {
  const b = runBonusBuySimulation(i, buys, seed + i);
  console.log(
    `${b.name.padEnd(11)} price ${b.priceX}× · avg ${b.avgWinX.toFixed(1)}× · RTP ${pct(b.rtp)} (95% CI ${pct(b.rtpCi95[0])} – ${pct(b.rtpCi95[1])}) · sd ${b.stdDev.toFixed(0)}× · max ${b.maxWinX.toFixed(0)}× · capped ${pct(b.cappedShare)}`,
  );
}

const dealN = Number(process.argv[5] ?? Math.max(10_000, Math.round(buys / 2)));
console.log(`\nVault deals (${dealN.toLocaleString()} bonuses each, avg bonus win × bet)`);
const best = runSimulation(Math.round(spins / 2), seed + 7, 'default');
for (const d of runVaultDealSimulation(dealN, seed)) {
  console.log(`${String(d.awarded).padStart(2)} awarded → ${String(d.spins).padStart(2)} spins ×${d.mult}: ${d.avgWinX.toFixed(1)}× ±${d.ci95.toFixed(1)}`);
}
console.log(`RTP if the player always takes the full spins: ${pct(best.rtp)} (${Math.round(spins / 2).toLocaleString()} spins)`);
