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

  const tl = gsap.timeline();
  tl.set(strip, { yPercent: startY })
    .to(strip, { yPercent: startY - cellPct * 0.35, duration: 0.12, ease: 'power1.out' })
    .add(() => strip.classList.add('blur'))
    .to(strip, { yPercent: -cellPct * 1.2, duration: Math.max(0.2, duration - 0.3), ease: 'power1.in' })
    .add(() => strip.classList.remove('blur'))
    .to(strip, { yPercent: 0, duration: 0.28, ease: 'back.out(2.2)' });

  return skipper.play(tl).then(() => {
    strip.classList.remove('blur', 'anticipate');
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
      gsap.fromTo(img, { y: -10 }, { y: 0, duration: 0.35, ease: 'bounce.out' });
    }
  });
}

/** Reduced-motion alternative: a simple fade swap, no scrolling. */
export function fadeSwapReel(cells: (HTMLElement | null)[], delay: number, swap: () => void): Promise<void> {
  const els = cells.filter(Boolean) as HTMLElement[];
  const tl = gsap.timeline({ delay });
  tl.to(els, { opacity: 0.15, duration: 0.12 }).add(swap).to(els, { opacity: 1, duration: 0.15 });
  return skipper.play(tl);
}
