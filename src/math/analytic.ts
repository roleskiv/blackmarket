/**
 * Closed-form return calculation for a math model.
 *
 * This is deliberately a second, independent implementation of the game
 * rules: it never calls the engine. The engine is checked against it by
 * simulation (scripts/simulate.ts) and by brute-force enumeration on small
 * strips (tests/analytic.test.ts).
 *
 * Method. Reels stop independently and uniformly, so for one symbol s and a
 * fixed crate reveal the all-ways win
 *
 *     pay(s, n) · Π_{r ≤ n} e_r(s) · [e_{n+1}(s) = 0]
 *
 * (e_r = matching positions on reel r) is a product of per-reel factors, and
 * its expectation is the product of per-reel expectations. To keep the joint
 * law with the number of Wilds (K) and Scatters (J) in view, each per-reel
 * expectation is a small polynomial in two formal variables z^wilds y^scatters.
 * Multiplying them gives E[win · 1{K=k, J=j}] for every (k, j) at once.
 *
 * The free-spin feature is then an exact finite Markov decision-free process
 * over (spins granted, spins remaining, multiplier) solved by dynamic
 * programming. The only thing not covered in closed form is the maximum-win
 * cap, whose (tiny, negative) effect is measured by simulation.
 */
import { BET_COINS, REELS, ROWS, type MathModel, type ModeStrips } from '../engine/model';
import { CRATE, PAY_SYMBOLS, SCATTER, WILD } from '../engine/symbols';

const KMAX = ROWS * 3 + 1; // wilds in view: 0..12 (reels 2-4)
const JMAX = REELS + 1; // scatters in view: 0..5
const PSIZE = KMAX * JMAX;

type Poly = Float64Array;

const poly = (): Poly => new Float64Array(PSIZE);

function mul(a: Poly, b: Poly): Poly {
  const out = poly();
  for (let ka = 0; ka < KMAX; ka++) {
    for (let ja = 0; ja < JMAX; ja++) {
      const va = a[ka * JMAX + ja];
      if (va === 0) continue;
      for (let kb = 0; ka + kb < KMAX; kb++) {
        for (let jb = 0; ja + jb < JMAX; jb++) {
          const vb = b[kb * JMAX + jb];
          if (vb !== 0) out[(ka + kb) * JMAX + ja + jb] += va * vb;
        }
      }
    }
  }
  return out;
}

function addScaled(target: Poly, src: Poly, f: number): void {
  for (let i = 0; i < PSIZE; i++) target[i] += src[i] * f;
}

const ONE: Poly = (() => {
  const p = poly();
  p[0] = 1;
  return p;
})();

export interface ModeTables {
  /** prob[k][j] = P(K = k wilds, J = j scatters). */
  prob: number[][];
  /** win[k][j] = E[ways coins · 1{K=k, J=j}]. */
  win: number[][];
  /** E[ways coins]. */
  meanWaysCoins: number;
  /** Per symbol: expected coins from 3, 4 and 5 reel wins. */
  bySymbol: number[][];
  /** P(J = j), j = 0..5. */
  scatterDist: number[];
  /** E[K]: wilds landing per spin. */
  meanWilds: number;
}

/** Joint tables for one strip set (base or free). */
export function modeTables(model: MathModel, mode: ModeStrips): ModeTables {
  const total = mode.revealWeights.reduce((a, b) => a + b, 0);
  const q = mode.revealWeights.map((w) => w / total);

  // Per reel: C = E[z^w y^sc]; A[s][v] = E[e z^w y^sc]; B[s][v] = E[1{e=0} z^w y^sc].
  const C: Poly[] = [];
  const A: Poly[][][] = [];
  const B: Poly[][][] = [];
  for (let r = 0; r < REELS; r++) {
    const strip = mode.strips[r];
    const L = strip.length;
    const c = poly();
    const a: Poly[][] = [];
    const b: Poly[][] = [];
    for (let s = 0; s < PAY_SYMBOLS; s++) {
      a.push([poly(), poly()]);
      b.push([poly(), poly()]);
    }
    const n = new Int32Array(15);
    for (let p = 0; p < L; p++) {
      n.fill(0);
      for (let i = 0; i < ROWS; i++) n[strip[(p + i) % L]]++;
      const idx = n[WILD] * JMAX + n[SCATTER];
      const w = 1 / L;
      c[idx] += w;
      for (let s = 0; s < PAY_SYMBOLS; s++) {
        for (let v = 0; v < 2; v++) {
          const e = n[s] + n[WILD] + v * n[CRATE];
          if (e > 0) a[s][v][idx] += e * w;
          else b[s][v][idx] += w;
        }
      }
    }
    C.push(c);
    A.push(a);
    B.push(b);
  }

  // Suffix products of C: tail[r] = Π_{t ≥ r} C_t.
  const tail: Poly[] = new Array(REELS + 1);
  tail[REELS] = ONE;
  for (let r = REELS - 1; r >= 0; r--) tail[r] = mul(C[r], tail[r + 1]);

  const winPoly = poly();
  const bySymbol: number[][] = [];
  for (let s = 0; s < PAY_SYMBOLS; s++) {
    const parts = [0, 0, 0];
    for (let v = 0; v < 2; v++) {
      const weight = v === 1 ? q[s] : 1 - q[s];
      if (weight === 0) continue;
      let prefix: Poly = ONE;
      for (let r = 0; r < REELS; r++) {
        prefix = mul(prefix, A[r][s][v]);
        const len = r + 1;
        if (len < 3) continue;
        const term = len < REELS ? mul(mul(prefix, B[len][s][v]), tail[len + 1]) : prefix;
        const f = model.pays[s][len - 3] * weight;
        addScaled(winPoly, term, f);
        let sum = 0;
        for (let i = 0; i < PSIZE; i++) sum += term[i];
        parts[len - 3] += sum * f;
      }
    }
    bySymbol.push(parts);
  }

  const probPoly = tail[0];
  const prob: number[][] = [];
  const win: number[][] = [];
  const scatterDist = new Array<number>(JMAX).fill(0);
  let meanWaysCoins = 0;
  let meanWilds = 0;
  for (let k = 0; k < KMAX; k++) {
    prob.push([]);
    win.push([]);
    for (let j = 0; j < JMAX; j++) {
      const p = probPoly[k * JMAX + j];
      const w = winPoly[k * JMAX + j];
      prob[k].push(p);
      win[k].push(w);
      scatterDist[j] += p;
      meanWaysCoins += w;
      meanWilds += k * p;
    }
  }
  return { prob, win, meanWaysCoins, bySymbol, scatterDist, meanWilds };
}

export interface FeatureValue {
  /** Expected feature coins when entering with n = freeSpinsAward[i] spins. */
  coins: [number, number, number];
  /** Expected number of free spins played for each entry. */
  spins: [number, number, number];
  /** Expected multiplier at the end of the feature for each entry. */
  finalMultiplier: [number, number, number];
}

/**
 * Exact value of the Vault feature, without the maximum-win cap.
 * State: g = spins granted so far, n = spins remaining, m = multiplier.
 * Each spin lowers (maxFreeSpins − g) + n by exactly one, so the recursion
 * is evaluated in increasing order of that quantity.
 */
export function featureValue(model: MathModel, free: ModeTables): FeatureValue {
  const G = model.maxFreeSpins;
  const M = model.maxMultiplier;
  const at = (g: number, n: number, m: number) => (g * (G + 1) + n) * (M + 1) + m;
  const size = (G + 1) * (G + 1) * (M + 1);
  const V = new Float64Array(size); // coins
  const N = new Float64Array(size); // spins still to be played
  const F = new Float64Array(size); // final multiplier
  for (let g = 0; g <= G; g++) for (let m = 1; m <= M; m++) F[at(g, 0, m)] = m;

  // Flatten the non-zero outcomes once.
  const ks: number[] = [];
  const js: number[] = [];
  const ps: number[] = [];
  const ws: number[] = [];
  for (let k = 0; k < KMAX; k++) {
    for (let j = 0; j < JMAX; j++) {
      if (free.prob[k][j] > 0) {
        ks.push(k);
        js.push(j);
        ps.push(free.prob[k][j]);
        ws.push(free.win[k][j]);
      }
    }
  }

  for (let u = 1; u <= G; u++) {
    // u = (G − g) + n, n ≥ 1, n ≤ g.
    for (let n = 1; n <= u; n++) {
      const g = G - (u - n);
      if (g < n || g > G) continue;
      for (let m = 1; m <= M; m++) {
        let v = 0;
        let cnt = 1;
        let fin = 0;
        for (let i = 0; i < ks.length; i++) {
          const m2 = Math.min(m + ks[i], M);
          const extra = Math.min(js[i], G - g);
          const nx = at(g + extra, n - 1 + extra, m2);
          v += ws[i] * m2 + ps[i] * V[nx];
          cnt += ps[i] * N[nx];
          fin += ps[i] * F[nx];
        }
        const idx = at(g, n, m);
        V[idx] = v;
        N[idx] = cnt;
        F[idx] = fin;
      }
    }
  }

  const pick = (arr: Float64Array) =>
    model.freeSpinsAward.map((n) => arr[at(n, n, 1)]) as [number, number, number];
  return { coins: pick(V), spins: pick(N), finalMultiplier: pick(F) };
}

/** Exact base-game hit frequency: P(any way win or scatter pay). */
export function baseHitFrequency(model: MathModel): number {
  const { strips, revealWeights } = model.base;
  const total = revealWeights.reduce((a, b) => a + b, 0);
  const ALL = (1 << PAY_SYMBOLS) - 1;

  // Per stop: bitmask of symbols present, crate flag, scatter flag.
  const info = strips.map((strip) => {
    const L = strip.length;
    const mask = new Int32Array(L);
    const crate = new Uint8Array(L);
    const scat = new Uint8Array(L);
    for (let p = 0; p < L; p++) {
      let m = 0;
      for (let i = 0; i < ROWS; i++) {
        const s = strip[(p + i) % L];
        if (s < PAY_SYMBOLS) m |= 1 << s;
        else if (s === WILD) m = ALL;
        else if (s === CRATE) crate[p] = 1;
        else if (s === SCATTER) scat[p] = 1;
      }
      mask[p] = m;
    }
    return { L, mask, crate, scat };
  });

  const pScat = info.map((x) => x.scat.reduce((a, b) => a + b, 0) / x.L);
  // P(scatters on reels 4+5 ≥ need).
  const p4 = pScat[3];
  const p5 = pScat[4];
  const tailAtLeast = [1, 1 - (1 - p4) * (1 - p5), p4 * p5, 0];

  let hit = 0;
  const [r1, r2, r3] = info;
  for (let a = 0; a < r1.L; a++) {
    for (let b = 0; b < r2.L; b++) {
      const m12 = r1.mask[a] & r2.mask[b];
      const c12 = r1.crate[a] & r2.crate[b];
      for (let c = 0; c < r3.L; c++) {
        const sc = r1.scat[a] + r2.scat[b] + r3.scat[c];
        const scatterOnly = tailAtLeast[3 - sc];
        // Symbols that complete three reels without a reveal.
        const plain = m12 & r3.mask[c];
        if (plain !== 0) {
          hit += 1;
          continue;
        }
        if (!(r1.crate[a] | r2.crate[b] | r3.crate[c])) {
          hit += scatterOnly;
          continue;
        }
        // With crates in view, a reveal of X also matches wherever a crate is.
        let pWin = 0;
        for (let x = 0; x < PAY_SYMBOLS; x++) {
          if (revealWeights[x] === 0) continue;
          const bit = 1 << x;
          const ok =
            (r1.mask[a] & bit || r1.crate[a]) &&
            (r2.mask[b] & bit || r2.crate[b]) &&
            (r3.mask[c] & bit || r3.crate[c]);
          if (ok) pWin += revealWeights[x] / total;
        }
        void c12;
        hit += pWin + (1 - pWin) * scatterOnly;
      }
    }
  }
  return hit / (r1.L * r2.L * r3.L);
}

export interface Analysis {
  base: ModeTables;
  free: ModeTables;
  feature: FeatureValue;
  /** P(feature trigger) per base spin. */
  triggerProb: number;
  /** Return components as fractions of the bet. */
  rtp: { ways: number; scatter: number; feature: number; total: number };
  /** Expected return of a bought round in bets, and as a fraction of its price. */
  buy: { meanBets: number; rtp: number; entryDist: [number, number, number] };
  /** Mean feature win in bets, averaged over natural triggers. */
  meanFeatureBets: number;
}

export function analyze(model: MathModel): Analysis {
  const base = modeTables(model, model.base);
  const free = modeTables(model, model.free);
  const feature = featureValue(model, free);

  let scatterCoins = 0;
  let featureCoins = 0;
  let triggerProb = 0;
  let waysGivenTrigger = 0;
  for (let j = 3; j <= 5; j++) {
    const p = base.scatterDist[j];
    triggerProb += p;
    scatterCoins += p * model.scatterPays[j - 3];
    featureCoins += p * feature.coins[j - 3];
    for (let k = 0; k < KMAX; k++) waysGivenTrigger += base.win[k][j];
  }
  const ways = base.meanWaysCoins / BET_COINS;
  const scatter = scatterCoins / BET_COINS;
  const feat = featureCoins / BET_COINS;
  const buyMean = (waysGivenTrigger + scatterCoins + featureCoins) / triggerProb / BET_COINS;
  return {
    base,
    free,
    feature,
    triggerProb,
    rtp: { ways, scatter, feature: feat, total: ways + scatter + feat },
    buy: {
      meanBets: buyMean,
      rtp: buyMean / model.buyPriceBets,
      entryDist: [3, 4, 5].map((j) => base.scatterDist[j] / triggerProb) as [number, number, number],
    },
    meanFeatureBets: featureCoins / triggerProb / BET_COINS,
  };
}
