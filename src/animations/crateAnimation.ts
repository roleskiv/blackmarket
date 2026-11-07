/**
 * Black Market Crate cinematic, in two parts around the player's pick:
 *
 *  introCrates  — dim → three crates rise into the light and wait.
 *  openCrate    — the picked crate lifts to centre, shakes with light leaking
 *                 through its cracks, bursts open and reveals its effect; the
 *                 other two crack open to show what the player passed on.
 *  closeCrates  — return to the reels.
 *
 * Visual only; all three crates were filled by the engine before the pick.
 */
import gsap from 'gsap';
import { fx, centerOf } from './fx';
import { skipper } from './skip';
import { audio } from '../audio/AudioManager';

const parts = (overlay: HTMLElement) => {
  const slots = Array.from(overlay.querySelectorAll<HTMLElement>('[data-part="slot"]'));
  return {
    slots,
    prompt: overlay.querySelector<HTMLElement>('[data-part="prompt"]')!,
    card: overlay.querySelector<HTMLElement>('[data-part="card"]')!,
    crate: (i: number) => slots[i].querySelector<HTMLElement>('[data-part="crate"]')!,
    lid: (i: number) => slots[i].querySelector<HTMLElement>('[data-part="lid"]')!,
    light: (i: number) => slots[i].querySelector<HTMLElement>('[data-part="light"]')!,
  };
};

export async function introCrates(overlay: HTMLElement, opts: { reducedMotion: boolean }) {
  const p = parts(overlay);
  gsap.set(overlay, { display: 'flex', opacity: 0 });
  gsap.set(p.card, { opacity: 0, scale: 0.6, y: 30, rotationX: 50 });
  gsap.set(p.slots, { clearProps: 'all' });
  p.slots.forEach((_, i) => {
    gsap.set(p.lid(i), { clearProps: 'all' });
    gsap.set(p.light(i), { opacity: 0 });
    gsap.set(p.crate(i), { clearProps: 'all' });
  });
  const tl = gsap.timeline();
  tl.to(overlay, { opacity: 1, duration: opts.reducedMotion ? 0.15 : 0.35 });
  if (!opts.reducedMotion) {
    tl.from(p.slots, { y: 220, opacity: 0, rotation: (i) => (i - 1) * 8, duration: 0.6, ease: 'back.out(1.5)', stagger: 0.12 }, '<0.1');
    tl.from(p.prompt, { y: -20, opacity: 0, duration: 0.4 }, '<0.2');
  }
  audio.play('dealer', { volume: 0.6 });
  await skipper.play(tl);
}

export async function openCrate(overlay: HTMLElement, pick: number, opts: { reducedMotion: boolean; turbo: boolean; color: string }) {
  const p = parts(overlay);
  const k = opts.turbo ? 0.6 : 1;
  const chosen = p.slots[pick];
  const others = p.slots.filter((_, i) => i !== pick);
  const row = overlay.querySelector<HTMLElement>('[data-part="row"]')!;
  const dx = centerOf(row).x - centerOf(chosen).x;

  if (opts.reducedMotion) {
    const tl = gsap.timeline();
    tl.to(others, { opacity: 0.55, duration: 0.15 })
      .set(p.lid(pick), { opacity: 0 })
      .to(p.card, { opacity: 1, scale: 1, y: 0, rotationX: 0, duration: 0.2 })
      .to({}, { duration: 1.6 });
    audio.play('crate_open', { volume: 0.6 });
    await skipper.play(tl);
    return;
  }

  const tl = gsap.timeline();
  tl.to(others, { opacity: 0.45, scale: 0.8, y: 40, duration: 0.4 * k }, 0)
    .to(chosen, { x: dx, scale: 1.2, y: -10, zIndex: 3, duration: 0.5 * k, ease: 'power2.out' }, 0)
    .add(() => audio.play('crate_shake'))
    .to(p.light(pick), { opacity: 0.6, duration: 0.3 * k })
    .to(p.crate(pick), { keyframes: { x: [0, -7, 7, -9, 9, -6, 6, -3, 3, 0], rotation: [0, -2, 2, -3, 3, -2, 2, 0] }, duration: 0.9 * k, ease: 'none' }, '<')
    .to(p.light(pick), { opacity: 1, duration: 0.5 * k }, '<0.4')
    .add(() => {
      audio.play('crate_open');
      const c = centerOf(p.crate(pick));
      fx.burst(c.x, c.y - 30, [opts.color, '#f1d58a', '#ffffff', '#b45cff'], 110, 1.2);
      fx.smoke(c.x, c.y - 20, '#5a2a8a', 18, 160);
    })
    .to(p.lid(pick), { y: -140, rotation: -24, opacity: 0, duration: 0.5 * k, ease: 'power3.out' })
    .to(p.crate(pick), { scale: 0.85, y: 50, opacity: 0.35, duration: 0.5 * k }, '<')
    .to(p.card, { opacity: 1, scale: 1, y: -10, rotationX: 0, duration: 0.6 * k, ease: 'back.out(1.8)' }, '<0.1')
    // The other two crack open to show what was inside.
    .to(others.map((_, j) => p.lid(p.slots.indexOf(others[j]))), { y: -40, rotation: 14, opacity: 0, duration: 0.4 * k, stagger: 0.15 }, '+=0.2')
    .to({}, { duration: 1.6 * k });
  await skipper.play(tl);
}

export async function closeCrates(overlay: HTMLElement, opts: { reducedMotion: boolean }) {
  const tl = gsap.timeline();
  tl.to(overlay, { opacity: 0, duration: opts.reducedMotion ? 0.15 : 0.35 });
  await skipper.play(tl);
  gsap.set(overlay, { display: 'none' });
}
