/**
 * Dealer's Vault bonus state and transitions.
 * The state is a plain serialisable object; transitions are pure functions.
 */
import { ARTIFACTS, FEATURE_CONFIG, type ArtifactKind } from '../config/game';
import { symbolsOfRarity, type SymbolId } from '../config/symbols';
import type { Rng } from './rng';
import type { ArtifactDrop } from './types';

export interface BonusState {
  /** Total bet that triggered the bonus — every free spin plays at this bet. */
  bet: number;
  spinsAwarded: number;
  spinsRemaining: number;
  spinsPlayed: number;
  totalWin: number;
  /** Persistent modifiers. */
  ledgers: number;
  feathers: number;
  sigils: { from: SymbolId; to: SymbolId }[];
  /** Every artifact collected, in order. */
  collected: ArtifactDrop[];
  retriggers: number;
}

export interface BonusSummary {
  bet: number;
  spinsPlayed: number;
  totalWin: number;
  collected: ArtifactDrop[];
  retriggers: number;
  finalMultiplier: number;
}

export function freeSpinsFor(scatters: number): number {
  if (scatters < FEATURE_CONFIG.scattersToTrigger) return 0;
  return FEATURE_CONFIG.freeSpinsAwarded[Math.min(scatters, 5)] ?? 0;
}

export function startBonus(bet: number, spins: number): BonusState {
  return {
    bet,
    spinsAwarded: spins,
    spinsRemaining: spins,
    spinsPlayed: 0,
    totalWin: 0,
    ledgers: 0,
    feathers: 0,
    sigils: [],
    collected: [],
    retriggers: 0,
  };
}

export const bonusMultiplier = (b: BonusState) => 1 + b.ledgers;

/**
 * Roll for a contraband artifact. Rules:
 *  - `artifactChance` per free spin.
 *  - A Raven Feather beyond the cap, or an Eye Sigil when every suit is already
 *    sigiled, is converted to a Golden Ledger.
 */
export function rollArtifact(rng: Rng, b: BonusState): ArtifactDrop | undefined {
  if (rng.next() >= FEATURE_CONFIG.artifactChance) return undefined;
  let kind: ArtifactKind = rng.weighted(ARTIFACTS).kind;
  const commons = symbolsOfRarity('common').filter((s) => !b.sigils.some((g) => g.from === s));
  if (kind === 'raven_feather' && b.feathers >= FEATURE_CONFIG.maxWildFeathers) kind = 'ledger';
  if (kind === 'eye_sigil' && commons.length === 0) kind = 'ledger';
  if (kind === 'eye_sigil') {
    const premium = symbolsOfRarity('premium');
    return { kind, from: commons[rng.int(commons.length)], to: premium[rng.int(premium.length)] };
  }
  if (kind === 'hourglass') return { kind, extraSpins: 2 };
  return { kind };
}

/** Apply a collected artifact to the bonus state (returns a new state). */
export function applyArtifact(b: BonusState, a: ArtifactDrop): BonusState {
  const next: BonusState = { ...b, collected: [...b.collected, a], sigils: b.sigils.slice() };
  switch (a.kind) {
    case 'ledger':
      next.ledgers += 1;
      break;
    case 'raven_feather':
      next.feathers = Math.min(FEATURE_CONFIG.maxWildFeathers, next.feathers + 1);
      break;
    case 'hourglass':
      next.spinsRemaining += a.extraSpins ?? 0;
      next.spinsAwarded += a.extraSpins ?? 0;
      break;
    case 'eye_sigil':
      if (a.from && a.to) next.sigils.push({ from: a.from, to: a.to });
      break;
  }
  return next;
}

export function summarise(b: BonusState): BonusSummary {
  return {
    bet: b.bet,
    spinsPlayed: b.spinsPlayed,
    totalWin: b.totalWin,
    collected: b.collected,
    retriggers: b.retriggers,
    finalMultiplier: bonusMultiplier(b),
  };
}
