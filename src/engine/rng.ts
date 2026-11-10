/**
 * Random number sources.
 *
 * The engine only ever asks for a uniform integer in [0, n). Every source
 * below produces it by rejection sampling over 32-bit words, so the result is
 * unbiased for any n (no modulo bias) and scaling is the only transformation
 * applied to the raw output.
 *
 * - CryptoRng: production source, backed by the platform CSPRNG
 *   (crypto.getRandomValues in browsers and Node). A test lab would certify
 *   the deployed RNG; this class is the integration point for it.
 * - SeededRng: deterministic xoshiro128** for simulation, tests and replay.
 *   Never used for real play.
 * - ScriptedRng: replays a fixed list of draws (used to force outcomes in
 *   tests and QA builds).
 */
export interface Rng {
  /** Uniform integer in [0, n). n must be an integer in [1, 2^32]. */
  nextInt(n: number): number;
}

const TWO_32 = 0x1_0000_0000;

function rejectionLimit(n: number): number {
  // Largest multiple of n that fits in 32 bits; words >= limit are rejected.
  return TWO_32 - (TWO_32 % n);
}

export class CryptoRng implements Rng {
  private readonly buf = new Uint32Array(64);
  private pos = this.buf.length;

  private word(): number {
    if (this.pos >= this.buf.length) {
      globalThis.crypto.getRandomValues(this.buf);
      this.pos = 0;
    }
    return this.buf[this.pos++];
  }

  nextInt(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32) throw new RangeError(`nextInt(${n})`);
    const limit = rejectionLimit(n);
    let w = this.word();
    while (w >= limit) w = this.word();
    return w % n;
  }
}

/** xoshiro128** (Blackman & Vigna), seeded through splitmix32. */
export class SeededRng implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    let s = seed >>> 0;
    const split = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = split();
    this.b = split();
    this.c = split();
    this.d = split();
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1;
  }

  private word(): number {
    const r = Math.imul(this.b, 5);
    const result = Math.imul((r << 7) | (r >>> 25), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = (this.d << 11) | (this.d >>> 21);
    return result;
  }

  nextInt(n: number): number {
    const limit = rejectionLimit(n);
    let w = this.word();
    while (w >= limit) w = this.word();
    return w % n;
  }
}

export class ScriptedRng implements Rng {
  private i = 0;
  constructor(
    private readonly draws: readonly number[],
    private readonly fallback?: Rng,
  ) {}

  nextInt(n: number): number {
    if (this.i < this.draws.length) {
      const v = this.draws[this.i++];
      if (v < 0 || v >= n) throw new RangeError(`Scripted draw ${v} out of range [0, ${n})`);
      return v;
    }
    if (this.fallback) return this.fallback.nextInt(n);
    throw new Error('ScriptedRng exhausted');
  }
}

/** Wraps a source and records every draw, for audit records. */
export class RecordingRng implements Rng {
  readonly draws: number[] = [];
  constructor(private readonly inner: Rng) {}
  nextInt(n: number): number {
    const v = this.inner.nextInt(n);
    this.draws.push(v);
    return v;
  }
}
