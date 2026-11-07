/**
 * SlotEngine — the stateful façade the UI talks to.
 * Owns the RNG, wallet and bonus state.
 *
 * `startSpin()` debits the bet and resolves the grid. If the Dealer offers
 * crates, the spin waits for `pickCrate(i)`; otherwise it is settled at once.
 * Either way the win is credited the moment the result is final, before the
 * UI animates anything, so skipping or interrupting animations can never
 * change a payout.
 */
import { BET_LEVELS, DEFAULT_BET_INDEX, FEATURE_CONFIG, STARTING_BALANCE, type CrateEffectKind } from '../config/game';
import { Wallet } from './accounting';
import { applyArtifact, lockStickyWilds, startBonus, summarise, type BonusState, type BonusSummary } from './bonus';
import { createRng, randomSeed, type Rng } from './rng';
import { finishSpin, startSpin, type PendingSpin } from './spin';
import type { FeatureStep, Grid, Potion, SpinResult } from './types';

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
  /** Set on the last free spin (or when the win cap ends the bonus). */
  bonusEnded?: BonusSummary;
}

/** What the UI gets from startSpin(). */
export interface SpinStart {
  id: number;
  phase: GamePhase;
  bet: number;
  initialGrid: Grid;
  /** Steps applied before any crate (sigils, sticky wilds, feathers, dealer's hand). */
  preSteps: FeatureStep[];
  /** Crates on offer — the player must call pickCrate(). Contents are hidden from the UI until picked. */
  crateOffers?: number;
  /** Present when no choice is needed: the spin is already settled. */
  outcome?: SpinOutcome;
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
  forcePotion?: Potion;
}

interface InFlight {
  id: number;
  seedState: number;
  balanceBefore: number;
  phase: GamePhase;
  pending: PendingSpin;
}

export class SlotEngine {
  rng: Rng;
  wallet: Wallet;
  betIndex = DEFAULT_BET_INDEX;
  bonus: BonusState | null = null;
  history: HistoryEntry[] = [];
  private spinCount = 0;
  private inFlight: InFlight | null = null;
  /** Running win of the current round (base spin + its bonus), for the win cap. */
  private roundWin = 0;
  private roundBet = 0;
  /** Deals on offer for a bonus that hasn't played its first spin yet. */
  private dealOffer: { spins: number; mult: number }[] | null = null;

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
  /** Vault deals the player may still choose from (null once the first free spin starts). */
  get vaultDeals() {
    return this.dealOffer;
  }

  /** Choose vault deal `i` before the first free spin. Deal 0 is the default. */
  chooseDeal(i: number): BonusState {
    const deal = this.dealOffer?.[i];
    if (!this.bonus || !deal) throw new Error('No vault deal to choose');
    this.bonus = startBonus(this.bonus.bet, deal.spins, deal.mult);
    this.dealOffer = null;
    return this.bonus;
  }

  private openVault(bet: number, spins: number) {
    const deals = FEATURE_CONFIG.vaultDeals[spins];
    this.dealOffer = deals ? deals.map((d) => ({ ...d })) : null;
    const b = startBonus(bet, spins);
    this.bonus = b;
    return b;
  }

  get awaitingCratePick() {
    return !!this.inFlight;
  }

  setBetIndex(i: number) {
    if (this.bonus || this.inFlight) return; // bet is locked during the bonus / a spin
    this.betIndex = Math.max(0, Math.min(BET_LEVELS.length - 1, i));
  }

  canSpin() {
    if (this.inFlight) return false;
    return this.bonus ? this.bonus.spinsRemaining > 0 : this.wallet.canAfford(this.bet);
  }

  resetBalance(amount = STARTING_BALANCE) {
    if (this.inFlight) throw new Error('Cannot reset during a spin');
    this.wallet.reset(amount);
    this.bonus = null;
    this.dealOffer = null;
    this.history = [];
  }

  /** Price of bonus buy `tier` at the current bet. */
  bonusBuyPrice(tier: number) {
    return FEATURE_CONFIG.bonusBuys[tier].priceX * this.bet;
  }

  canBuyBonus(tier: number) {
    return !this.bonus && !this.inFlight && !!FEATURE_CONFIG.bonusBuys[tier] && this.wallet.canAfford(this.bonusBuyPrice(tier));
  }

  /**
   * Bonus buy: debit the price and open the vault at the current bet.
   * The bought bonus is one round for the win cap (10,000× the bet).
   */
  buyBonus(tier: number): { id: number; cost: number; spins: number; bonus: BonusState; balanceBefore: number; balanceAfter: number } {
    if (!this.canBuyBonus(tier)) throw new Error('Cannot buy bonus');
    const buy = FEATURE_CONFIG.bonusBuys[tier];
    const id = ++this.spinCount;
    const cost = this.bonusBuyPrice(tier);
    const balanceBefore = this.wallet.balance;
    this.wallet.debit(cost);
    this.roundWin = 0;
    this.roundBet = this.bet;
    const bonus = this.openVault(this.bet, buy.spins);
    this.history.unshift({ id, phase: 'base', bet: cost, win: 0, features: [`bonus buy:${buy.name}`] });
    if (this.history.length > 50) this.history.pop();
    return { id, cost, spins: buy.spins, bonus, balanceBefore, balanceAfter: this.wallet.balance };
  }

  /** QA / simulation: open the vault for free at the current bet with `spins` awarded. */
  forceBonus(spins: number) {
    if (this.bonus || this.inFlight) throw new Error('Cannot force bonus now');
    this.roundWin = 0;
    this.roundBet = this.bet;
    return this.openVault(this.bet, spins);
  }

  /** Begin a spin. Debits the bet in the base game. */
  startSpin(force: ForceOptions = {}): SpinStart {
    if (this.inFlight) throw new Error('A crate pick is pending');
    if (!this.canSpin()) throw new Error('Cannot spin');
    const id = ++this.spinCount;
    if (this.bonus) this.dealOffer = null; // first free spin locks in the deal
    const seedState = this.rng.state;
    const balanceBefore = this.wallet.balance;
    const phase = this.phase;
    const bet = this.bonus ? this.bonus.bet : this.bet;

    if (!this.bonus) {
      this.wallet.debit(bet);
      this.roundWin = 0;
      this.roundBet = bet;
    }
    const pending = startSpin({ rng: this.rng, bet, bonus: this.bonus ?? undefined, ...force });
    this.inFlight = { id, seedState, balanceBefore, phase, pending };
    const start: SpinStart = { id, phase, bet, initialGrid: pending.initialGrid, preSteps: pending.steps };
    if (pending.offers) start.crateOffers = pending.offers.length;
    else start.outcome = this.settle(0);
    return start;
  }

  /** Open crate `index` (0-based) and settle the spin. */
  pickCrate(index: number): SpinOutcome {
    if (!this.inFlight?.pending.offers) throw new Error('No crate pick pending');
    return this.settle(index);
  }

  /** Convenience: start + settle in one call. Crate pick defaults to 0 (offers are shuffled). */
  spin(force: ForceOptions & { cratePick?: number } = {}): SpinOutcome {
    const s = this.startSpin(force);
    return s.outcome ?? this.pickCrate(force.cratePick ?? 0);
  }

  private settle(pick: number): SpinOutcome {
    const f = this.inFlight!;
    this.inFlight = null;
    const result = finishSpin(f.pending, pick);

    // Round win cap (FEATURE_CONFIG.maxWinX × the round's bet).
    const cap = FEATURE_CONFIG.maxWinX * this.roundBet;
    if (this.roundWin + result.totalWin >= cap) {
      result.totalWin = Math.max(0, cap - this.roundWin);
      result.capped = true;
      result.freeSpinsAwarded = 0;
    }
    this.roundWin += result.totalWin;
    this.wallet.credit(result.totalWin);

    const outcome: SpinOutcome = {
      id: f.id,
      seedState: f.seedState,
      result,
      balanceBefore: f.balanceBefore,
      balanceAfter: this.wallet.balance,
      phase: f.phase,
    };

    if (f.phase === 'base') {
      if (result.freeSpinsAwarded > 0) {
        outcome.bonus = this.openVault(result.bet, result.freeSpinsAwarded);
        outcome.bonusTriggered = { spins: result.freeSpinsAwarded, scatters: result.scatter.count };
      }
    } else {
      let b = this.bonus!;
      b = { ...b, spinsRemaining: b.spinsRemaining - 1, spinsPlayed: b.spinsPlayed + 1, totalWin: b.totalWin + result.totalWin };
      if (result.freeSpinsAwarded > 0) {
        b.spinsRemaining += result.freeSpinsAwarded;
        b.spinsAwarded += result.freeSpinsAwarded;
        b.retriggers += 1;
      }
      b = lockStickyWilds(b, result.finalGrid);
      if (result.artifact && !result.capped) b = applyArtifact(b, result.artifact);
      if (result.capped) b.spinsRemaining = 0;
      outcome.bonus = b;
      if (b.spinsRemaining <= 0) {
        outcome.bonusEnded = { ...summarise(b), capped: result.capped };
        this.bonus = null;
      } else {
        this.bonus = b;
      }
    }
    this.log(outcome);
    return outcome;
  }

  private log(o: SpinOutcome) {
    const features: string[] = o.result.steps.map((s) => (s.type === 'crate' ? `crate:${s.effect}` : s.type));
    if (o.bonusTriggered) features.push('vault');
    if (o.result.artifact) features.push(`artifact:${o.result.artifact.kind}`);
    if (o.result.capped) features.push('win cap');
    this.history.unshift({ id: o.id, phase: o.phase, bet: o.result.bet, win: o.result.totalWin, features });
    if (this.history.length > 50) this.history.pop();
  }
}
