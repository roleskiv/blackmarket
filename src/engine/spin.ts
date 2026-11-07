/**
 * Spin resolution pipeline. Outcomes are fully decided here — the UI only
 * animates the returned SpinResult.
 *
 * A spin resolves in two halves so the player can pick a crate:
 *
 *  startSpin
 *   1. Generate the stop grid (weighted).
 *   2. Bonus only: persistent modifiers — Eye Sigils, Iron Shackles (sticky
 *      wilds), then Raven Feathers.
 *   3. Roll for a Black Market Crate. If it fires, the engine draws THREE
 *      different crate effects and resolves each one on its own copy of the
 *      grid. Otherwise roll for the Dealer's Hand.
 *   4. Roll for a multiplier potion.
 *  finishSpin(pick)
 *   5. Apply the picked crate (if any), evaluate 25 paylines on the final grid
 *      with multipliers and potions, count scatters, award free spins.
 *   6. Bonus only: roll for a contraband artifact.
 */
import { FEATURE_CONFIG, type CrateEffectKind, type CrateEffectConfig } from '../config/game';
import { PAYLINES } from '../config/paylines';
import { bonusMultiplier, freeSpinsFor, rollArtifact, type BonusState } from './bonus';
import { evaluateLines, evaluateScatter } from './evaluate';
import { addRandomWilds, resolveCrate, resolveDealerHand, transformAll } from './features';
import { cloneGrid, generateGrid } from './reels';
import type { Rng } from './rng';
import type { CellChange, CrateOffer, CrateStep, FeatureStep, Grid, Potion, SpinResult } from './types';

export interface SpinOptions {
  rng: Rng;
  bet: number;
  bonus?: BonusState;
  /** Test hooks — force a grid and/or a feature. */
  forceGrid?: Grid;
  forceCrate?: CrateEffectKind;
  forceDealerHand?: boolean;
  forcePotion?: Potion;
  disableFeatures?: boolean;
}

export interface PendingSpin {
  opts: SpinOptions;
  lineBet: number;
  initialGrid: Grid;
  /** Grid after pre-crate steps (and the dealer's hand, if it fired). */
  grid: Grid;
  /** Steps already applied (sigils, sticky wilds, feathers, dealer's hand). */
  steps: FeatureStep[];
  /** Present when a crate fired: the three offers, each fully resolved. */
  offers?: CrateOffer[];
  potions: Potion[];
}

/** Draw `n` distinct crate effects, weighted, without replacement. */
function drawEffects(rng: Rng, n: number, forced?: CrateEffectKind): CrateEffectKind[] {
  const pool: CrateEffectConfig[] = FEATURE_CONFIG.crateEffects.slice();
  const out: CrateEffectKind[] = [];
  if (forced) {
    out.push(forced);
    pool.splice(pool.findIndex((e) => e.kind === forced), 1);
  }
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool);
    out.push(pick.kind);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

export function startSpin(opts: SpinOptions): PendingSpin {
  const { rng, bet, bonus } = opts;
  if (bet % PAYLINES.length !== 0) throw new Error(`Bet ${bet} must be divisible by ${PAYLINES.length}`);
  const lineBet = bet / PAYLINES.length;

  const initialGrid = opts.forceGrid ? cloneGrid(opts.forceGrid) : generateGrid(rng);
  const grid = cloneGrid(initialGrid);
  const steps: FeatureStep[] = [];

  if (bonus) {
    for (const s of bonus.sigils) {
      const changes = transformAll(grid, s.from, s.to);
      if (changes.length) steps.push({ type: 'eye_sigil', from: s.from, to: s.to, changes });
    }
    if (bonus.stickyCells.length) {
      const changes: CellChange[] = [];
      for (const c of bonus.stickyCells) {
        const from = grid[c.reel][c.row];
        if (from === 'wild' || from === 'scatter') continue;
        grid[c.reel][c.row] = 'wild';
        changes.push({ ...c, from, to: 'wild' });
      }
      if (changes.length) steps.push({ type: 'sticky_wilds', changes });
    }
    if (bonus.feathers > 0) {
      const changes = addRandomWilds(rng, grid, bonus.feathers);
      if (changes.length) steps.push({ type: 'raven_feather', changes });
    }
  }

  let offers: CrateOffer[] | undefined;
  if (!opts.disableFeatures) {
    const crateChance = bonus ? FEATURE_CONFIG.crateChanceBonus : FEATURE_CONFIG.crateChance;
    if (opts.forceCrate || (!opts.forceDealerHand && rng.next() < crateChance)) {
      offers = drawEffects(rng, FEATURE_CONFIG.crateOfferCount, opts.forceCrate).map((kind) => {
        const g = cloneGrid(grid);
        return { step: resolveCrate(rng, g, kind), grid: g };
      });
      // Offers are shuffled so a crate's position says nothing about its contents.
      for (let i = offers.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [offers[i], offers[j]] = [offers[j], offers[i]];
      }
    } else if (opts.forceDealerHand || rng.next() < FEATURE_CONFIG.dealerHandChance) {
      steps.push(resolveDealerHand(rng, grid));
    }
  }

  const potions: Potion[] = [];
  if (opts.forcePotion) potions.push(opts.forcePotion);
  else if (!opts.disableFeatures && rng.next() < (bonus ? FEATURE_CONFIG.potionChanceBonus : FEATURE_CONFIG.potionChance)) {
    potions.push({ cell: { reel: rng.int(5), row: rng.int(4) }, value: rng.weighted(FEATURE_CONFIG.potionValues).value });
  }

  return { opts, lineBet, initialGrid, grid, steps, offers, potions };
}

export function finishSpin(p: PendingSpin, pick = 0): SpinResult {
  const { rng, bet, bonus } = p.opts;
  const steps = p.steps.slice();
  let grid = p.grid;
  let crateMultiplier = 1;
  let crateOffers: CrateStep[] | undefined;
  let cratePick: number | undefined;

  if (p.offers) {
    if (!Number.isInteger(pick) || pick < 0 || pick >= p.offers.length) throw new Error(`Invalid crate pick ${pick}`);
    const chosen = p.offers[pick];
    grid = chosen.grid;
    crateMultiplier = chosen.step.multiplier;
    steps.push(chosen.step);
    crateOffers = p.offers.map((o) => o.step);
    cratePick = pick;
  }
  // Potions never sit on a scatter (it never forms part of a line).
  const potions = p.potions.filter((pt) => grid[pt.cell.reel][pt.cell.row] !== 'scatter');
  for (const pt of potions) steps.push({ type: 'potion', cell: pt.cell, value: pt.value });

  const multiplier = crateMultiplier * (bonus ? bonusMultiplier(bonus) : 1);
  const lineWins = evaluateLines(grid, p.lineBet, multiplier, potions);
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
    lineBet: p.lineBet,
    initialGrid: p.initialGrid,
    steps,
    finalGrid: grid,
    lineWins,
    scatter,
    multiplier,
    totalWin,
    freeSpinsAwarded,
    artifact,
    crateOffers,
    cratePick,
    potions,
    capped: false,
  };
}

/** One-shot resolution (tests, simulation): start + finish with a given crate pick. */
export function resolveSpin(opts: SpinOptions & { cratePick?: number }): SpinResult {
  return finishSpin(startSpin(opts), opts.cratePick ?? 0);
}
