/** Reel spin / stop / landing animations (GSAP). Visual only. */
import gsap from 'gsap';
import type { SymbolId } from '../config/symbols';
import { visualFiller } from '../engine/reels';
import { symbolElement } from '../components/SymbolImage';
import { skipper } from './skip';

const ROWS = 4;

/**
 * Spin one reel: builds a strip [final(4) | filler(N) | current(4)], starts
 * showing `current`, winds up, accelerates, scrolls, then lands on `final`
 * with a small overshoot.
 */
export function spinReel(strip: HTMLElement, current: SymbolId[], final: SymbolId[], duration: number, anticipation: boolean): Promise<void> {
  const fillerCount = Math.max(6, Math.round(duration * 20));
  const filler = visualFiller(fillerCount);
  const symbols = [...final, ...filler, ...current];
  // Sharp art for the cells that start and end in view; pre-blurred art for the blur in between.
  strip.replaceChildren(...symbols.map((id, i) => symbolElement(id, i >= final.length + 1 && i < final.length + filler.length - 1)));
  const K = symbols.length;
  const cellPct = 100 / K; // yPercent of one cell relative to strip height
  const startY = -(K - ROWS) * cellPct;
  strip.style.height = `${(K / ROWS) * 100}%`;
  strip.style.display = 'block';
  if (anticipation) strip.classList.add('anticipate');

  // Continuous velocity profile so the reel never jerks between phases:
  //   wind-up → accelerate (quad in) → cruise (linear) → brake (quad out, overshooting) → settle.
  // With quad easing a phase covering distance d in time t starts/ends at speed 2d/t,
  // so we solve for one cruise speed v that all phases hand over at.
  const windUp = cellPct * 0.22;
  const overshoot = cellPct * 0.16;
  const from = startY - windUp; // bottom of the wind-up
  const travel = overshoot - from;
  const main = Math.max(0.3, duration - 0.1);
  const tAcc = Math.min(0.2, main * 0.22);
  const tBrake = Math.min(anticipation ? 0.75 : 0.34, main * 0.4);
  const v = travel / Math.max(0.1, main - (tAcc + tBrake) / 2);
  const dAcc = (v * tAcc) / 2;
  const dBrake = (v * tBrake) / 2;
  const tCruise = Math.max(0, (travel - dAcc - dBrake) / v);

  const tl = gsap.timeline();
  tl.set(strip, { yPercent: startY, force3D: true })
    .to(strip, { yPercent: from, duration: 0.1, ease: 'sine.out' })
    .to(strip, { yPercent: from + dAcc, duration: tAcc, ease: 'power2.in' })
    .to(strip, { yPercent: overshoot - dBrake, duration: tCruise, ease: 'none' })
    .to(strip, { yPercent: overshoot, duration: tBrake, ease: 'power2.out' })
    .to(strip, { yPercent: 0, duration: 0.16, ease: 'sine.inOut' });

  return skipper.play(tl).then(() => {
    strip.classList.remove('anticipate');
  });
}

/** Hide and empty a strip once the static cells underneath are committed. */
export function clearStrip(strip: HTMLElement) {
  strip.style.display = 'none';
  strip.replaceChildren();
}

/** Bounce the freshly landed static cells; heavier pop for special symbols. */
export function landReel(cells: (HTMLElement | null)[], heavy: boolean[]) {
  cells.forEach((c, i) => {
    if (!c) return;
    const img = c.querySelector('.sym-img, .sym-placeholder');
    if (!img) return;
    if (heavy[i]) {
      gsap.fromTo(img, { scale: 1.25, filter: 'brightness(1.8)' }, { scale: 1, filter: 'brightness(1)', duration: 0.5, ease: 'elastic.out(1, 0.45)' });
      c.classList.add('cell-landed-heavy');
      setTimeout(() => c.classList.remove('cell-landed-heavy'), 700);
    } else {
      // The strip already overshot and settled — just a soft squash so the stop feels weighty.
      gsap.fromTo(img, { scaleY: 0.94, scaleX: 1.04, transformOrigin: '50% 100%' }, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'back.out(3)' });
    }
  });
}

/** A short downward nudge of the whole reel column when it stops. */
export function thumpReel(reel: HTMLElement | null) {
  if (!reel) return;
  gsap.fromTo(reel, { y: 3 }, { y: 0, duration: 0.22, ease: 'power3.out', clearProps: 'transform' });
}

/** Reduced-motion alternative: a simple fade swap, no scrolling. */
export function fadeSwapReel(cells: (HTMLElement | null)[], delay: number, swap: () => void): Promise<void> {
  const els = cells.filter(Boolean) as HTMLElement[];
  const tl = gsap.timeline({ delay });
  tl.to(els, { opacity: 0.15, duration: 0.12 }).add(swap).to(els, { opacity: 1, duration: 0.15 });
  return skipper.play(tl);
}
