/**
 * Dealer's Vault cinematic: reels darken, camera pushes toward the vault,
 * three keys insert into the lock, doors swing open, golden light and violet
 * smoke spill out, then transition into free spins.
 */
import gsap from 'gsap';
import { fx, centerOf } from './fx';
import { skipper } from './skip';
import { audio } from '../audio/AudioManager';

export interface VaultEls {
  overlay: HTMLElement;
  stage: HTMLElement;
  vault: HTMLElement;
  keys: HTMLElement[];
  lock: HTMLElement;
  doorL: HTMLElement;
  doorR: HTMLElement;
  light: HTMLElement;
  title: HTMLElement;
}

export async function playVault(els: VaultEls, opts: { reducedMotion: boolean }) {
  const { overlay, stage, vault, keys, lock, doorL, doorR, light, title } = els;
  gsap.set(overlay, { display: 'flex', opacity: 0 });
  gsap.set(title, { opacity: 0, scale: 0.6 });
  gsap.set([doorL, doorR], { rotationY: 0 });
  gsap.set(light, { opacity: 0, scale: 0.4 });
  gsap.set(lock, { rotation: 0, opacity: 1, scale: 1 });

  if (opts.reducedMotion) {
    gsap.set(keys, { opacity: 0 });
    const tl = gsap.timeline();
    tl.to(overlay, { opacity: 1, duration: 0.25 })
      .set([doorL, doorR], { opacity: 0 })
      .set(light, { opacity: 1, scale: 1 })
      .to(title, { opacity: 1, scale: 1, duration: 0.25 })
      .to({}, { duration: 1.6 });
    audio.play('vault', { volume: 0.5 });
    await skipper.play(tl);
    gsap.set([doorL, doorR], { opacity: 1 });
    return;
  }

  const tl = gsap.timeline();
  tl.to(stage, { filter: 'brightness(0.35) saturate(0.6)', scale: 1.04, duration: 0.6 })
    .to(overlay, { opacity: 1, duration: 0.5 }, '<0.2')
    .fromTo(vault, { scale: 0.55, y: 60, opacity: 0.2 }, { scale: 1, y: 0, opacity: 1, duration: 1.0, ease: 'power2.inOut' }, '<')
    .add(() => audio.play('vault'));
  keys.forEach((key, i) => {
    tl.fromTo(
      key,
      { x: (i - 1) * 260, y: 320, rotation: (i - 1) * 40, opacity: 0, scale: 1.4 },
      { x: (i - 1) * 34, y: 0, rotation: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' },
      i === 0 ? '<' : '<0.45',
    ).add(() => {
      const c = centerOf(key);
      fx.burst(c.x, c.y, ['#f1d58a', '#ff2d6f'], 18, 0.6);
    });
  });
  tl.to(lock, { rotation: 180, duration: 0.6, ease: 'power2.inOut' })
    .to([...keys, lock], { opacity: 0, scale: 0.6, duration: 0.3 })
    .to(doorL, { rotationY: -105, duration: 1.1, ease: 'power2.inOut' })
    .to(doorR, { rotationY: 105, duration: 1.1, ease: 'power2.inOut' }, '<')
    .to(light, { opacity: 1, scale: 1.4, duration: 0.9, ease: 'power2.out' }, '<0.15')
    .add(() => {
      const c = centerOf(vault);
      fx.fountain(c.x, c.y + 40, ['#f1d58a', '#c9a24a', '#ffffff'], 90);
      fx.smoke(c.x, c.y + 60, '#6b2fb0', 26, 260);
      audio.play('transition');
    }, '<0.2')
    .to(title, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' })
    .to({}, { duration: 1.6 })
    .to(overlay, { opacity: 0, duration: 0.5 })
    .to(stage, { filter: 'none', scale: 1, duration: 0.5 }, '<');
  await skipper.play(tl);
  gsap.set(stage, { clearProps: 'filter,scale,transform' });
  gsap.set(overlay, { display: 'none' });
  gsap.set(keys, { clearProps: 'all' });
}
