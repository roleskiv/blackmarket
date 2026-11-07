import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import gsap from 'gsap';

/**
 * THE DEALER — original character, drawn as layered SVG so every part can be
 * animated independently with GSAP (breathing, leaning, eye flare, hand raise).
 */
export interface DealerHandle {
  lean(): gsap.core.Timeline;
  settle(): gsap.core.Timeline;
  raiseHand(): gsap.core.Timeline;
  lowerHand(): gsap.core.Timeline;
  eyeFlare(intensity?: number): gsap.core.Timeline;
  react(kind: 'win' | 'big' | 'tease'): void;
  handTip(): { x: number; y: number };
}

export const Dealer = forwardRef<DealerHandle, { reducedMotion: boolean; compact?: boolean }>(function Dealer(
  { reducedMotion, compact },
  ref,
) {
  const root = useRef<SVGGElement>(null);
  const head = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const arm = useRef<SVGGElement>(null);
  const tip = useRef<SVGCircleElement>(null);
  const breath = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    breath.current = gsap.to(root.current, {
      scaleY: 1.012,
      y: -2,
      transformOrigin: '50% 100%',
      duration: 2.6,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
    const blink = gsap.timeline({ repeat: -1, repeatDelay: 3.5 });
    blink.to(eyes.current, { scaleY: 0.1, transformOrigin: '50% 50%', duration: 0.07 }).to(eyes.current, { scaleY: 1, duration: 0.1 });
    const sway = gsap.to(head.current, { rotation: 1.5, transformOrigin: '50% 90%', duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    return () => {
      breath.current?.kill();
      blink.kill();
      sway.kill();
    };
  }, [reducedMotion]);

  useImperativeHandle(ref, () => ({
    lean() {
      const tl = gsap.timeline();
      tl.to(root.current, { rotation: -4, x: -14, y: 6, scale: 1.04, transformOrigin: '50% 100%', duration: reducedMotion ? 0.01 : 0.5, ease: 'power2.out' }, 0);
      tl.to(head.current, { rotation: -7, y: 6, transformOrigin: '50% 90%', duration: reducedMotion ? 0.01 : 0.5, ease: 'power2.out' }, 0);
      return tl;
    },
    settle() {
      const tl = gsap.timeline();
      tl.to(root.current, { rotation: 0, x: 0, y: 0, scale: 1, duration: reducedMotion ? 0.01 : 0.6, ease: 'power2.inOut' }, 0);
      tl.to(head.current, { rotation: 0, y: 0, duration: reducedMotion ? 0.01 : 0.6, ease: 'power2.inOut' }, 0);
      return tl;
    },
    raiseHand() {
      return gsap.timeline().to(arm.current, { rotation: -38, x: 10, y: -30, transformOrigin: '20% 20%', duration: reducedMotion ? 0.01 : 0.55, ease: 'back.out(1.6)' });
    },
    lowerHand() {
      return gsap.timeline().to(arm.current, { rotation: 0, x: 0, y: 0, duration: reducedMotion ? 0.01 : 0.5, ease: 'power2.inOut' });
    },
    eyeFlare(intensity = 1) {
      const tl = gsap.timeline();
      tl.to(eyes.current, { filter: `drop-shadow(0 0 ${6 + 10 * intensity}px #c77dff) brightness(${1.4 + intensity})`, duration: 0.25 })
        .to(eyes.current, { filter: 'drop-shadow(0 0 4px #b45cff) brightness(1)', duration: 0.8, delay: 0.4 });
      return tl;
    },
    react(kind) {
      if (reducedMotion) return;
      if (kind === 'big') {
        gsap.timeline()
          .to(root.current, { y: -8, scale: 1.03, transformOrigin: '50% 100%', duration: 0.25, ease: 'power2.out' })
          .to(root.current, { y: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
      } else if (kind === 'win') {
        gsap.timeline().to(head.current, { rotation: -6, duration: 0.2 }).to(head.current, { rotation: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' });
      } else {
        gsap.timeline().to(head.current, { x: 4, duration: 0.08, yoyo: true, repeat: 3 });
      }
      this.eyeFlare(kind === 'big' ? 1.5 : 0.6);
    },
    handTip() {
      const r = tip.current?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
    },
  }));

  return (
    <svg viewBox="0 0 320 480" className={`dealer-svg ${compact ? 'compact' : ''}`} aria-label="The Dealer" role="img">
      <defs>
        <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d1a24" />
          <stop offset="0.55" stopColor="#0d0b12" />
          <stop offset="1" stopColor="#050407" />
        </linearGradient>
        <linearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2233" />
          <stop offset="1" stopColor="#0a080d" />
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dd94" />
          <stop offset="0.5" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#6e4f17" />
        </linearGradient>
        <linearGradient id="mask" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2e8d8" />
          <stop offset="0.6" stopColor="#cdbfa8" />
          <stop offset="1" stopColor="#8d7f6c" />
        </linearGradient>
        <radialGradient id="eyeGlow">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#d9a6ff" />
          <stop offset="1" stopColor="#7b2cbf" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rim" cx="0.8" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#b45cff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#b45cff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Mirrored so the animated (raising) arm is the one nearest the reels. */}
      <g transform="translate(320 0) scale(-1 1)">
      <g ref={root}>
        {/* Coat body */}
        <path d="M60 470 C 55 360 70 260 110 215 L 210 215 C 250 260 268 360 262 470 Z" fill="url(#coat)" />
        <path d="M60 470 C 55 360 70 260 110 215 L 210 215 C 250 260 268 360 262 470 Z" fill="url(#rim)" />
        {/* Lapels with gold trim */}
        <path d="M118 220 L 160 330 L 202 220 L 188 214 L 160 290 L 132 214 Z" fill="#141119" stroke="url(#gold)" strokeWidth="3" />
        <path d="M160 330 L 160 470" stroke="url(#gold)" strokeWidth="2.5" />
        {[350, 385, 420].map((y) => (
          <circle key={y} cx="160" cy={y} r="5" fill="url(#gold)" />
        ))}
        {/* Gold chain across the chest */}
        <path d="M122 300 Q 160 335 198 300" fill="none" stroke="url(#gold)" strokeWidth="2" strokeDasharray="4 3" />
        <circle cx="160" cy="318" r="7" fill="none" stroke="url(#gold)" strokeWidth="2" />
        {/* Hem trim */}
        <path d="M62 455 C 120 462 200 462 260 455" fill="none" stroke="url(#gold)" strokeWidth="2" opacity="0.7" />

        {/* Resting arm (right side of image) */}
        <path d="M222 240 C 252 280 258 340 236 382 L 214 378 C 226 340 222 300 204 262 Z" fill="#0f0d14" />
        <path d="M214 376 L 238 384" stroke="url(#gold)" strokeWidth="3" />
        <ellipse cx="226" cy="396" rx="20" ry="15" fill="#121016" />
        <circle cx="236" cy="393" r="3.2" fill="url(#gold)" />

        {/* Raising arm (left side of image) with gloved hand */}
        <g ref={arm}>
          <path d="M100 240 C 70 280 64 330 82 372 L 104 370 C 94 330 100 296 118 262 Z" fill="#0f0d14" />
          <path d="M80 368 L 106 374" stroke="url(#gold)" strokeWidth="3" />
          <g transform="translate(92 392)">
            <path d="M-18 -10 C -22 6 -14 22 0 24 C 14 24 20 10 18 -8 Z" fill="#121016" />
            <path d="M-12 -8 L -16 -30 M -4 -10 L -6 -36 M 4 -10 L 6 -34 M 12 -6 L 16 -26" stroke="#121016" strokeWidth="7" strokeLinecap="round" />
            <circle cx="-4" cy="-14" r="3" fill="url(#gold)" />
            <circle ref={tip} cx="-6" cy="-38" r="2" fill="transparent" />
          </g>
        </g>

        {/* Head: hood + mask */}
        <g ref={head}>
          <path d="M92 220 C 70 140 98 50 160 40 C 222 50 250 140 228 220 C 210 238 110 238 92 220 Z" fill="url(#hood)" />
          <path d="M92 220 C 70 140 98 50 160 40 C 222 50 250 140 228 220" fill="none" stroke="url(#gold)" strokeWidth="2.5" opacity="0.8" />
          {/* inner shadow of hood */}
          <path d="M112 210 C 100 150 118 85 160 78 C 202 85 220 150 208 210 Z" fill="#050407" />
          {/* Mask */}
          <path d="M126 118 C 128 96 146 88 160 88 C 174 88 192 96 194 118 C 196 150 186 176 170 200 L 160 214 L 150 200 C 134 176 124 150 126 118 Z" fill="url(#mask)" />
          {/* Mask gold filigree & stitched seam */}
          <path d="M160 92 L 160 126" stroke="url(#gold)" strokeWidth="2" />
          <path d="M136 108 Q 160 98 184 108" fill="none" stroke="url(#gold)" strokeWidth="1.8" />
          <path d="M150 168 L 170 168" stroke="#5a4c3d" strokeWidth="1.5" />
          {[152, 157, 162, 167].map((x) => (
            <path key={x} d={`M${x} 164 L ${x + 1} 172`} stroke="#5a4c3d" strokeWidth="1.3" />
          ))}
          {/* Eye sockets */}
          <path d="M134 132 Q 146 122 155 134 Q 145 140 134 132 Z" fill="#120a19" />
          <path d="M186 132 Q 174 122 165 134 Q 175 140 186 132 Z" fill="#120a19" />
          <g ref={eyes} className="dealer-eyes">
            <circle cx="145" cy="132" r="9" fill="url(#eyeGlow)" />
            <circle cx="175" cy="132" r="9" fill="url(#eyeGlow)" />
            <circle cx="145" cy="132" r="2.4" fill="#fff" />
            <circle cx="175" cy="132" r="2.4" fill="#fff" />
          </g>
          {/* Gem on brow */}
          <path d="M160 100 L 165 108 L 160 116 L 155 108 Z" fill="#b45cff" stroke="url(#gold)" strokeWidth="1" />
        </g>
      </g>
      </g>
    </svg>
  );
});
