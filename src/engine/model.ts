/**
 * Math model definition. A model is plain data: everything that determines
 * the game's return lives here and nowhere else.
 */
export const REELS = 5;
export const ROWS = 4;
/** Total bet is always BET_COINS coins; all pays are whole coins. */
export const BET_COINS = 20;

export interface ModeStrips {
  /** One strip per reel, top to bottom, circular. */
  strips: number[][];
  /**
   * Weights for the symbol a Contraband Crate reveals, indexed by paying
   * symbol id. One draw per spin; every crate in view reveals the same symbol.
   */
  revealWeights: number[];
}

export interface MathModel {
  /** Stable identifier, e.g. "bm2-96". Stored in every round record. */
  id: string;
  /** Human label of the theoretical RTP of this variant. */
  rtpLabel: string;
  /** Theoretical RTP of the feature buy, as shown in the game rules. */
  buyRtpLabel: string;
  /** pays[symbol] = coins per way for 3, 4 and 5 consecutive reels. */
  pays: number[][];
  /** Coins paid for 3, 4 and 5 scatters anywhere in the base game. */
  scatterPays: [number, number, number];
  /** Free spins awarded for 3, 4 and 5 scatters. */
  freeSpinsAward: [number, number, number];
  base: ModeStrips;
  free: ModeStrips;
  /** Hard ceiling on free spins played in one feature. */
  maxFreeSpins: number;
  /** Ceiling of the Vault multiplier. */
  maxMultiplier: number;
  /** A round never pays more than this many total bets. */
  maxWinBets: number;
  /** Feature-buy price in total bets. */
  buyPriceBets: number;
}

export function validateModel(m: MathModel): void {
  const fail = (msg: string): never => {
    throw new Error(`Invalid math model ${m.id}: ${msg}`);
  };
  for (const mode of [m.base, m.free]) {
    if (mode.strips.length !== REELS) fail('expected 5 strips');
    if (mode.revealWeights.length !== 12) fail('expected 12 reveal weights');
    if (mode.revealWeights.some((w) => !Number.isInteger(w) || w < 0)) fail('bad reveal weight');
    if (mode.revealWeights.reduce((a, b) => a + b, 0) <= 0) fail('reveal weights sum to zero');
    mode.strips.forEach((strip, r) => {
      if (strip.length < ROWS * 2) fail(`reel ${r + 1} too short`);
      const n = strip.length;
      for (let i = 0; i < n; i++) {
        const s = strip[i];
        if (!Number.isInteger(s) || s < 0 || s > 14) fail(`reel ${r + 1} bad symbol at ${i}`);
        if (s === 12 && (r === 0 || r === REELS - 1)) fail(`wild on reel ${r + 1}`);
        if (s === 13) {
          // At most one scatter can ever be visible on a reel.
          for (let d = 1; d < ROWS; d++) {
            if (strip[(i + d) % n] === 13) fail(`scatters too close on reel ${r + 1} at ${i}`);
          }
        }
      }
    });
  }
  if (m.pays.length !== 12 || m.pays.some((p) => p.length !== 3)) fail('bad paytable');
  if (m.maxFreeSpins < m.freeSpinsAward[2]) fail('maxFreeSpins below top award');
}
