/**
 * Core game configuration: grid, bets, features.
 *
 * ⚠️ PROTOTYPE DATA — every probability and multiplier here is an
 * uncalibrated initial value. See README "Prototype math limitations".
 */
import type { SymbolId } from './symbols';

export const REELS = 5;
export const ROWS = 4;

/** Total-bet options in virtual demo credits. Line bet = total / 25. */
export const BET_LEVELS = [25, 50, 100, 250, 500, 1000] as const;
export const DEFAULT_BET_INDEX = 1;
export const STARTING_BALANCE = 10_000;

export type CrateEffectKind =
  | 'add_wilds'
  | 'transform_low'
  | 'multiplier'
  | 'expanding_wild'
  | 'upgrade_premium';

export interface CrateEffectConfig {
  kind: CrateEffectKind;
  title: string;
  description: string;
  weight: number;
}

export const FEATURE_CONFIG = {
  /** Chance per BASE spin that a Black Market Crate activates. */
  crateChance: 0.07,
  /** Chance per FREE spin that a crate activates. */
  crateChanceBonus: 0.2,
  crateEffects: [
    { kind: 'add_wilds',       title: 'Wild Contraband', description: 'Scatters 2–4 Wilds onto the reels.',                     weight: 30 },
    { kind: 'transform_low',   title: 'Counterfeit Swap', description: 'Every copy of one card suit becomes one uncommon artifact.', weight: 25 },
    { kind: 'multiplier',      title: 'Loaded Ledger',    description: 'Multiplies all line wins this spin (×2, ×3 or ×5).',      weight: 20 },
    { kind: 'expanding_wild',  title: 'Raven Column',     description: 'One reel turns fully Wild.',                              weight: 12 },
    { kind: 'upgrade_premium', title: 'Appraiser’s Eye',  description: 'Every copy of one uncommon artifact upgrades to a premium artifact.', weight: 13 },
  ] satisfies CrateEffectConfig[],
  addWildsRange: [2, 4] as [number, number],
  multiplierValues: [
    { value: 2, weight: 60 },
    { value: 3, weight: 30 },
    { value: 5, weight: 10 },
  ],
  /** Reels (0-based) eligible for the expanding wild. */
  expandingWildReels: [1, 2, 3] as number[],

  /** Chance per spin (base or bonus) that the Dealer's Hand intervenes, if no crate fired. */
  dealerHandChance: 0.05,
  /** Symbols the dealer may "deal" onto a reel, with weights. */
  dealerHandSymbols: [
    { symbol: 'wild' as SymbolId, weight: 15 },
    { symbol: 'horned_skull' as SymbolId, weight: 15 },
    { symbol: 'bottled_creature' as SymbolId, weight: 20 },
    { symbol: 'forbidden_grimoire' as SymbolId, weight: 25 },
    { symbol: 'cursed_dagger' as SymbolId, weight: 25 },
  ],

  /** Dealer's Vault bonus. */
  scattersToTrigger: 3,
  freeSpinsAwarded: { 3: 10, 4: 12, 5: 20 } as Record<number, number>,
  retriggerSpins: 5,
  /** Chance per free spin that a contraband artifact is collected. */
  artifactChance: 0.4,
  maxWildFeathers: 3,
};

export type ArtifactKind = 'ledger' | 'raven_feather' | 'hourglass' | 'eye_sigil';

export interface ArtifactConfig {
  kind: ArtifactKind;
  name: string;
  description: string;
  persistent: boolean;
  weight: number;
  color: string;
}

/** Collectible contraband artifacts found during the Dealer's Vault bonus. */
export const ARTIFACTS: ArtifactConfig[] = [
  { kind: 'ledger',        name: 'Golden Ledger',  description: '+1 to the win multiplier for the rest of the bonus.',                 persistent: true,  weight: 35, color: '#f1d58a' },
  { kind: 'raven_feather', name: 'Raven Feather',  description: 'Adds 1 extra Wild to every remaining free spin (max 3).',             persistent: true,  weight: 30, color: '#b45cff' },
  { kind: 'hourglass',     name: 'Stolen Hourglass', description: '+2 free spins, instantly.',                                         persistent: false, weight: 20, color: '#7dff6a' },
  { kind: 'eye_sigil',     name: 'Eye Sigil',      description: 'One card suit is permanently upgraded to a premium artifact.',        persistent: true,  weight: 15, color: '#ff2d6f' },
];
