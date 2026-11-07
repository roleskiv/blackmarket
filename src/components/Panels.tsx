import { useEffect, useState, type ReactNode } from 'react';
import { ARTIFACTS, BET_LEVELS, FEATURE_CONFIG } from '../config/game';
import { PAYLINES, PAYLINE_COLORS } from '../config/paylines';
import { RARITY_LABEL, SYMBOLS, SYMBOL_IDS, type Rarity } from '../config/symbols';
import type { HistoryEntry } from '../engine/game';
import type { Settings } from '../hooks/useSettings';
import { ArtifactIcon } from './Bonus';
import { formatCredits } from './format';
import { IconClose } from './Icons';
import { SymbolImage } from './SymbolImage';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── Settings ───────────────────────── */

export function SettingsPanel(props: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onClose: () => void;
  onReset: () => void;
  history: HistoryEntry[];
  resetDisabled: boolean;
}) {
  const { settings: s, update } = props;
  const Toggle = ({ k, label, hint }: { k: 'sound' | 'turbo' | 'reducedMotion' | 'showHistory'; label: string; hint?: string }) => (
    <label className="setting-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button className={`switch ${s[k] ? 'is-on' : ''}`} role="switch" aria-checked={s[k]} onClick={() => update({ [k]: !s[k] } as Partial<Settings>)}>
        <span />
      </button>
    </label>
  );
  return (
    <Modal title="Settings" onClose={props.onClose}>
      <Toggle k="sound" label="Audio" />
      <label className="setting-row">
        <span>Music volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onChange={(e) => update({ musicVolume: Number(e.target.value) })} />
      </label>
      <label className="setting-row">
        <span>Effects volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.sfxVolume} onChange={(e) => update({ sfxVolume: Number(e.target.value) })} />
      </label>
      <Toggle k="turbo" label="Turbo spin" hint="Faster reels and shorter sequences" />
      <Toggle k="reducedMotion" label="Reduced motion" hint="No scrolling reels, shaking or particles" />
      <Toggle k="showHistory" label="Show spin history" />
      <p className="setting-note">Tap the reels, the spin button or press Space to skip long animations. Skipping never changes an outcome — every result is resolved and paid before it is animated.</p>
      <button className="btn-danger" onClick={props.onReset} disabled={props.resetDisabled}>
        Reset demo balance
      </button>
      {s.showHistory && (
        <div className="history">
          <h3>Recent outcomes</h3>
          {props.history.length === 0 && <p className="muted">No spins yet.</p>}
          <ul>
            {props.history.slice(0, 20).map((h) => (
              <li key={h.id}>
                <span className="muted">#{h.id}</span>
                <span>{h.phase === 'bonus' ? 'Free spin' : `Bet ${formatCredits(h.bet)}`}</span>
                <span className={h.win > 0 ? 'gold' : 'muted'}>{h.win > 0 ? `+${formatCredits(h.win)}` : '—'}</span>
                <span className="history-tags">{h.features.map((f) => <em key={f}>{f.replace(/_/g, ' ')}</em>)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/* ───────────────────────── Paytable & rules ───────────────────────── */

export function InfoModal({ onClose, betIndex }: { onClose: () => void; betIndex: number }) {
  const [tab, setTab] = useState<'pay' | 'lines' | 'features' | 'rules'>('pay');
  const bet = BET_LEVELS[betIndex];
  const lineBet = bet / PAYLINES.length;
  const groups: Rarity[] = ['premium', 'uncommon', 'common', 'special'];
  return (
    <Modal title="Paytable & Rules" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {(
          [
            ['pay', 'Paytable'],
            ['lines', 'Paylines'],
            ['features', 'Features'],
            ['rules', 'Rules'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'pay' && (
        <div>
          <p className="muted">Values shown in demo credits for the current bet of {formatCredits(bet)} ({formatCredits(lineBet)} per line).</p>
          {groups.map((g) => (
            <section key={g} className="pay-group">
              <h3>{RARITY_LABEL[g]}</h3>
              <div className="pay-grid">
                {SYMBOL_IDS.filter((id) => SYMBOLS[id].rarity === g).map((id) => {
                  const d = SYMBOLS[id];
                  const mult = id === 'scatter' ? bet : lineBet;
                  return (
                    <div key={id} className="pay-card" style={{ ['--glow' as string]: d.glow }}>
                      <SymbolImage id={id} />
                      <div>
                        <div className="pay-name">{d.name}</div>
                        {([5, 4, 3] as const).map((n) => (
                          <div key={n} className="pay-line">
                            <span>{n}×</span>
                            <b>{formatCredits(d.pays[n] * mult)}</b>
                          </div>
                        ))}
                        {id === 'wild' && <div className="pay-note">Substitutes for all symbols except Scatter. Appears on reels 2–5.</div>}
                        {id === 'scatter' && <div className="pay-note">Pays anywhere on total bet. 3+ open the Dealer’s Vault.</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="proto-note">⚠ Prototype math: payouts and symbol weights are uncalibrated initial values.</p>
        </div>
      )}
      {tab === 'lines' && (
        <div>
          <p className="muted">25 fixed paylines. Wins pay left to right from reel 1 for 3, 4 or 5 consecutive matching symbols. Only the highest win per line is paid.</p>
          <div className="lines-grid">
            {PAYLINES.map((line, i) => (
              <div key={i} className="line-card">
                <svg viewBox="0 0 50 40">
                  {Array.from({ length: 20 }).map((_, c) => (
                    <rect key={c} x={(c % 5) * 10 + 1} y={Math.floor(c / 5) * 10 + 1} width="8" height="8" rx="1.5" className={line[c % 5] === Math.floor(c / 5) ? 'on' : ''} style={{ fill: line[c % 5] === Math.floor(c / 5) ? PAYLINE_COLORS[i] : undefined }} />
                  ))}
                </svg>
                <span>{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'features' && (
        <div className="features">
          <section>
            <h3>Black Market Crates</h3>
            <p>On any spin ({Math.round(FEATURE_CONFIG.crateChance * 100)}% base / {Math.round(FEATURE_CONFIG.crateChanceBonus * 100)}% free spins, prototype values) the Dealer offers three crates holding three different effects. The game fills all three before you choose, in random order. Open one and its effect applies to that spin before wins are counted; the other two then show what you passed on. During auto-spin, or if you don’t choose within 10 seconds, a crate is picked at random.</p>
            <ul>
              {FEATURE_CONFIG.crateEffects.map((e) => (
                <li key={e.kind}><b>{e.title}</b> — {e.description}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>The Dealer’s Hand</h3>
            <p>If no crate opens, the Dealer may reach in ({Math.round(FEATURE_CONFIG.dealerHandChance * 100)}% per spin). He deals one premium symbol or a Wild and points at a reel — every non-Scatter symbol on that reel becomes the dealt card. Wilds are never dealt to reel 1.</p>
          </section>
          <section>
            <h3>Multiplier potions</h3>
            <p>A ×2, ×3 or ×5 potion sometimes lands on a reel position ({Math.round(FEATURE_CONFIG.potionChance * 100)}% base / {Math.round(FEATURE_CONFIG.potionChanceBonus * 100)}% free spins). Any line win that uses that position is multiplied. Potions stack with each other and with crate and bonus multipliers.</p>
          </section>
          <section>
            <h3>The Dealer’s Vault</h3>
            <p>3, 4 or 5 Scatters award {FEATURE_CONFIG.freeSpinsAwarded[3]}, {FEATURE_CONFIG.freeSpinsAwarded[4]} or {FEATURE_CONFIG.freeSpinsAwarded[5]} free spins at the triggering bet. 3+ Scatters during the bonus add {FEATURE_CONFIG.retriggerSpins} spins. Each free spin has a {Math.round(FEATURE_CONFIG.artifactChance * 100)}% chance to collect contraband, applied from the next spin:</p>
            <ul className="artifact-list">
              {ARTIFACTS.map((a) => (
                <li key={a.kind} style={{ ['--c' as string]: a.color }}>
                  <ArtifactIcon kind={a.kind} />
                  <span><b>{a.name}</b> — {a.description} {a.persistent ? <em>(persists)</em> : null}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {tab === 'rules' && (
        <div className="rules">
          <ul>
            <li>BLACK MARKET is a free demo game played with <b>virtual demo credits only</b>. Credits have no cash value and cannot be bought, sold or withdrawn.</li>
            <li>5 reels × 4 rows, 25 fixed paylines. Total bet = 25 × line bet.</li>
            <li>Line wins are multiplied by the line bet and any active multiplier; Scatter wins are multiplied by the total bet and are not multiplied further.</li>
            <li>Wins on different paylines are added together.</li>
            <li>Every outcome is generated and evaluated by the game engine before anything is animated. Skipping animations never changes a result.</li>
            <li>Free spins are played at the bet that triggered them and do not deduct credits.</li>
            <li>Win cap: a round (a paid spin plus any bonus it triggers) pays at most {FEATURE_CONFIG.maxWinX.toLocaleString()}× the total bet. A win that would pass the cap is reduced to it and the bonus ends.</li>
            <li className="proto-note">Prototype disclaimer: reel weights, payouts and feature frequencies are uncalibrated. Simulation figures shown in the README are estimates, not certified RTP, volatility or maximum-win values.</li>
          </ul>
        </div>
      )}
    </Modal>
  );
}
