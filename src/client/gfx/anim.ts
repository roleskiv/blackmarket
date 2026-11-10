/**
 * Minimal promise-based animation scheduler driven by the render ticker.
 *
 * Presentation code is written as plain async functions:
 *     await anim.tween(sprite, { alpha: 1 }, 200);
 *     await anim.wait(300);
 * Setting `fast` makes every running and future tween/wait finish on the
 * next tick, which is how "skip" works: the sequence still runs to its end
 * in order, it just takes no time.
 */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
};

interface Job {
  elapsed: number;
  duration: number;
  step: (t: number) => void;
  done: () => void;
  /** Background jobs (ambient loops) ignore `fast` and are not awaited. */
  background: boolean;
}

export class Animator {
  private jobs = new Set<Job>();
  /** Finish everything immediately while true. */
  fast = false;
  /** Global time scale for presentation (turbo). */
  rate = 1;

  update(dtMs: number): void {
    for (const job of [...this.jobs]) {
      if (!this.jobs.has(job)) continue;
      job.elapsed += job.background ? dtMs : dtMs * this.rate;
      const finish = (this.fast && !job.background) || job.elapsed >= job.duration;
      job.step(finish ? 1 : job.elapsed / job.duration);
      if (finish) {
        this.jobs.delete(job);
        job.done();
      }
    }
  }

  /** Runs `step(t)` with t going 0 → 1 over `ms`. */
  run(ms: number, step: (t: number) => void, background = false): Promise<void> {
    return new Promise((resolve) => {
      if (ms <= 0) {
        step(1);
        resolve();
        return;
      }
      this.jobs.add({ elapsed: 0, duration: ms, step, done: resolve, background });
    });
  }

  wait(ms: number): Promise<void> {
    return this.run(ms, () => undefined);
  }

  /** Tweens numeric properties of `target` to the given values. */
  tween<T extends object>(target: T, to: Partial<Record<keyof T, number>>, ms: number, e: Ease = ease.outCubic): Promise<void> {
    const keys = Object.keys(to) as Array<keyof T>;
    const from = keys.map((k) => target[k] as unknown as number);
    return this.run(ms, (t) => {
      const k = e(t);
      keys.forEach((key, i) => {
        (target[key] as unknown as number) = from[i] + ((to[key] as number) - from[i]) * k;
      });
    });
  }

  /** Repeating background animation; returns a stop function. */
  loop(periodMs: number, step: (t: number) => void): () => void {
    let stopped = false;
    const again = () => {
      if (stopped) return;
      void this.run(periodMs, step, true).then(again);
    };
    again();
    return () => {
      stopped = true;
    };
  }
}
