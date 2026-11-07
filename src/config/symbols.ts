/**
 * Symbol definitions — the single source of truth for every symbol the engine
 * and UI know about.
 *
 * Artwork is referenced by path only (public/assets/symbols/<file>.png), so a
 * symbol's art can be replaced by dropping in a new PNG with the same filename
 * — no engine changes required. Missing files render a labeled placeholder.
 *
 * ⚠️ PROTOTYPE DATA: reel weights and payouts below are UNCALIBRATED initial
 * values chosen for a playable feel. They have only been checked by the
 * simulation in scripts/simulate.ts; they are not certified game math.
 */

export type Rarity = 'common' | 'uncommon' | 'premium' | 'special';

export type SymbolId =
  | 'spade' | 'heart' | 'club' | 'diamond'
  | 'pocket_watch' | 'candle_skull' | 'plague_mask' | 'crystal_bag'
  | 'horned_skull' | 'bottled_creature' | 'forbidden_grimoire' | 'cursed_dagger'
  | 'wild' | 'scatter';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  rarity: Rarity;
  /** Path relative to the app base URL. */
  image: string;
  /** Per-reel generation weight (5 entries, one per reel). */
  weights: [number, number, number, number, number];
  /**
   * Line pays as a multiple of the LINE bet for 3/4/5 of a kind.
   * For the scatter these are multiples of the TOTAL bet for 3/4/5 anywhere.
   */
  pays: { 3: number; 4: number; 5: number };
  /** Accent colour used for glows, particles and placeholders. */
  glow: string;
  /** Whether the landing animation should be the heavier "special" bounce. */
  heavyLand?: boolean;
}

const img = (id: SymbolId) => `assets/symbols/${id}.png`;

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  // ── Common (card suits) ────────────────────────────────────────────────
  spade:   { id: 'spade',   name: 'Spade',   rarity: 'common', image: img('spade'),   weights: [30, 30, 30, 30, 30], pays: { 3: 15, 4: 50, 5: 200 },  glow: '#9b6bff' },
  heart:   { id: 'heart',   name: 'Heart',   rarity: 'common', image: img('heart'),   weights: [30, 30, 30, 30, 30], pays: { 3: 15, 4: 50, 5: 200 },  glow: '#ff4a5e' },
  club:    { id: 'club',    name: 'Club',    rarity: 'common', image: img('club'),    weights: [30, 30, 30, 30, 30], pays: { 3: 15, 4: 50, 5: 200 },  glow: '#7dff6a' },
  diamond: { id: 'diamond', name: 'Diamond', rarity: 'common', image: img('diamond'), weights: [30, 30, 30, 30, 30], pays: { 3: 15, 4: 50, 5: 200 },  glow: '#f1b84a' },

  // ── Uncommon ───────────────────────────────────────────────────────────
  pocket_watch: { id: 'pocket_watch', name: 'Pocket Watch', rarity: 'uncommon', image: img('pocket_watch'), weights: [18, 18, 18, 18, 18], pays: { 3: 25, 4: 100, 5: 400 }, glow: '#e8c069' },
  candle_skull: { id: 'candle_skull', name: 'Candle Skull', rarity: 'uncommon', image: img('candle_skull'), weights: [18, 18, 18, 18, 18], pays: { 3: 25, 4: 100, 5: 400 }, glow: '#d27bff' },
  plague_mask:  { id: 'plague_mask',  name: 'Plague Mask',  rarity: 'uncommon', image: img('plague_mask'),  weights: [16, 16, 16, 16, 16], pays: { 3: 30, 4: 125, 5: 500 }, glow: '#c9a24a' },
  crystal_bag:  { id: 'crystal_bag',  name: 'Crystal Bag',  rarity: 'uncommon', image: img('crystal_bag'),  weights: [16, 16, 16, 16, 16], pays: { 3: 30, 4: 125, 5: 500 }, glow: '#b45cff' },

  // ── Premium ────────────────────────────────────────────────────────────
  cursed_dagger:      { id: 'cursed_dagger',      name: 'Cursed Dagger',      rarity: 'premium', image: img('cursed_dagger'),      weights: [10, 10, 10, 10, 10], pays: { 3: 50, 4: 200, 5: 800 },  glow: '#ff3355' },
  forbidden_grimoire: { id: 'forbidden_grimoire', name: 'Forbidden Grimoire', rarity: 'premium', image: img('forbidden_grimoire'), weights: [9, 9, 9, 9, 9],      pays: { 3: 60, 4: 250, 5: 1000 }, glow: '#f1d58a' },
  bottled_creature:   { id: 'bottled_creature',   name: 'Bottled Creature',   rarity: 'premium', image: img('bottled_creature'),   weights: [8, 8, 8, 8, 8],      pays: { 3: 80, 4: 300, 5: 1250 }, glow: '#7dff6a' },
  horned_skull:       { id: 'horned_skull',       name: 'Horned Skull',       rarity: 'premium', image: img('horned_skull'),       weights: [5, 5, 5, 5, 5],      pays: { 3: 100, 4: 500, 5: 2500 }, glow: '#d27bff', heavyLand: true },

  // ── Special ────────────────────────────────────────────────────────────
  // Wild substitutes for every symbol except the scatter; 3+ wilds on a line
  // also pay as their own symbol.
  wild:    { id: 'wild',    name: 'Wild',    rarity: 'special', image: img('wild'),    weights: [0, 6, 6, 6, 6], pays: { 3: 150, 4: 750, 5: 3000 }, glow: '#b45cff', heavyLand: true },
  // Scatter pays anywhere (multiples of total bet); 3+ trigger the Dealer's Vault.
  scatter: { id: 'scatter', name: 'Scatter', rarity: 'special', image: img('scatter'), weights: [5, 5, 5, 5, 5], pays: { 3: 2, 4: 10, 5: 50 },  glow: '#ff2d6f', heavyLand: true },
};

export const SYMBOL_IDS = Object.keys(SYMBOLS) as SymbolId[];
export const STANDARD_SYMBOLS = SYMBOL_IDS.filter((s) => SYMBOLS[s].rarity !== 'special');
export const symbolsOfRarity = (r: Rarity) => SYMBOL_IDS.filter((s) => SYMBOLS[s].rarity === r);

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  premium: 'Premium',
  special: 'Special',
};
