/**
 * 25 fixed paylines for a 5-reel × 4-row grid.
 * Each payline is an explicit array of ROW indices (0 = top, 3 = bottom),
 * one entry per reel, read left → right.
 */
export type Payline = readonly [number, number, number, number, number];

export const PAYLINES: readonly Payline[] = [
  [0, 0, 0, 0, 0], //  1 top row
  [1, 1, 1, 1, 1], //  2
  [2, 2, 2, 2, 2], //  3
  [3, 3, 3, 3, 3], //  4 bottom row
  [0, 1, 2, 1, 0], //  5 shallow V
  [3, 2, 1, 2, 3], //  6 shallow ^
  [1, 2, 3, 2, 1], //  7 low V
  [2, 1, 0, 1, 2], //  8 high ^
  [0, 1, 2, 3, 3], //  9 descending
  [3, 2, 1, 0, 0], // 10 ascending
  [0, 0, 1, 2, 3], // 11 slide down
  [3, 3, 2, 1, 0], // 12 slide up
  [1, 0, 0, 0, 1], // 13 top cup
  [2, 3, 3, 3, 2], // 14 bottom cup
  [0, 1, 1, 1, 0], // 15
  [3, 2, 2, 2, 3], // 16
  [1, 1, 0, 1, 1], // 17 bump up
  [2, 2, 3, 2, 2], // 18 bump down
  [1, 2, 1, 2, 1], // 19 zig
  [2, 1, 2, 1, 2], // 20 zag
  [0, 1, 0, 1, 0], // 21 high zig
  [3, 2, 3, 2, 3], // 22 low zag
  [1, 1, 2, 1, 1], // 23 dip
  [2, 2, 1, 2, 2], // 24 rise
  [0, 2, 0, 2, 0], // 25 wide zig
] as const;

export const PAYLINE_COLORS = PAYLINES.map((_, i) => `hsl(${(i * 47) % 360} 90% 62%)`);
