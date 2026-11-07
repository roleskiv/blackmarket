/**
 * Dealer's Hand cinematic: the dealer raises a gloved hand wreathed in violet
 * smoke, a card appears between the fingers, the hand reaches across the stage
 * and points at the chosen reel. Outcome was resolved by the engine already.
 */
import gsap from 'gsap';
import type { DealerHandle } from '../components/Dealer';
import { fx, centerOf } from './fx';
import { skipper } from './skip';
import { audio } from '../audio/AudioManager';

export interface HandEls {
  hand: HTMLElement;
  card: HTMLElement;
  reel: HTMLElement;
  dim: HTMLElement;
}

export async function playDealerHand(dealer: DealerHandle | null, els: HandEls, opts: { reducedMotion: boolean; turbo: boolean }) {
  const { hand, card, reel, dim } = els;
  const k = opts.turbo ? 0.6 : 1;
  const target = reel.getBoundingClientRect();
  gsap.set(hand, { display: 'block', opacity: 0, x: 0, y: 0, rotation: 0, scale: 1 });
  const handBox = hand.getBoundingClientRect();
  // Pointing fingertip sits at ~(92%, 42%) of the hand graphic.
  const tx = target.left + target.width / 2 - handBox.width * 0.92;
  const ty = target.top + target.height * 0.5 - handBox.height * 0.42;

  audio.play('dealer');
  if (opts.reducedMotion) {
    const tl = gsap.timeline();
    tl.set(hand, { x: tx, y: ty, opacity: 0, display: 'block' })
      .set(card, { opacity: 1 })
      .to(hand, { opacity: 1, duration: 0.2 })
      .to({}, { duration: 0.6 })
      .add(() => reel.classList.add('reel-targeted'))
      .to(hand, { opacity: 0, duration: 0.2, delay: 0.4 })
      .set(hand, { display: 'none' });
    await skipper.play(tl);
    return () => reel.classList.remove('reel-targeted');
  }

  dealer?.lean();
  const tl = gsap.timeline();
  tl.set(hand, { display: 'block', x: -handBox.width, y: window.innerHeight * 0.55, rotation: 25, scale: 0.8, opacity: 0 })
    .set(card, { opacity: 0, scale: 0.2, rotation: -30 })
    .to(dim, { opacity: 1, duration: 0.3 * k })
    .add(dealer ? dealer.raiseHand() : gsap.timeline(), 0)
    .add(() => dealer?.eyeFlare(1.2), 0)
    .add(() => {
      const p = dealer?.handTip();
      if (p && p.x) fx.smoke(p.x, p.y, '#7a3cc0', 16, 70);
    }, 0.3 * k)
    .to(hand, { opacity: 1, x: tx - 120, y: ty + 80, rotation: 10, scale: 1, duration: 0.6 * k, ease: 'power2.out' }, 0.35 * k)
    .add(() => {
      const c = centerOf(card);
      fx.smoke(c.x, c.y, '#8e44d8', 12, 80);
      audio.play('magic', { volume: 0.7 });
    })
    .to(card, { opacity: 1, scale: 1, rotation: 0, duration: 0.4 * k, ease: 'back.out(2)' })
    .to(hand, { x: tx, y: ty, rotation: -4, duration: 0.45 * k, ease: 'power3.inOut' }, '+=0.15')
    .add(() => {
      reel.classList.add('reel-targeted');
      const r = reel.getBoundingClientRect();
      fx.sparkle(r.left, r.top, r.width, r.height, '#c77dff', 24);
    })
    .to({}, { duration: 0.45 * k });
  await skipper.play(tl);

  return async () => {
    const out = gsap.timeline();
    out.to(hand, { x: -handBox.width, y: window.innerHeight * 0.6, rotation: 30, opacity: 0, duration: 0.5 * k, ease: 'power2.in' })
      .to(dim, { opacity: 0, duration: 0.3 * k }, '<')
      .add(dealer ? dealer.lowerHand() : gsap.timeline(), 0)
      .add(dealer ? dealer.settle() : gsap.timeline(), 0)
      .set(hand, { display: 'none' });
    reel.classList.remove('reel-targeted');
    await skipper.play(out);
  };
}
