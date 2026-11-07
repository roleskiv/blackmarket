/**
 * The black-market shop behind the reels: shelves of forbidden artifacts,
 * hanging lamps, hazy smoke and a large locked vault. Pure SVG/CSS so it
 * scales crisply on any screen.
 */
import { memo } from 'react';

const Jar = ({ x, y, c }: { x: number; y: number; c: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-9" y="-26" width="18" height="26" rx="4" fill={c} opacity="0.35" stroke="#c9a24a" strokeOpacity="0.4" />
    <rect x="-7" y="-31" width="14" height="5" rx="1" fill="#5b4320" />
    <circle cx="0" cy="-12" r="4" fill={c} opacity="0.7" />
  </g>
);
const Book = ({ x, y, h, c }: { x: number; y: number; h: number; c: string }) => (
  <rect x={x} y={y - h} width="7" height={h} fill={c} stroke="#000" strokeOpacity="0.5" />
);
const Skull = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} opacity="0.75">
    <path d="M-10 -6 C -10 -20 10 -20 10 -6 L 7 0 L -7 0 Z" fill="#cbbfa9" />
    <circle cx="-4" cy="-9" r="2.6" fill="#1a0f22" />
    <circle cx="4" cy="-9" r="2.6" fill="#1a0f22" />
  </g>
);

function Shelf({ x, y, w, seed }: { x: number; y: number; w: number; seed: number }) {
  const items: JSX.Element[] = [];
  let cx = x + 10;
  let i = seed;
  const colors = ['#7dff6a', '#b45cff', '#ff2d6f', '#f1d58a'];
  while (cx < x + w - 20) {
    const k = (i * 7) % 5;
    if (k === 0) items.push(<Jar key={cx} x={cx + 8} y={y} c={colors[i % 4]} />), (cx += 26);
    else if (k === 1) {
      for (let b = 0; b < 4; b++) items.push(<Book key={`${cx}-${b}`} x={cx + b * 8} y={y} h={18 + ((i + b) % 3) * 5} c={['#3b1f4f', '#5a1626', '#2c3b1f', '#4a3410'][(i + b) % 4]} />);
      cx += 38;
    } else if (k === 2) items.push(<Skull key={cx} x={cx + 10} y={y} />), (cx += 26);
    else if (k === 3) items.push(<circle key={cx} cx={cx + 9} cy={y - 9} r="8" fill={colors[(i + 1) % 4]} opacity="0.25" />), (cx += 24);
    else cx += 18;
    i++;
  }
  return (
    <g>
      {items}
      <rect x={x} y={y} width={w} height="7" fill="#2a1d10" />
      <rect x={x} y={y} width={w} height="2" fill="#c9a24a" opacity="0.35" />
    </g>
  );
}

export const Backdrop = memo(function Backdrop({ bonus }: { bonus: boolean }) {
  return (
    <div className={`backdrop ${bonus ? 'is-bonus' : ''}`} aria-hidden>
      <svg className="backdrop-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="bgGlow" cx="0.5" cy="0.45" r="0.7">
            <stop offset="0" stopColor="#2a1640" />
            <stop offset="0.55" stopColor="#120c19" />
            <stop offset="1" stopColor="#050407" />
          </radialGradient>
          <radialGradient id="lamp" cx="0.5" cy="0" r="1">
            <stop offset="0" stopColor="#ffb86b" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffb86b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vaultMetal" cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#5b5162" />
            <stop offset="0.6" stopColor="#2a2430" />
            <stop offset="1" stopColor="#120f16" />
          </radialGradient>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#120c18" />
            <stop offset="1" stopColor="#040306" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#bgGlow)" />
        {/* brick texture */}
        <g opacity="0.08" stroke="#c9a24a" strokeWidth="1">
          {Array.from({ length: 22 }).map((_, r) => (
            <line key={r} x1="0" x2="1600" y1={r * 40} y2={r * 40} />
          ))}
        </g>
        {/* left shelves */}
        <g opacity="0.9">
          <rect x="40" y="120" width="330" height="560" fill="#0c0910" stroke="#3a2a14" strokeWidth="6" />
          <Shelf x={46} y={240} w={318} seed={1} />
          <Shelf x={46} y={360} w={318} seed={4} />
          <Shelf x={46} y={480} w={318} seed={8} />
          <Shelf x={46} y={600} w={318} seed={13} />
        </g>
        {/* right shelves */}
        <g opacity="0.9">
          <rect x="1230" y="120" width="330" height="560" fill="#0c0910" stroke="#3a2a14" strokeWidth="6" />
          <Shelf x={1236} y={240} w={318} seed={3} />
          <Shelf x={1236} y={360} w={318} seed={6} />
          <Shelf x={1236} y={480} w={318} seed={11} />
          <Shelf x={1236} y={600} w={318} seed={17} />
        </g>
        {/* the vault, behind the reels */}
        <g className="bd-vault" transform="translate(800 420)">
          <circle r="330" fill="url(#vaultMetal)" stroke="#6e4f17" strokeWidth="14" opacity="0.55" />
          <circle r="300" fill="none" stroke="#c9a24a" strokeOpacity="0.25" strokeWidth="3" strokeDasharray="10 14" />
          {Array.from({ length: 12 }).map((_, i) => (
            <circle key={i} cx={Math.cos((i / 12) * Math.PI * 2) * 312} cy={Math.sin((i / 12) * Math.PI * 2) * 312} r="9" fill="#8a6a2a" opacity="0.6" />
          ))}
        </g>
        {/* hanging lamps */}
        {[300, 800, 1300].map((x, i) => (
          <g key={x} className={`bd-lamp lamp-${i}`}>
            <line x1={x} y1="0" x2={x} y2="70" stroke="#2a1d10" strokeWidth="3" />
            <path d={`M${x - 26} 92 L ${x - 14} 70 L ${x + 14} 70 L ${x + 26} 92 Z`} fill="#3a2a14" stroke="#c9a24a" strokeOpacity="0.5" />
            <ellipse cx={x} cy="96" rx="14" ry="5" fill="#ffcf8a" />
            <path d={`M${x - 26} 92 L ${x - 260} 900 L ${x + 260} 900 L ${x + 26} 92 Z`} fill="url(#lamp)" className="lamp-cone" />
          </g>
        ))}
        {/* counter / floor */}
        <rect y="760" width="1600" height="140" fill="url(#floor)" />
        <rect y="756" width="1600" height="4" fill="#c9a24a" opacity="0.25" />
        {/* neon sign */}
        <g className="bd-neon" transform="translate(1395 90)">
          <rect x="-110" y="-26" width="220" height="44" rx="6" fill="none" stroke="#ff2d6f" strokeWidth="3" />
          <text x="0" y="5" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="20" fill="#ff7aa2" letterSpacing="4">NO REFUNDS</text>
        </g>
        <g className="bd-neon violet" transform="translate(205 90)">
          <rect x="-90" y="-26" width="180" height="44" rx="6" fill="none" stroke="#b45cff" strokeWidth="3" />
          <text x="0" y="5" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="20" fill="#d9a6ff" letterSpacing="4">CURIOS</text>
        </g>
      </svg>
      <div className="smoke smoke-1" />
      <div className="smoke smoke-2" />
      <div className="vignette" />
    </div>
  );
});
