import { forwardRef } from 'react';
import type { SymbolId } from '../config/symbols';
import { SymbolImage } from './SymbolImage';

/* ───────────────────────── Black Market Crate ───────────────────────── */

export interface CrateReveal {
  title: string;
  description: string;
  detail?: string;
  from?: SymbolId;
  to?: SymbolId;
  multiplier?: number;
}

function CrateBox() {
  return (
    <div className="crate-scale">
    <div className="crate" data-part="crate">
      <div className="crate-light" data-part="light" />
      <div className="crate-lid" data-part="lid">
        <div className="crate-plank" />
      </div>
      <div className="crate-box">
        <div className="crate-band left" />
        <div className="crate-band right" />
        <div className="crate-crack c1" />
        <div className="crate-crack c2" />
        <div className="crate-crack c3" />
        <div className="crate-seal">BM</div>
      </div>
    </div>
    </div>
  );
}

/**
 * Crate pick: three crates the engine has already filled. The player opens one;
 * the other two then show what was inside them.
 */
export const CrateOverlay = forwardRef<
  HTMLDivElement,
  { reveal: CrateReveal | null; passed: (string | null)[]; choosing: boolean; onPick: (i: number) => void; countdown: number | null }
>(function CrateOverlay({ reveal, passed, choosing, onPick, countdown }, ref) {
  return (
    <div ref={ref} className="cine-overlay crate-overlay" style={{ display: 'none' }}>
      <div className="crate-prompt" data-part="prompt">
        <div className="crate-prompt-kicker">Black Market Crates</div>
        <div className="crate-prompt-title">{choosing ? 'The Dealer offers three crates. Pick one.' : '\u00a0'}</div>
        {choosing && countdown !== null && <div className="crate-prompt-hint">Auto-pick in {countdown}s · keys 1–3</div>}
      </div>
      <div className="crate-row" data-part="row">
        {[0, 1, 2].map((i) => (
          <button key={i} className={`crate-slot ${choosing ? 'is-choosing' : ''}`} data-part="slot" data-index={i} onClick={() => choosing && onPick(i)} disabled={!choosing} aria-label={`Open crate ${i + 1}`}>
            <CrateBox />
            <span className="crate-number">{i + 1}</span>
            {passed[i] && <span className="crate-passed">Passed on: {passed[i]}</span>}
          </button>
        ))}
      </div>
      <div className="crate-card" data-part="card">
        <div className="crate-card-kicker">You opened</div>
        <div className="crate-card-title">{reveal?.title}</div>
        {reveal?.multiplier ? (
          <div className="crate-card-mult">
            <PotionIcon value={reveal.multiplier} />
          </div>
        ) : null}
        {reveal?.from && reveal?.to ? (
          <div className="crate-card-swap">
            <SymbolImage id={reveal.from} />
            <span>➜</span>
            <SymbolImage id={reveal.to} />
          </div>
        ) : null}
        <div className="crate-card-desc">{reveal?.detail ?? reveal?.description}</div>
      </div>
    </div>
  );
});

/** The green ×N multiplier potion (crate effect and reel potions). */
export function PotionIcon({ value, small }: { value: number; small?: boolean }) {
  return (
    <svg viewBox="0 0 60 72" className={`potion-icon ${small ? 'small' : ''}`} aria-label={`×${value} multiplier`}>
      <defs>
        <radialGradient id="potionGlass" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#d6ffcf" />
          <stop offset="0.45" stopColor="#7dff6a" />
          <stop offset="1" stopColor="#1f6e16" />
        </radialGradient>
      </defs>
      <rect x="22" y="2" width="16" height="10" rx="2" fill="#8a5a2a" stroke="#3a240e" strokeWidth="2" />
      <path d="M24 12 h12 v10 c10 4 18 13 18 25 c0 14 -11 23 -24 23 s-24 -9 -24 -23 c0 -12 8 -21 18 -25 z" fill="url(#potionGlass)" stroke="#1a3a12" strokeWidth="3" />
      <path d="M14 40 c4 -6 10 -9 14 -10" stroke="#f4fff0" strokeWidth="3" strokeLinecap="round" opacity="0.7" fill="none" />
      <rect x="10" y="38" width="40" height="20" rx="4" fill="#1d2a14" stroke="#c9a24a" strokeWidth="1.5" />
      <text x="30" y="53" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="900" fontSize="15" fill="#f1d58a">×{value}</text>
    </svg>
  );
}

/* ───────────────────────── Dealer's Hand ───────────────────────── */

export const DealerHandOverlay = forwardRef<HTMLDivElement, { symbol: SymbolId | null }>(function DealerHandOverlay({ symbol }, ref) {
  return (
    <div ref={ref} className="hand-layer">
      <div className="hand-dim" data-part="dim" />
      <div className="dealer-hand" data-part="hand" style={{ display: 'none' }}>
        <svg viewBox="0 0 320 220" className="dealer-hand-svg">
          <defs>
            <linearGradient id="glove" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b2533" />
              <stop offset="1" stopColor="#09070c" />
            </linearGradient>
            <linearGradient id="cuffGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6dd94" />
              <stop offset="1" stopColor="#7a5a1e" />
            </linearGradient>
          </defs>
          {/* sleeve */}
          <path d="M0 120 L 90 96 L 104 168 L 0 200 Z" fill="#0d0b12" />
          <path d="M88 94 L 104 168" stroke="url(#cuffGold)" strokeWidth="9" />
          {/* palm */}
          <path d="M104 104 C 140 92 176 96 196 112 C 206 130 200 156 180 166 C 150 176 120 172 104 164 Z" fill="url(#glove)" />
          {/* pointing index finger */}
          <path d="M184 110 C 220 100 262 94 296 92 C 304 92 306 104 296 106 C 262 112 226 120 196 128 Z" fill="url(#glove)" />
          {/* curled fingers */}
          <path d="M186 132 C 214 132 222 144 210 150 C 198 154 188 150 184 146 Z" fill="url(#glove)" />
          <path d="M180 148 C 206 152 210 164 198 168 C 186 170 178 164 176 160 Z" fill="url(#glove)" />
          {/* thumb */}
          <path d="M150 100 C 166 76 190 70 204 76 C 210 82 204 88 196 90 C 182 94 170 100 160 110 Z" fill="url(#glove)" />
          <circle cx="160" cy="132" r="5" fill="url(#cuffGold)" />
          <path d="M120 120 Q 150 112 178 122" stroke="#3a3245" strokeWidth="2" fill="none" />
        </svg>
        <div className="dealer-card" data-part="card">
          {symbol ? <SymbolImage id={symbol} /> : null}
        </div>
      </div>
    </div>
  );
});

/* ───────────────────────── Dealer's Vault ───────────────────────── */

export const VaultOverlay = forwardRef<HTMLDivElement, { spins: number }>(function VaultOverlay({ spins }, ref) {
  return (
    <div ref={ref} className="cine-overlay vault-overlay" style={{ display: 'none' }}>
      <div className="vault" data-part="vault">
        <div className="vault-light" data-part="light" />
        <div className="vault-frame">
          <div className="vault-door left" data-part="doorL">
            <div className="vault-rivets" />
          </div>
          <div className="vault-door right" data-part="doorR">
            <div className="vault-rivets" />
          </div>
          <div className="vault-lock" data-part="lock">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="vault-spoke" style={{ transform: `rotate(${i * 45}deg)` }} />
            ))}
            <div className="vault-hub" />
          </div>
          <div className="vault-keys">
            {[0, 1, 2].map((i) => (
              <div key={i} className="vault-key" data-part="key">
                <SymbolImage id="scatter" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="vault-title" data-part="title">
        <div className="vault-title-kicker">The Dealer’s Vault is open</div>
        <div className="vault-title-main">{spins} FREE SPINS</div>
        <div className="vault-title-sub">Collect contraband. Modifiers persist.</div>
      </div>
    </div>
  );
});
