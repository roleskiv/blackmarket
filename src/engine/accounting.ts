/**
 * Virtual demo-credit accounting. Integers only — no floating-point credits.
 * There is deliberately no deposit / withdrawal / real-money path.
 */
export class InsufficientCreditsError extends Error {
  constructor(public balance: number, public bet: number) {
    super(`Insufficient demo credits: balance ${balance}, bet ${bet}`);
  }
}

export interface LedgerEntry {
  type: 'bet' | 'win' | 'reset';
  amount: number;
  balance: number;
}

export class Wallet {
  private _balance: number;
  totalWagered = 0;
  totalWon = 0;
  readonly ledger: LedgerEntry[] = [];

  constructor(initial: number) {
    if (!Number.isInteger(initial) || initial < 0) throw new Error('Initial balance must be a non-negative integer');
    this._balance = initial;
  }

  get balance() {
    return this._balance;
  }

  canAfford(bet: number) {
    return this._balance >= bet;
  }

  debit(bet: number) {
    if (!Number.isInteger(bet) || bet <= 0) throw new Error(`Invalid bet ${bet}`);
    if (!this.canAfford(bet)) throw new InsufficientCreditsError(this._balance, bet);
    this._balance -= bet;
    this.totalWagered += bet;
    this.record({ type: 'bet', amount: -bet, balance: this._balance });
  }

  credit(amount: number) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error(`Invalid credit ${amount}`);
    if (amount === 0) return;
    this._balance += amount;
    this.totalWon += amount;
    this.record({ type: 'win', amount, balance: this._balance });
  }

  reset(amount: number) {
    this._balance = amount;
    this.totalWagered = 0;
    this.totalWon = 0;
    this.ledger.length = 0;
    this.record({ type: 'reset', amount, balance: amount });
  }

  private record(e: LedgerEntry) {
    this.ledger.push(e);
    if (this.ledger.length > 500) this.ledger.shift();
  }
}
