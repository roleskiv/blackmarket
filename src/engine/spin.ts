/**
 * Spin resolution pipeline. Outcomes are fully decided here — the UI only
 * animates the returned SpinResult.
 *
 *  1. Generate the stop grid (weighted).
 *  2. Bonus only: apply persistent modifiers (Eye Sigils, then Raven Feathers).
 *  3. Roll for a Black Market Crate; if none, roll for the Dealer's Hand.
 *  4. Evaluate 25 paylines on the final grid, apply multipliers.
 *  5. Count scatters (pays + trigger / retrigger).
 *  6. Bonus only: roll for a contraband artifact (takes effect from next spin,
 *     except the Hourglass which adds spins immediately).
 */
import { FEATURE_CONFIG, type CrateEffectKind } from '../config/game';
import { PAYLINES } from '../config/paylines';
import { bonusMultiplier, freeSpinsFor, rollArtifact, type BonusState } from './bonus';
import { evaluateLines, evaluateScatter } from './evaluate';
import { addRandomWilds, resolveCrate, resolveDealerHand, transformAll } from './features';
import { cloneGrid, generateGrid } from './reels';
import type { Rng } from './rng';
import type { FeatureStep, Grid, SpinResult } from './types';

export interface SpinOptions {
  rng: Rng;
  bet: number;
  bonus?: BonusState;
  /** Test hooks — force a grid and/or a feature. */
  forceGrid?: Grid;
  forceCrate?: CrateEffectKind;
  forceDealerHand?: boolean;
  disableFeatures?: boolean;
}

export function resolveSpin(opts: SpinOptions): SpinResult {
  const { rng, bet, bonus } = opts;
  if (bet % PAYLINES.length !== 0) throw new Error(`Bet ${bet} must be divisible by ${PAYLINES.length}`);
  const lineBet = bet / PAYLINES.length;

  const initialGrid = opts.forceGrid ? cloneGrid(opts.forceGrid) : generateGrid(rng);
  const grid = cloneGrid(initialGrid);
  const steps: FeatureStep[] = [];
  let crateMultiplier = 1;

  if (bonus) {
    for (const s of bonus.sigils) {
      const changes = transformAll(grid, s.from, s.to);
      if (changes.length) steps.push({ type: 'eye_sigil', from: s.from, to: s.to, changes });
    }
    if (bonus.feathers > 0) {
      const changes = addRandomWilds(rng, grid, bonus.feathers);
      if (changes.length) steps.push({ type: 'raven_feather', changes });
    }
  }

  if (!opts.disableFeatures) {
    const crateChance = bonus ? FEATURE_CONFIG.crateChanceBonus : FEATURE_CONFIG.crateChance;
    if (opts.forceCrate || (!opts.forceDealerHand && rng.next() < crateChance)) {
      const step = resolveCrate(rng, grid, opts.forceCrate);
      crateMultiplier = step.multiplier;
      steps.push(step);
    } else if (opts.forceDealerHand || rng.next() < FEATURE_CONFIG.dealerHandChance) {
      steps.push(resolveDealerHand(rng, grid));
    }
  }

  const multiplier = crateMultiplier * (bonus ? bonusMultiplier(bonus) : 1);
  const lineWins = evaluateLines(grid, lineBet, multiplier);
  const scatter = evaluateScatter(grid, bet);
  const totalWin = lineWins.reduce((a, w) => a + w.win, 0) + scatter.win;

  const freeSpinsAwarded = bonus
    ? scatter.count >= FEATURE_CONFIG.scattersToTrigger
      ? FEATURE_CONFIG.retriggerSpins
      : 0
    : freeSpinsFor(scatter.count);

  const artifact = bonus ? rollArtifact(rng, bonus) : undefined;

  return {
    mode: bonus ? 'bonus' : 'base',
    bet,
    lineBet,
    initialGrid,
    steps,
    finalGrid: grid,
    lineWins,
    scatter,
    multiplier,
    totalWin,
    freeSpinsAwarded,
    artifact,
  };
}
