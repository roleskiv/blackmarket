/**
 * The bonus board's world: inside the Dealer's Vault. A giant open vault door
 * behind the reels, piles of gold and contraband, red security lamps.
 */
import { memo } from 'react';

const Coin = ({ x, y, r = 9 }: { x: number; y: number; r?: number }) => (
  <ellipse cx={x} cy={y} rx={r} ry={r * 0.45} fill="#e1b85a" stroke="#7a5a1e" strokeWidth="1.5" />
);

function Pile({ x, y, w, seed }: { x: number; y: number; w: number; seed: number }) {
  const coins: JSX.Element[] = [];
  let k = seed;
  for (let row = 0; row < 7; row++) {
    const span = w * (1 - row / 8);
    for (let i = 0; i < 9 - row; i++) {
      k = (k * 9301 + 49297) % 233280;
      const cx = x + (i / Math.max(1, 8 - row) - 0.5) * span + ((k % 7) - 3);
      coins.push(<Coin key={`${row}-${i}`} x={cx} y={y - row * 9 - (k % 4)} r={8 + (k % 4)} />);
    }
  }
  return <g>{coins}</g>;
}

export const VaultBackdrop = memo(function VaultBackdrop() {
  return (
    <svg className="backdrop-svg vault-bd" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="vbGlow" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#5a1630" />
          <stop offset="0.45" stopColor="#24091a" />
          <stop offset="1" stopColor="#060205" />
        </radialGradient>
        <radialGradient id="vbDoor" cx="0.42" cy="0.38" r="0.8">
          <stop offset="0" stopColor="#7d7484" />
          <stop offset="0.55" stopColor="#38303f" />
          <stop offset="1" stopColor="#141017" />
        </radialGradient>
        <radialGradient id="vbGold" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe7a8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb84a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vbWall" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1c1218" />
          <stop offset="0.5" stopColor="#2a1a22" />
          <stop offset="1" stopColor="#1c1218" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#vbGlow)" />
      {/* steel wall panels */}
      <g opacity="0.35" stroke="#9fb4c8" strokeOpacity="0.25">
        {Array.from({ length: 9 }).map((_, i) => (
          <rect key={i} x={i * 180 - 10} y="40" width="170" height="700" fill="url(#vbWall)" />
        ))}
      </g>
      {/* rivets */}
      <g fill="#c9a24a" opacity="0.35">
        {Array.from({ length: 9 }).flatMap((_, i) => [60, 400, 720].map((y) => <circle key={`${i}-${y}`} cx={i * 180 + 75} cy={y} r="5" />))}
      </g>
      {/* the open vault door, swung to the left, and the round opening behind the reels */}
      <g transform="translate(800 410)">
        <circle r="360" fill="#0b0508" stroke="#6e4f17" strokeWidth="18" />
        <circle r="340" fill="url(#vbGold)" className="vb-light" />
        <circle r="360" fill="none" stroke="#c9a24a" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="14 18" className="vb-ring" />
      </g>
      <g transform="translate(250 410) skewY(-8) scale(0.42 1)" opacity="0.9">
        <circle r="350" fill="url(#vbDoor)" stroke="#8a6a2a" strokeWidth="16" />
        {Array.from({ length: 16 }).map((_, i) => (
          <circle key={i} cx={Math.cos((i / 16) * Math.PI * 2) * 310} cy={Math.sin((i / 16) * Math.PI * 2) * 310} r="14" fill="#a8873c" />
        ))}
        <circle r="90" fill="none" stroke="#c9a24a" strokeWidth="10" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x="-8" y="-150" width="16" height="300" rx="6" fill="#c9a24a" transform={`rotate(${i * 60})`} opacity="0.85" />
        ))}
      </g>
      {/* gold piles */}
      <Pile x={1330} y={790} w={360} seed={3} />
      <Pile x={1500} y={820} w={220} seed={9} />
      <Pile x={140} y={830} w={260} seed={5} />
      {/* red security lamps */}
      {[120, 1480].map((x) => (
        <g key={x} className="vb-alarm">
          <rect x={x - 18} y="30" width="36" height="20" rx="4" fill="#3a1010" />
          <ellipse cx={x} cy="56" rx="22" ry="12" fill="#ff2d4a" />
          <path d={`M${x - 22} 60 L ${x - 220} 900 L ${x + 220} 900 L ${x + 22} 60 Z`} fill="#ff2d4a" opacity="0.07" />
        </g>
      ))}
      <rect y="800" width="1600" height="100" fill="#050204" opacity="0.7" />
    </svg>
  );
});
