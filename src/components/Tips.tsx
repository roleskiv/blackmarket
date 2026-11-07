/**
 * First-time tips: a small card the first time each mechanic appears.
 * Seen tips are remembered per browser (localStorage, best effort).
 */
import { useEffect } from 'react';

export const TIPS = {
  welcome: { title: 'Welcome to the market', text: 'Spin with Space or the gold button. The key button buys straight into the vault, and ⓘ explains every feature.' },
  crate: { title: 'Black Market Crates', text: 'Three crates, three different effects. Pick one; the other two show what you passed on.' },
  hand: { title: 'The Dealer’s Hand', text: 'He deals a card and points at a reel: every symbol on it becomes that card.' },
  potion: { title: 'Multiplier potion', text: 'Any winning line that passes through the potion is multiplied by its value.' },
  vault: { title: 'The Dealer’s Vault', text: 'Free spins at your bet. Collect contraband: its effects last for the rest of the bonus.' },
  sticky: { title: 'Iron Shackles', text: 'Wilds that land now stay locked in place for the rest of the bonus (up to 4).' },
  tease: { title: 'Two keys in…', text: 'One more Scatter on the reels still spinning opens the vault.' },
} as const;

export type TipId = keyof typeof TIPS;

const KEY = 'black-market:tips-seen:v1';

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
const seen = loadSeen();

/** Returns true (and marks it seen) if this tip has not been shown before. */
export function claimTip(id: TipId): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: tips may repeat next visit */
  }
  return true;
}

export function resetTips() {
  seen.clear();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function TipCard({ id, onClose }: { id: TipId; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [id, onClose]);
  const tip = TIPS[id];
  return (
    <div className="tip-card" role="status" aria-live="polite" key={id}>
      <div className="tip-kicker">Tip</div>
      <div className="tip-title">{tip.title}</div>
      <div className="tip-text">{tip.text}</div>
      <button className="tip-close" onClick={onClose}>Got it</button>
    </div>
  );
}
