/**
 * Black Market Crate cinematic:
 *  dim → dealer leans → crate lifts to foreground → shakes with light leaking
 *  through cracks → bursts open → reveals effect card → returns to reels.
 * Visual only; the effect itself was already resolved by the engine.
 */
import gsap from 'gsap';
import { fx, centerOf } from './fx';
import { skipper } from './skip';
import { audio } from '../audio/AudioManager';

export interface CrateEls {
  overlay: HTMLElement;
  crate: HTMLElement;
  lid: HTMLElement;
  light: HTMLElement;
  card: HTMLElement;
}

export async function playCrate(els: CrateEls, opts: { reducedMotion: boolean; turbo: boolean; color: string }) {
  const { overlay, crate, lid, light, card } = els;
  const k = opts.turbo ? 0.6 : 1;
  gsap.set(overlay, { display: 'flex' });
  gsap.set(card, { opacity: 0, scale: 0.6, y: 30, rotationX: 50 });
  gsap.set(lid, { y: 0, rotation: 0, opacity: 1 });
  gsap.set(light, { opacity: 0 });

  if (opts.reducedMotion) {
    const tl = gsap.timeline();
    tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2 })
      .set(crate, { opacity: 0 })
      .to(card, { opacity: 1, scale: 1, y: 0, rotationX: 0, duration: 0.2 })
      .to({}, { duration: 1.4 })
      .to(overlay, { opacity: 0, duration: 0.2 });
    audio.play('crate_open', { volume: 0.6 });
    await skipper.play(tl);
    gsap.set(overlay, { display: 'none' });
    gsap.set(crate, { opacity: 1 });
    return;
  }

  const tl = gsap.timeline();
  tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.35 * k })
    .fromTo(crate, { y: 260, scale: 0.45, rotation: -8, opacity: 0 }, { y: 0, scale: 1, rotation: 0, opacity: 1, duration: 0.7 * k, ease: 'back.out(1.4)' }, '<0.1')
    .add(() => audio.play('crate_shake'))
    .to(light, { opacity: 0.6, duration: 0.3 * k })
    .to(crate, { keyframes: { x: [0, -7, 7, -9, 9, -6, 6, -3, 3, 0], rotation: [0, -2, 2, -3, 3, -2, 2, 0] }, duration: 1.0 * k, ease: 'none' }, '<')
    .to(light, { opacity: 1, duration: 0.6 * k }, '<0.4')
    .add(() => {
      audio.play('crate_open');
      const c = centerOf(crate);
      fx.burst(c.x, c.y - 30, [opts.color, '#f1d58a', '#ffffff', '#b45cff'], 110, 1.2);
      fx.smoke(c.x, c.y - 20, '#5a2a8a', 18, 160);
    })
    .to(lid, { y: -140, rotation: -24, opacity: 0, duration: 0.5 * k, ease: 'power3.out' })
    .to(crate, { scale: 0.85, y: 70, opacity: 0.35, duration: 0.5 * k }, '<')
    .to(card, { opacity: 1, scale: 1, y: -10, rotationX: 0, duration: 0.6 * k, ease: 'back.out(1.8)' }, '<0.1')
    .to({}, { duration: 1.5 * k })
    .to(overlay, { opacity: 0, duration: 0.35 * k });
  await skipper.play(tl);
  gsap.set(overlay, { display: 'none' });
  gsap.set(crate, { clearProps: 'all' });
}
