/**
 * Generates docs/PAR_SHEET.md from the shipped math models: closed-form
 * figures computed on the spot, plus the simulation results stored in
 * docs/par/<model>-<mode>.json (written by `npm run math:sim -- --out ...`).
 *
 *   npm run math:par
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { analyze, baseHitFrequency } from '../src/math/analytic';
import { BUCKET_EDGES, type SimStats, type SimSummary } from '../src/math/simulate';
import { symbolCounts } from '../src/math/strips';
import { BET_COINS, type MathModel } from '../src/engine/model';
import { MODELS } from '../src/engine/models';
import { SYMBOLS, formatStrip } from '../src/engine/symbols';

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
const num = (x: number, d = 2) => x.toFixed(d);
const root = new URL('..', import.meta.url);

interface SimFile {
  seed: number;
  stats: SimStats;
  summary: SimSummary;
}

function loadSim(model: string, mode: string): SimFile | null {
  const p = new URL(`docs/par/${model}-${mode}.json`, root);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as SimFile) : null;
}

function table(head: string[], rows: Array<Array<string | number>>): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function bucketLabel(i: number): string {
  if (i === 0) return 'No win';
  if (i === BUCKET_EDGES.length) return `${BUCKET_EDGES[i - 1].toLocaleString('en')}× (maximum win)`;
  const lo = BUCKET_EDGES[i - 1];
  const hi = BUCKET_EDGES[i];
  return lo === 0 ? `Up to ${hi}×` : `${lo}× to under ${hi.toLocaleString('en')}×`;
}

function distribution(sim: SimFile, model: MathModel, stakeBets: number): string {
  const st = sim.stats;
  const rows: Array<Array<string | number>> = [];
  st.buckets.forEach((count, i) => {
    if (count === 0 && i > 0) {
      rows.push([bucketLabel(i), '0', 'not observed', '0.00%']);
      return;
    }
    rows.push([
      bucketLabel(i),
      pct(count / st.rounds, 4),
      count ? `1 in ${(st.rounds / count).toLocaleString('en', { maximumFractionDigits: count * 10 > st.rounds ? 2 : 0 })}` : '',
      pct(st.bucketCoins[i] / st.rounds / (stakeBets * BET_COINS), 2),
    ]);
  });
  void model;
  return table(['Round win (× bet)', 'Probability', 'Frequency', 'Share of return'], rows);
}

function modelSection(model: MathModel): string {
  const a = analyze(model);
  const hit = baseHitFrequency(model);
  const spin = loadSim(model.id, 'spin');
  const buy = loadSim(model.id, 'buy');
  const out: string[] = [];
  out.push(`## Model \`${model.id}\`\n`);

  const summary: Array<Array<string | number>> = [
    ['Theoretical RTP (closed form, before max-win cap)', pct(a.rtp.total, 4)],
    ['— way wins in the base game', pct(a.rtp.ways, 4)],
    ['— scatter pays', pct(a.rtp.scatter, 4)],
    ['— the Vault feature', pct(a.rtp.feature, 4)],
    ['Feature-buy RTP (closed form)', pct(a.buy.rtp, 4)],
    ['Base-game hit frequency (exact)', `${pct(hit, 3)} (1 in ${num(1 / hit)})`],
    ['Feature frequency (exact)', `1 in ${num(1 / a.triggerProb, 1)} spins`],
    ['Mean feature win, natural triggers', `${num(a.meanFeatureBets)}× bet`],
    ['Mean bought round', `${num(a.buy.meanBets)}× bet for ${model.buyPriceBets}×`],
    ['Maximum win', `${model.maxWinBets.toLocaleString('en')}× bet per round`],
  ];
  if (spin) {
    summary.push(
      ['Simulated RTP, with cap', `${pct(spin.summary.rtp, 4)} ± ${pct(spin.summary.rtpCi95, 4)} (95% CI, ${spin.summary.rounds.toLocaleString('en')} rounds)`],
      ['Volatility: standard deviation of a round', `${num(spin.summary.stdDev)}× bet`],
    );
  }
  out.push(table(['Figure', 'Value'], summary), '');

  out.push('### Reel strips\n');
  for (const [name, mode] of [
    ['Base game', model.base],
    ['Vault free spins', model.free],
  ] as const) {
    out.push(`**${name}** (top to bottom, circular; codes below)\n`);
    out.push('```');
    mode.strips.forEach((s, r) => out.push(`Reel ${r + 1} (${String(s.length).padStart(3)}): ${formatStrip(s)}`));
    out.push('```', '');
    const counts = mode.strips.map(symbolCounts);
    out.push(
      table(
        ['Symbol', 'Code', 'R1', 'R2', 'R3', 'R4', 'R5'],
        SYMBOLS.map((s) => [s.name, `\`${s.code}\``, ...counts.map((c) => c[s.id])]).concat([
          ['**Strip length**', '', ...mode.strips.map((s) => `**${s.length}**`)],
        ]),
      ),
      '',
    );
    const totalW = mode.revealWeights.reduce((x, y) => x + y, 0);
    out.push(
      `Crate reveal weights (sum ${totalW}): ` +
        mode.revealWeights.map((w, i) => `${SYMBOLS[i].name} ${w}`).join(', ') +
        '.\n',
    );
  }
  out.push(
    `Full cycle: base ${model.base.strips.map((s) => s.length).join(' × ')} = ${model.base.strips
      .reduce((x, s) => x * s.length, 1)
      .toLocaleString('en')} stop combinations; free ${model.free.strips
      .reduce((x, s) => x * s.length, 1)
      .toLocaleString('en')}.\n`,
  );

  out.push('### Base game return by symbol\n');
  out.push(
    table(
      ['Symbol', '3 reels', '4 reels', '5 reels', 'Total'],
      a.base.bySymbol
        .map((p, s) => [SYMBOLS[s].name, ...p.map((x) => pct(x / BET_COINS, 3)), pct(p.reduce((x, y) => x + y, 0) / BET_COINS, 3)])
        .concat([['**All way wins**', '', '', '', `**${pct(a.rtp.ways, 3)}**`]]),
    ),
    '',
  );

  out.push('### Scatters and the Vault\n');
  out.push(
    table(
      ['Scatters in view', 'Probability', 'Frequency', 'Pays', 'Free spins', 'Feature value', 'Mean spins played', 'Mean final multiplier'],
      [0, 1, 2, 3, 4, 5].map((j) => {
        const p = a.base.scatterDist[j];
        const row: Array<string | number> = [j, pct(p, 5), p > 0 ? `1 in ${num(1 / p, 1)}` : ''];
        if (j >= 3) {
          row.push(
            `${model.scatterPays[j - 3] / BET_COINS}×`,
            model.freeSpinsAward[j - 3],
            `${num(a.feature.coins[j - 3] / BET_COINS)}×`,
            num(a.feature.spins[j - 3]),
            `×${num(a.feature.finalMultiplier[j - 3])}`,
          );
        } else row.push('', '', '', '', '');
        return row;
      }),
    ),
    '',
  );
  out.push(
    `Per free spin: mean way win before the multiplier ${num(a.free.meanWaysCoins / BET_COINS, 4)}× bet, ` +
      `${num(a.free.meanWilds, 4)} Wilds landing (each adds +1 to the multiplier), ` +
      `${num(a.free.scatterDist.reduce((x, p, j) => x + p * j, 0), 4)} Scatters landing (each adds +1 free spin).\n`,
  );

  for (const [label, sim, theory, stake] of [
    ['Paid spins', spin, a.rtp.total, 1],
    [`Feature buy (${model.buyPriceBets}× bet)`, buy, a.buy.rtp, model.buyPriceBets],
  ] as const) {
    if (!sim) continue;
    const s = sim.summary;
    out.push(`### Simulation check: ${label}\n`);
    out.push(
      `${s.rounds.toLocaleString('en')} rounds of the production engine, seed ${sim.seed}. ` +
        `Return ${pct(s.rtp, 4)} ± ${pct(s.rtpCi95, 4)} (95% confidence) against ${pct(theory, 4)} in closed form ` +
        `(difference ${(100 * (s.rtp - theory)).toFixed(4)} points, ${
          Math.abs(s.rtp - theory) <= s.rtpCi95 ? 'inside' : 'outside'
        } the interval). ` +
        `Standard deviation ${num(s.stdDev)}× stake. Largest round ${s.maxWinBets.toLocaleString('en')}× bet; ` +
        `${s.cappedRounds.toLocaleString('en')} rounds ended at the maximum win` +
        (s.cappedRounds ? ` (1 in ${Math.round(s.rounds / s.cappedRounds).toLocaleString('en')}).` : '.') +
        '\n',
    );
    if (stake === 1) {
      out.push(
        table(
          ['Component', 'Closed form', 'Simulated'],
          [
            ['Way wins', pct(a.rtp.ways, 3), pct(s.rtpWays, 3)],
            ['Scatter pays', pct(a.rtp.scatter, 3), pct(s.rtpScatter, 3)],
            ['Vault feature', pct(a.rtp.feature, 3), pct(s.rtpFeature, 3)],
            ['Hit frequency', pct(hit, 3), pct(s.hitFrequency, 3)],
            ['Feature frequency', `1 in ${num(1 / a.triggerProb, 1)}`, `1 in ${num(1 / s.triggerFrequency, 1)}`],
          ],
        ),
        '',
      );
    }
    out.push(distribution(sim, model, stake), '');
  }
  return out.join('\n');
}

const models = Object.values(MODELS);
const doc = `# BLACK MARKET: par sheet

Generated by \`npm run math:par\` from the math models in \`src/engine/models\`. Do not edit by hand.

**Status.** These are the designer's figures: a closed-form calculation, cross-checked by brute-force
enumeration on reduced strips (\`tests/analytic.test.ts\`) and by Monte-Carlo simulation of the production
engine. They have **not** been reviewed by an accredited test laboratory. Certification is a required step
before real-money use; see \`docs/CERTIFICATION.md\`.

## Game summary

5 reels × 4 rows, 1024 ways, pays left to right on 3 or more adjacent reels. Total bet is ${BET_COINS} coins.
Wild on reels 2 to 4. Contraband Crates (mystery symbols) on all reels reveal one common paying symbol.
3, 4 or 5 Scatters pay ${models[0].scatterPays.map((c) => `${c / BET_COINS}×`).join(' / ')} the bet and award
${models[0].freeSpinsAward.join(' / ')} Vault free spins. In the Vault a multiplier starts at ×1, rises by 1 for
every Wild that lands (before the spin is paid), never resets, and is capped at ×${models[0].maxMultiplier};
each Scatter adds one free spin up to ${models[0].maxFreeSpins} per feature. A round pays at most
${models[0].maxWinBets.toLocaleString('en')}× the bet. The feature can be bought for ${models[0].buyPriceBets}× the bet:
the bought spin is an ordinary base spin conditioned on landing 3 or more Scatters.

### Paytable (coins per way; total bet = ${BET_COINS} coins)

${table(
  ['Symbol', '3 reels', '4 reels', '5 reels'],
  models[0].pays.map((p, s) => [SYMBOLS[s].name, ...p]).reverse(),
)}

### RTP variants

${table(
  ['Model', 'RTP', 'Feature-buy RTP', 'Hit frequency', 'Feature frequency'],
  models.map((m) => {
    const a = analyze(m);
    return [`\`${m.id}\``, pct(a.rtp.total), pct(a.buy.rtp), pct(baseHitFrequency(m)), `1 in ${num(1 / a.triggerProb, 0)}`];
  }),
)}

All variants share the paytable and rules above; only the reel strips differ.

## Method

1. **Closed form** (\`src/math/analytic.ts\`). Reels are independent, so the expected all-ways win for a symbol
   factorises into per-reel terms. Each term is kept as a polynomial in the number of Wilds and Scatters in
   view, which yields the joint law of (way win, Wilds, Scatters) for one spin. The Vault is then solved exactly
   by dynamic programming over (free spins granted, free spins remaining, multiplier). Hit frequency is exact,
   by enumerating all stops of reels 1 to 3.
2. **Independent check by enumeration.** The same calculator is compared, to 9 or more significant digits, with a
   brute-force full cycle of a reduced model that has every feature of the real one.
3. **Independent check by simulation** (\`src/math/simulate.ts\`). The production engine, exactly as the server
   runs it, is played for the number of rounds shown and compared with the closed form. Simulation also
   provides what the closed form does not: volatility, the win distribution and the effect of the maximum-win
   cap (the closed-form RTP is stated before the cap; the simulated RTP includes it).

${models.map(modelSection).join('\n')}
`;

writeFileSync(new URL('docs/PAR_SHEET.md', root), doc);
console.log(`Wrote docs/PAR_SHEET.md (${models.length} model${models.length > 1 ? 's' : ''})`);
