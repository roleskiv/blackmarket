import { formatCredits } from './format';

export type BannerTier = 'big' | 'mega' | 'epic';
const LABEL: Record<BannerTier, string> = { big: 'BIG WIN', mega: 'MEGA WIN', epic: 'EPIC HAUL' };

export function WinBanner({ tier, amount, onSkip }: { tier: BannerTier; amount: number; onSkip: () => void }) {
  return (
    <div className={`win-banner tier-${tier}`} onClick={onSkip}>
      <div className="win-banner-rays" />
      <div className="win-banner-label">{LABEL[tier]}</div>
      <div className="win-banner-amount">{formatCredits(amount)}</div>
      <div className="win-banner-hint">tap to skip</div>
    </div>
  );
}
