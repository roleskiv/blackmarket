import { ARTIFACTS, type ArtifactKind } from '../config/game';
import { SYMBOLS } from '../config/symbols';
import type { BonusState, BonusSummary } from '../engine/bonus';
import { formatCredits } from './format';
import { SymbolImage } from './SymbolImage';

const ARTIFACT_ICON: Record<ArtifactKind, JSX.Element> = {
  ledger: (
    <svg viewBox="0 0 40 40"><rect x="8" y="6" width="24" height="28" rx="2" fill="#4a2e0e" stroke="#f1d58a" strokeWidth="2" /><path d="M12 12h16M12 17h16M12 22h10" stroke="#f1d58a" strokeWidth="1.6" /><circle cx="27" cy="27" r="5" fill="#c9a24a" /></svg>
  ),
  raven_feather: (
    <svg viewBox="0 0 40 40"><path d="M10 34 C 14 20 22 10 32 6 C 30 18 24 28 10 34 Z" fill="#2a1840" stroke="#b45cff" strokeWidth="2" /><path d="M10 34 L 28 12" stroke="#d9a6ff" strokeWidth="1.4" /></svg>
  ),
  hourglass: (
    <svg viewBox="0 0 40 40"><path d="M11 6h18M11 34h18M13 6c0 10 14 10 14 14S13 24 13 34M27 6c0 10-14 10-14 14s14 4 14 14" stroke="#7dff6a" strokeWidth="2" fill="none" /><path d="M16 30h8l-4-5z" fill="#7dff6a" /></svg>
  ),
  eye_sigil: (
    <svg viewBox="0 0 40 40"><path d="M4 20 C 12 8 28 8 36 20 C 28 32 12 32 4 20 Z" fill="#3a0a16" stroke="#ff2d6f" strokeWidth="2" /><circle cx="20" cy="20" r="6" fill="#ff2d6f" /><ellipse cx="20" cy="20" rx="1.6" ry="5" fill="#120006" /></svg>
  ),
};

export const artifactDef = (k: ArtifactKind) => ARTIFACTS.find((a) => a.kind === k)!;
export const ArtifactIcon = ({ kind }: { kind: ArtifactKind }) => ARTIFACT_ICON[kind];

export function BonusHud({ bonus, bonusWin }: { bonus: BonusState; bonusWin: number }) {
  const counts = (Object.keys(ARTIFACT_ICON) as ArtifactKind[]).map((k) => ({
    kind: k,
    count: bonus.collected.filter((a) => a.kind === k).length,
  }));
  return (
    <div className="bonus-hud">
      <div className="bonus-hud-stats">
        <div className="bonus-stat">
          <span className="label">Free spins</span>
          <span className="value">{bonus.spinsRemaining}</span>
        </div>
        <div className="bonus-stat">
          <span className="label">Multiplier</span>
          <span className="value gold">×{1 + bonus.ledgers}</span>
        </div>
        <div className="bonus-stat">
          <span className="label">Bonus win</span>
          <span className="value gold">{formatCredits(bonusWin)}</span>
        </div>
      </div>
      <div className="collection" id="collection-area">
        <div className="collection-title">Contraband collection</div>
        <div className="collection-slots">
          {counts.map(({ kind, count }) => {
            const def = artifactDef(kind);
            return (
              <div key={kind} className={`collection-slot ${count ? 'is-owned' : ''}`} style={{ ['--c' as string]: def.color }} title={`${def.name}: ${def.description}`} data-artifact={kind}>
                <ArtifactIcon kind={kind} />
                {count > 0 && <span className="collection-count">{count}</span>}
                <span className="collection-name">{def.name}</span>
              </div>
            );
          })}
        </div>
        {(bonus.feathers > 0 || bonus.sigils.length > 0) && (
          <div className="collection-active">
            {bonus.feathers > 0 && <span className="mod-chip">+{bonus.feathers} Wild / spin</span>}
            {bonus.sigils.map((s) => (
              <span key={s.from} className="mod-chip">
                <SymbolImage id={s.from} /> ➜ <SymbolImage id={s.to} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BonusSummaryModal({ summary, onClose }: { summary: BonusSummary; onClose: () => void }) {
  const counts = new Map<ArtifactKind, number>();
  summary.collected.forEach((a) => counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1));
  return (
    <div className="modal-backdrop summary-backdrop">
      <div className="summary-card" role="dialog" aria-label="Bonus summary">
        <div className="summary-kicker">The Vault seals shut</div>
        <h2 className="summary-title">Bonus Summary</h2>
        <div className="summary-total">{formatCredits(summary.totalWin)}</div>
        <div className="summary-sub">virtual demo credits awarded · {(summary.totalWin / summary.bet).toFixed(1)}× bet</div>
        <div className="summary-grid">
          <div><span>Free spins played</span><b>{summary.spinsPlayed}</b></div>
          <div><span>Retriggers</span><b>{summary.retriggers}</b></div>
          <div><span>Final multiplier</span><b>×{summary.finalMultiplier}</b></div>
          <div><span>Artifacts collected</span><b>{summary.collected.length}</b></div>
        </div>
        {counts.size > 0 && (
          <div className="summary-artifacts">
            {[...counts.entries()].map(([k, n]) => (
              <div key={k} className="summary-artifact" style={{ ['--c' as string]: artifactDef(k).color }}>
                <ArtifactIcon kind={k} />
                <span>{artifactDef(k).name} ×{n}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn-gold" onClick={onClose} autoFocus>
          Collect & return to the market
        </button>
      </div>
    </div>
  );
}

export function ArtifactToast({ kind, detail }: { kind: ArtifactKind; detail?: string }) {
  const def = artifactDef(kind);
  return (
    <div className="artifact-toast" style={{ ['--c' as string]: def.color }}>
      <ArtifactIcon kind={kind} />
      <div>
        <div className="artifact-toast-title">{def.name} collected</div>
        <div className="artifact-toast-desc">{detail ?? def.description}</div>
      </div>
    </div>
  );
}

export const symbolName = (id: keyof typeof SYMBOLS) => SYMBOLS[id].name;
