/** Win highlights, symbol transformations and counters. Visual only. */
import gsap from 'gsap';
import { SYMBOLS } from '../config/symbols';
import type { CellChange } from '../engine/types';
import { fx } from './fx';
import { skipper } from './skip';
import { audio } from '../audio/AudioManager';

/**
 * Transform cells with a light + distortion effect: the old symbol warps
 * away, `swap` is called to commit the new symbol, and the new one blooms in.
 */
export async function transformCells(
  items: { el: HTMLElement | null; change: CellChange }[],
  style: 'magic' | 'smoke' | 'wild',
  swap: (c: CellChange) => void,
): Promise<void> {
  if (!items.length) return;
  const color = style === 'smoke' ? '#9b4dff' : style === 'wild' ? '#c77dff' : '#7dff6a';
  const tl = gsap.timeline();
  items.forEach(({ el, change }, i) => {
    const at = i * 0.08;
    const target = () => el?.querySelector('.sym-img, .sym-placeholder') ?? null;
    tl.add(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (style === 'smoke') fx.smoke(r.left + r.width / 2, r.top + r.height / 2, '#6b2fb0', 6, r.width * 0.6);
      fx.sparkle(r.left, r.top, r.width, r.height, color, 10);
      el.classList.add('cell-transforming');
    }, at);
    tl.to(
      {},
      {
        duration: 0.28,
        onStart: () => {
          const t = target();
          if (t) gsap.to(t, { scaleX: 0.6, scaleY: 1.3, skewX: 12, filter: 'blur(3px) brightness(2.2) hue-rotate(60deg)', opacity: 0.2, duration: 0.28, ease: 'power2.in' });
        },
      },
      at,
    );
    tl.add(() => swap(change), at + 0.3);
    tl.add(() => {
      const t = target();
      if (t) gsap.fromTo(t, { scale: 1.45, skewX: -8, opacity: 0.3, filter: 'blur(2px) brightness(2.5)' }, { scale: 1, skewX: 0, scaleX: 1, scaleY: 1, opacity: 1, filter: 'blur(0px) brightness(1)', duration: 0.5, ease: 'back.out(2)' });
      el?.classList.remove('cell-transforming');
      if (change.to === 'wild') audio.play('wild_land', { volume: 0.6 });
    }, at + 0.34);
  });
  tl.to({}, { duration: 0.55 });
  await skipper.play(tl);
  // Ensure final visual state if skipped mid-way.
  items.forEach(({ el, change }) => {
    swap(change);
    el?.classList.remove('cell-transforming');
    const t = el?.querySelector('.sym-img, .sym-placeholder');
    if (t) gsap.set(t, { clearProps: 'all' });
  });
}

/** Pulse winning cells and emit sparks in the symbol's glow colour. */
export function celebrateCells(els: { el: HTMLElement | null; symbol: keyof typeof SYMBOLS }[], intensity = 1) {
  for (const { el, symbol } of els) {
    if (!el) continue;
    const img = el.querySelector('.sym-img, .sym-placeholder');
    if (img) gsap.fromTo(img, { scale: 1 }, { scale: 1.12, duration: 0.22, yoyo: true, repeat: 3, ease: 'sine.inOut' });
    const r = el.getBoundingClientRect();
    fx.sparkle(r.left, r.top, r.width, r.height, SYMBOLS[symbol].glow, Math.round(5 * intensity));
  }
}

/** Animate a number from → to, calling `onUpdate` each frame. Skippable. */
export function countUp(from: number, to: number, seconds: number, onUpdate: (v: number) => void): Promise<void> {
  const o = { v: from };
  let lastTick = 0;
  const tw = gsap.to(o, {
    v: to,
    duration: seconds,
    ease: 'power1.out',
    onUpdate: () => {
      onUpdate(Math.round(o.v));
      const now = performance.now();
      if (now - lastTick > 90) {
        lastTick = now;
        audio.play('coin', { volume: 0.25, rate: 0.9 + Math.random() * 0.3 });
      }
    },
  });
  return skipper.play(tw).then(() => onUpdate(to));
}
