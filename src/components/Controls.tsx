import { useState } from "react";
import { BET_LEVELS } from "../config/game";
import { AUTO_SPIN_OPTIONS } from "../config/visual";
import { formatCredits } from "./format";
import { IconAuto, IconBolt, IconKey, IconSpin, IconStop } from "./Icons";

interface Props {
  balance: number;
  betIndex: number;
  win: number;
  winLabel: string;
  busy: boolean;
  canSpin: boolean;
  inBonus: boolean;
  autoRemaining: number | null;
  turbo: boolean;
  onBet: (delta: number) => void;
  onSpin: () => void;
  onAuto: (n: number) => void;
  onStopAuto: () => void;
  onTurbo: () => void;
  onBuy: () => void;
}

export function Controls(p: Props) {
  const [autoOpen, setAutoOpen] = useState(false);
  const autoActive = p.autoRemaining !== null;
  return (
    <footer className="controls">
      <div className="ctl-stat">
        <span className="label">Demo balance</span>
        <span className="value">{formatCredits(p.balance)}</span>
      </div>

      <div className="ctl-bet">
        <span className="label">{p.inBonus ? "Bet (locked)" : "Bet"}</span>
        <div className="bet-row">
          <button
            className="round-btn"
            onClick={() => p.onBet(-1)}
            disabled={p.busy || p.inBonus || p.betIndex === 0 || autoActive}
            aria-label="Decrease bet"
          >
            −
          </button>
          <span className="value">{formatCredits(BET_LEVELS[p.betIndex])}</span>
          <button
            className="round-btn"
            onClick={() => p.onBet(1)}
            disabled={
              p.busy ||
              p.inBonus ||
              p.betIndex === BET_LEVELS.length - 1 ||
              autoActive
            }
            aria-label="Increase bet"
          >
            +
          </button>
        </div>
      </div>

      <div className="ctl-center">
        <div className="ctl-side ctl-side-l">
          <button
            className="toggle-btn buy-btn"
            onClick={p.onBuy}
            disabled={p.busy || p.inBonus || autoActive}
            aria-label="Bonus buy"
          >
            <IconKey />
            <span>Buy</span>
          </button>
          <button
            className={`toggle-btn ${p.turbo ? "is-on" : ""}`}
            onClick={p.onTurbo}
            aria-pressed={p.turbo}
            aria-label="Turbo spin"
          >
            <IconBolt />
            <span>Turbo</span>
          </button>
        </div>
        <button
          className={`spin-btn ${p.busy ? "is-busy" : ""} ${p.inBonus ? "is-bonus" : ""}`}
          onClick={autoActive ? p.onStopAuto : p.onSpin}
          disabled={!autoActive && !p.canSpin && !p.busy}
          aria-label={
            autoActive ? "Stop auto-spin" : p.busy ? "Skip animation" : "Spin"
          }
        >
          <span className="spin-btn-ring" />
          {autoActive ? (
            <span className="spin-btn-auto">
              <IconStop />
              <small>
                {p.autoRemaining === Infinity ? "∞" : p.autoRemaining}
              </small>
            </span>
          ) : (
            <IconSpin />
          )}
        </button>
        <div className="ctl-side ctl-side-r">
          <div className="auto-wrap">
            <button
              className={`toggle-btn ${autoActive ? "is-on" : ""}`}
              onClick={() =>
                autoActive ? p.onStopAuto() : setAutoOpen((o) => !o)
              }
              aria-label="Auto-spin"
              aria-expanded={autoOpen}
            >
              <IconAuto />
              <span>{autoActive ? "Stop" : "Auto"}</span>
            </button>
            {autoOpen && !autoActive && (
              <div className="auto-menu" role="menu">
                {AUTO_SPIN_OPTIONS.map((n) => (
                  <button
                    key={n}
                    role="menuitem"
                    onClick={() => {
                      setAutoOpen(false);
                      p.onAuto(n);
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => {
                    setAutoOpen(false);
                    p.onAuto(Infinity);
                  }}
                >
                  ∞
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ctl-stat ctl-win">
        <span className="label">{p.winLabel}</span>
        <span className={`value ${p.win > 0 ? "gold" : ""}`}>
          {formatCredits(p.win)}
        </span>
      </div>
    </footer>
  );
}
