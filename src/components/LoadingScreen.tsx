import { Logo } from './TopBar';

/** Shown while symbol art and fonts load. "Enter" also unlocks browser audio. */
export function LoadingScreen({ progress, onEnter }: { progress: number; onEnter: () => void }) {
  const ready = progress >= 1;
  return (
    <div className="loading-screen">
      <Logo />
      <div className="loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <button className="btn-gold loading-enter" onClick={onEnter} disabled={!ready} autoFocus={ready}>
        {ready ? 'Enter the market' : 'Unpacking contraband…'}
      </button>
      <p className="loading-note">Free demo game · virtual credits only · no real money</p>
    </div>
  );
}
