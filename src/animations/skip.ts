/**
 * Skip controller for long presentation sequences.
 * Anything awaited through `play()` / `wait()` resolves immediately when the
 * player skips. Skipping only fast-forwards presentation — outcomes were
 * already resolved and settled by the engine before any animation began.
 */

type Listener = () => void;
interface Playable {
  progress(value: number): unknown;
  eventCallback(type: 'onComplete', cb: () => void): unknown;
}

class SkipController {
  private listeners = new Set<Listener>();
  private skipping = false;

  /** Request a skip of everything currently running (and anything started in this sequence). */
  skip() {
    this.skipping = true;
    for (const l of [...this.listeners]) l();
  }
  /** Call at the start of a new sequence (e.g. a new spin). */
  reset() {
    this.skipping = false;
  }
  get active() {
    return this.skipping;
  }

  /** Await a GSAP timeline/tween, fast-forwarding it on skip. */
  play(tl: Playable): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.listeners.delete(onSkip);
        resolve();
      };
      const onSkip = () => {
        tl.progress(1);
        done();
      };
      if (this.skipping) return onSkip();
      this.listeners.add(onSkip);
      tl.eventCallback('onComplete', done);
    });
  }

  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.skipping || seconds <= 0) return resolve();
      const id = setTimeout(() => {
        this.listeners.delete(onSkip);
        resolve();
      }, seconds * 1000);
      const onSkip = () => {
        clearTimeout(id);
        this.listeners.delete(onSkip);
        resolve();
      };
      this.listeners.add(onSkip);
    });
  }
}

export const skipper = new SkipController();
