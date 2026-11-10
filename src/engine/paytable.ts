/**
 * Rules shared by every RTP variant. Only the reel strips differ between
 * variants; a player sees the same paytable and features in all of them.
 */
import type { MathModel } from './model';

/** Coins per way for 3, 4, 5 reels. Total bet = 20 coins. */
export const PAYS: number[][] = [
  [2, 5, 10], // club
  [2, 5, 10], // spade
  [2, 6, 12], // heart
  [2, 6, 12], // diamond
  [4, 10, 20], // pocket watch
  [4, 10, 20], // candle skull
  [5, 12, 30], // crystal bag
  [5, 12, 30], // plague mask
  [8, 20, 50], // cursed dagger
  [10, 25, 60], // forbidden grimoire
  [12, 30, 80], // bottled creature
  [20, 50, 150], // horned skull
];

export const SHARED_RULES: Pick<
  MathModel,
  'pays' | 'scatterPays' | 'freeSpinsAward' | 'maxFreeSpins' | 'maxMultiplier' | 'maxWinBets' | 'buyPriceBets'
> = {
  pays: PAYS,
  scatterPays: [40, 200, 2000], // 2×, 10×, 100× total bet
  freeSpinsAward: [10, 15, 25],
  maxFreeSpins: 60,
  maxMultiplier: 100,
  maxWinBets: 10000,
  buyPriceBets: 80,
};
