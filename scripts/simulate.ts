/**
 * Parallel Monte-Carlo run of the real engine.
 *
 *   npm run math:sim -- --model bm2-96 --mode spin --rounds 1e9 [--seed 2026] [--out file.json]
 *
 * Prints a summary next to the closed-form figures and optionally writes the
 * raw statistics as JSON (docs/par/*.json are produced this way).
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/math/analytic';
import { mergeStats, simulate, summarize, type SimStats } from '../src/math/simulate';
import { MODELS } from '../src/engine/models';
import type { RoundMode } from '../src/engine/round';

const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const modelId = arg('model', 'bm2-96');
const mode = arg('mode', 'spin') as RoundMode;
const rounds = Number(arg('rounds', '1e7'));
const seed = Number(arg('seed', '2026'));
const out = arg('out', '');
const model = MODELS[modelId];
if (!model) throw new Error(`Unknown model ${modelId}`);

if (process.send) {
  // Worker: run chunks so the parent can show progress.
  process.on('message', (msg: { rounds: number; seed: number }) => {
    process.send!(simulate(model, mode, msg.rounds, msg.seed));
  });
} else {
  const workers = Math.max(1, Math.min(availableParallelism(), Number(arg('workers', '64'))));
  const chunk = 250_000;
  const chunks = Math.ceil(rounds / chunk);
  let next = 0;
  let done = 0;
  let total: SimStats | null = null;
  const started = Date.now();

  await new Promise<void>((resolve) => {
    for (let w = 0; w < workers; w++) {
      const child = fork(fileURLToPath(import.meta.url), process.argv.slice(2), { execArgv: process.execArgv });
      const give = () => {
        if (next >= chunks) {
          child.kill();
          return;
        }
        // Each chunk gets its own seed, so results do not depend on the worker count.
        child.send({ rounds: chunk, seed: (seed * 1_000_003 + next) >>> 0 });
        next++;
      };
      child.on('message', (st: SimStats) => {
        total = total ? mergeStats(total, st) : st;
        done++;
        if (done % 400 === 0) {
          const s = summarize(total, model);
          process.stderr.write(
            `\r${((done / chunks) * 100).toFixed(1)}%  rtp ${(s.rtp * 100).toFixed(4)} ±${(s.rtpCi95 * 100).toFixed(4)}   `,
          );
        }
        if (done === chunks) resolve();
        else give();
      });
      give();
    }
  });

  const st = total!;
  const s = summarize(st, model);
  const a = analyze(model);
  const theory = mode === 'buy' ? a.buy.rtp : a.rtp.total;
  const pct = (x: number, d = 4) => `${(x * 100).toFixed(d)}%`;
  console.log(`\n${modelId} / ${mode}: ${s.rounds.toLocaleString()} rounds in ${((Date.now() - started) / 1000).toFixed(0)}s (seed ${seed})`);
  console.log(`  RTP simulated   ${pct(s.rtp)} ± ${pct(s.rtpCi95)} (95% CI)`);
  console.log(`  RTP closed form ${pct(theory)} (before max-win cap)   diff ${pct(s.rtp - theory)}`);
  console.log(`  ways ${pct(s.rtpWays, 3)}  scatter ${pct(s.rtpScatter, 3)}  feature ${pct(s.rtpFeature, 3)}`);
  console.log(`  hit frequency ${pct(s.hitFrequency, 3)}   trigger 1 in ${(1 / s.triggerFrequency).toFixed(1)}`);
  console.log(`  std dev ${s.stdDev.toFixed(3)} × stake   mean feature ${s.meanFeatureBets.toFixed(2)} bets`);
  console.log(`  mean free spins ${s.meanFreeSpins.toFixed(3)}   mean final multiplier ${s.meanFinalMultiplier.toFixed(3)}`);
  console.log(`  max win ${s.maxWinBets.toFixed(1)} bets   capped rounds ${s.cappedRounds}`);
  if (out) {
    writeFileSync(out, JSON.stringify({ seed, stats: st, summary: s }, null, 1));
    console.log(`  wrote ${out}`);
  }
  process.exit(0);
}
