/**
 * Travel between the market board and the vault board.
 * The camera pushes into the reels, an iris closes to black, the board swaps
 * (via `swap`), then the iris opens on the new board, which drops in on its chains.
 */
import gsap from 'gsap';
import { skipper } from './skip';
import { audio } from '../audio/AudioManager';
import { fx, centerOf } from './fx';

export interface TravelEls {
  overlay: HTMLElement;
  title: HTMLElement;
  stage: HTMLElement;
  /** Looked up after the swap, since the board may re-render. */
  board: () => HTMLElement | null;
}

export async function travelBoard(els: TravelEls, swap: () => void, opts: { to: 'vault' | 'market'; reducedMotion: boolean; label: string }) {
  const { overlay, title, stage } = els;
  title.textContent = opts.label;
  gsap.set(overlay, { display: 'block', clipPath: 'circle(150% at 50% 45%)', opacity: opts.reducedMotion ? 0 : 1 });

  if (opts.reducedMotion) {
    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.25 }).add(swap).to({}, { duration: 0.1 }).to(overlay, { opacity: 0, duration: 0.25 });
    await skipper.play(tl);
    gsap.set(overlay, { display: 'none', clearProps: 'clipPath,opacity' });
    return;
  }

  const into = opts.to === 'vault';
  // 1. Push in and close the iris.
  gsap.set(overlay, { clipPath: 'circle(0% at 50% 45%)' });
  const out = gsap.timeline();
  out
    .add(() => audio.play('transition', { volume: 0.8 }))
    .to(stage, { scale: into ? 1.25 : 0.85, filter: 'brightness(0.5)', duration: 0.55, ease: 'power2.in' })
    .to(overlay, { clipPath: 'circle(75% at 50% 45%)', duration: 0.55, ease: 'power2.in' }, '<0.05')
    .to(title, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '-=0.1');
  await skipper.play(out);
  swap();
  gsap.set(stage, { scale: 1, filter: 'none' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // 2. Open the iris on the new board, which drops in and settles.
  const board = els.board();
  const back = gsap.timeline();
  back
    .to({}, { duration: 0.35 })
    .to(title, { opacity: 0, duration: 0.25 })
    .to(overlay, { clipPath: 'circle(0% at 50% 45%)', duration: 0.6, ease: 'power2.out' }, '<0.05')
    .add(() => {
      if (!board) return;
      gsap.fromTo(board, { y: into ? -window.innerHeight * 0.6 : window.innerHeight * 0.4, rotation: into ? -2 : 0 }, { y: 0, rotation: 0, duration: 0.7, ease: 'back.out(1.4)', clearProps: 'transform' });
    }, '<')
    .add(() => {
      audio.play('reel_stop', { volume: 0.9, rate: 0.7 });
      if (board) {
        gsap.fromTo(stage, { y: 6 }, { y: 0, duration: 0.35, ease: 'power3.out', clearProps: 'transform' });
        const c = centerOf(board);
        fx.burst(c.x, c.y - board.getBoundingClientRect().height / 2, into ? ['#f1d58a', '#ff2d4a'] : ['#f1d58a', '#b45cff'], 40, 0.8);
      }
    }, '+=0.05');
  await skipper.play(back);
  gsap.set(overlay, { display: 'none' });
  gsap.set(title, { opacity: 0 });
  if (board) gsap.set(board, { clearProps: 'transform' });
}
