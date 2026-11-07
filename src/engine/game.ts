/**
 * SlotEngine — the stateful façade the UI talks to.
 * Owns the RNG, wallet and bonus state. `spin()` resolves AND settles a spin
 * synchronously (bet debited, win credited) before the UI animates anything,
 * so skipping or interrupting animations can never change a payout.
 */
import { BET_LEVELS, DEFAULT_BET_INDEX, STARTING_BALANCE, type CrateEffectKind } from '../config/game';
import { Wallet } from './accounting';
import { applyArtifact, startBonus, summarise, type BonusState, type BonusSummary } from './bonus';
import { createRng, randomSeed, type Rng } from './rng';
import { resolveSpin } from './spin';
import type { Grid, SpinResult } from './types';

export type GamePhase = 'base' | 'bonus';

export interface SpinOutcome {
  id: number;
  seedState: number;
  result: SpinResult;
  balanceBefore: number;
  balanceAfter: number;
  phase: GamePhase;
  /** Set when this base spin triggered the vault bonus. */
  bonusTriggered?: { spins: number; scatters: number };
  /** Bonus state AFTER this spin (if in or entering bonus). */
  bonus?: BonusState;
  /** Set on the last free spin. */
  bonusEnded?: BonusSummary;
}

export interface HistoryEntry {
  id: number;
  phase: GamePhase;
  bet: number;
  win: number;
  features: string[];
}

export interface EngineOptions {
  seed?: number;
  balance?: number;
}

export interface ForceOptions {
  forceGrid?: Grid;
  forceCrate?: CrateEffectKind;
  forceDealerHand?: boolean;
}

export class SlotEngine {
  rng: Rng;
  wallet: Wallet;
  betIndex = DEFAULT_BET_INDEX;
  bonus: BonusState | null = null;
  history: HistoryEntry[] = [];
  private spinCount = 0;

  constructor(opts: EngineOptions = {}) {
    this.rng = createRng(opts.seed ?? randomSeed());
    this.wallet = new Wallet(opts.balance ?? STARTING_BALANCE);
  }

  get phase(): GamePhase {
    return this.bonus ? 'bonus' : 'base';
  }
  get bet() {
    return BET_LEVELS[this.betIndex];
  }
  get balance() {
    return this.wallet.balance;
  }

  setBetIndex(i: number) {
    if (this.bonus) return; // bet is locked during the bonus
    this.betIndex = Math.max(0, Math.min(BET_LEVELS.length - 1, i));
  }

  canSpin() {
    return this.bonus ? this.bonus.spinsRemaining > 0 : this.wallet.canAfford(this.bet);
  }

  resetBalance(amount = STARTING_BALANCE) {
    this.wallet.reset(amount);
    this.bonus = null;
    this.history = [];
  }

  spin(force: ForceOptions = {}): SpinOutcome {
    const id = ++this.spinCount;
    const seedState = this.rng.state;
    const balanceBefore = this.wallet.balance;

    if (this.bonus) return this.freeSpin(id, seedState, balanceBefore, force);

    const bet = this.bet;
    this.wallet.debit(bet);
    const result = resolveSpin({ rng: this.rng, bet, ...force });
    this.wallet.credit(result.totalWin);

    const outcome: SpinOutcome = {
      id,
      seedState,
      result,
      balanceBefore,
      balanceAfter: this.wallet.balance,
      phase: 'base',
    };
    if (result.freeSpinsAwarded > 0) {
      this.bonus = startBonus(bet, result.freeSpinsAwarded);
      outcome.bonusTriggered = { spins: result.freeSpinsAwarded, scatters: result.scatter.count };
      outcome.bonus = this.bonus;
    }
    this.log(outcome);
    return outcome;
  }

  private freeSpin(id: number, seedState: number, balanceBefore: number, force: ForceOptions): SpinOutcome {
    let b = this.bonus!;
    const result = resolveSpin({ rng: this.rng, bet: b.bet, bonus: b, ...force });
    this.wallet.credit(result.totalWin);

    b = { ...b, spinsRemaining: b.spinsRemaining - 1, spinsPlayed: b.spinsPlayed + 1, totalWin: b.totalWin + result.totalWin };
    if (result.freeSpinsAwarded > 0) {
      b.spinsRemaining += result.freeSpinsAwarded;
      b.spinsAwarded += result.freeSpinsAwarded;
      b.retriggers += 1;
    }
    if (result.artifact) b = applyArtifact(b, result.artifact);

    const outcome: SpinOutcome = {
      id,
      seedState,
      result,
      balanceBefore,
      balanceAfter: this.wallet.balance,
      phase: 'bonus',
      bonus: b,
    };
    if (b.spinsRemaining <= 0) {
      outcome.bonusEnded = summarise(b);
      this.bonus = null;
    } else {
      this.bonus = b;
    }
    this.log(outcome);
    return outcome;
  }

  private log(o: SpinOutcome) {
    const features: string[] = o.result.steps.map((s) => (s.type === 'crate' ? `crate:${s.effect}` : s.type));
    if (o.bonusTriggered) features.push('vault');
    if (o.result.artifact) features.push(`artifact:${o.result.artifact.kind}`);
    this.history.unshift({ id: o.id, phase: o.phase, bet: o.result.bet, win: o.result.totalWin, features });
    if (this.history.length > 50) this.history.pop();
  }
}
