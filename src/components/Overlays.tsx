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

export const CrateOverlay = forwardRef<HTMLDivElement, { reveal: CrateReveal | null }>(function CrateOverlay({ reveal }, ref) {
  return (
    <div ref={ref} className="cine-overlay crate-overlay" style={{ display: 'none' }}>
      <div className="crate-stage">
        <div className="crate" data-part="crate">
          <div className="crate-light" data-part="light" />
          <div className="crate-lid" data-part="lid">
            <div className="crate-plank" />
          </div>
          <div className="crate-box">
            <div className="crate-plank" />
            <div className="crate-plank" />
            <div className="crate-band left" />
            <div className="crate-band right" />
            <div className="crate-crack c1" />
            <div className="crate-crack c2" />
            <div className="crate-crack c3" />
            <div className="crate-seal">BM</div>
          </div>
        </div>
        <div className="crate-card" data-part="card">
          <div className="crate-card-kicker">Black Market Crate</div>
          <div className="crate-card-title">{reveal?.title}</div>
          {reveal?.multiplier ? <div className="crate-card-mult">×{reveal.multiplier}</div> : null}
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
    </div>
  );
});

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
