/**
 * Symbol table. Symbols are small integers everywhere in the engine and the
 * math tooling; `key` is the art filename stem (public/assets/symbols/<key>.png).
 */
export const CLUB = 0;
export const SPADE = 1;
export const HEART = 2;
export const DIAMOND = 3;
export const POCKET_WATCH = 4;
export const CANDLE_SKULL = 5;
export const CRYSTAL_BAG = 6;
export const PLAGUE_MASK = 7;
export const CURSED_DAGGER = 8;
export const FORBIDDEN_GRIMOIRE = 9;
export const BOTTLED_CREATURE = 10;
export const HORNED_SKULL = 11;
export const WILD = 12;
export const SCATTER = 13;
export const CRATE = 14;

/** Number of paying symbols (ids 0..PAY_SYMBOLS-1). */
export const PAY_SYMBOLS = 12;
export const SYMBOL_COUNT = 15;

export type Tier = 'low' | 'mid' | 'high' | 'special';

export interface SymbolInfo {
  id: number;
  key: string;
  name: string;
  tier: Tier;
  /** One-letter code used in reel-strip listings and round records. */
  code: string;
}

export const SYMBOLS: readonly SymbolInfo[] = [
  { id: CLUB, key: 'club', name: 'Club', tier: 'low', code: 'c' },
  { id: SPADE, key: 'spade', name: 'Spade', tier: 'low', code: 's' },
  { id: HEART, key: 'heart', name: 'Heart', tier: 'low', code: 'h' },
  { id: DIAMOND, key: 'diamond', name: 'Diamond', tier: 'low', code: 'd' },
  { id: POCKET_WATCH, key: 'pocket_watch', name: 'Pocket Watch', tier: 'mid', code: 'P' },
  { id: CANDLE_SKULL, key: 'candle_skull', name: 'Candle Skull', tier: 'mid', code: 'K' },
  { id: CRYSTAL_BAG, key: 'crystal_bag', name: 'Crystal Bag', tier: 'mid', code: 'B' },
  { id: PLAGUE_MASK, key: 'plague_mask', name: 'Plague Mask', tier: 'mid', code: 'M' },
  { id: CURSED_DAGGER, key: 'cursed_dagger', name: 'Cursed Dagger', tier: 'high', code: 'D' },
  { id: FORBIDDEN_GRIMOIRE, key: 'forbidden_grimoire', name: 'Forbidden Grimoire', tier: 'high', code: 'G' },
  { id: BOTTLED_CREATURE, key: 'bottled_creature', name: 'Bottled Creature', tier: 'high', code: 'C' },
  { id: HORNED_SKULL, key: 'horned_skull', name: 'Horned Skull', tier: 'high', code: 'H' },
  { id: WILD, key: 'wild', name: 'Wild', tier: 'special', code: 'W' },
  { id: SCATTER, key: 'scatter', name: 'Scatter', tier: 'special', code: 'S' },
  { id: CRATE, key: 'crate', name: 'Contraband Crate', tier: 'special', code: '?' },
];

const CODE_TO_ID = new Map(SYMBOLS.map((s) => [s.code, s.id]));

/** Parses a compact strip listing such as "ccsW?hS" into symbol ids. */
export function parseStrip(listing: string): number[] {
  const out: number[] = [];
  for (const ch of listing) {
    if (ch === ' ' || ch === '\n') continue;
    const id = CODE_TO_ID.get(ch);
    if (id === undefined) throw new Error(`Unknown symbol code "${ch}"`);
    out.push(id);
  }
  return out;
}

export function formatStrip(strip: readonly number[]): string {
  return strip.map((s) => SYMBOLS[s].code).join('');
}
