import { useEffect } from 'react';
import { FEATURE_CONFIG } from '../config/game';

interface Props {
  deals: { spins: number; mult: number }[];
  countdown: number | null;
  onPick: (i: number) => void;
}

/** The Dealer's deal: trade free spins for a multiplier before the vault bonus starts. */
export function VaultDealOverlay({ deals, countdown, onPick }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= deals.length) onPick(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deals, onPick]);
  return (
    <div className="cine-overlay deal-overlay" role="dialog" aria-label="Choose your vault deal">
      <div className="crate-prompt">
        <div className="crate-prompt-kicker">The Dealer’s offer</div>
        <div className="crate-prompt-title">Take your spins, or take a cut.</div>
        {countdown !== null && <div className="crate-prompt-hint">Long Haul in {countdown}s · keys 1–{deals.length}</div>}
      </div>
      <div className="deal-row">
        {deals.map((d, i) => (
          <button key={i} className={`deal-card deal-${i}`} onClick={() => onPick(i)} style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="deal-name">{FEATURE_CONFIG.vaultDealNames[i] ?? `Deal ${i + 1}`}</span>
            <span className="deal-spins"><b>{d.spins}</b> free spins</span>
            <span className="deal-mult">×{d.mult}</span>
            <span className="deal-note">{d.mult === 1 ? 'Every spin, no cut' : `All bonus wins ×${d.mult}`}</span>
            <span className="deal-key">{i + 1}</span>
          </button>
        ))}
      </div>
      <p className="deal-foot">Every deal returns about the same on average (simulation estimate). Contraband multipliers stack on top.</p>
    </div>
  );
}
