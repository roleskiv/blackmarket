/**
 * In-memory wallet and round store. They back the tests, the reference
 * server's demo mode and (with a persistence hook) the in-browser demo.
 * A production deployment replaces both with the operator's wallet API and
 * a durable database.
 */
import { GameError, type Minor, type RoundRecord, type RoundStore, type Wallet } from './types';

export interface MemoryWalletState {
  balances: Record<string, Minor>;
  /** txId → signed amount applied (negative for debits); 0 once rolled back. */
  tx: Record<string, number>;
}

export class MemoryWallet implements Wallet {
  /** Test hook: make the next N calls of a kind fail as a wallet outage. */
  failNext: { debit: number; credit: number } = { debit: 0, credit: 0 };

  constructor(
    readonly state: MemoryWalletState = { balances: {}, tx: {} },
    private readonly openingBalance: Minor = 0,
    private readonly onChange: () => void = () => undefined,
  ) {}

  private ensure(playerId: string): void {
    if (!(playerId in this.state.balances)) this.state.balances[playerId] = this.openingBalance;
  }

  async balance(playerId: string): Promise<Minor> {
    this.ensure(playerId);
    return this.state.balances[playerId];
  }

  async debit(playerId: string, amount: Minor, txId: string): Promise<Minor> {
    this.ensure(playerId);
    if (this.failNext.debit > 0) {
      this.failNext.debit--;
      throw new Error('wallet down');
    }
    if (!Number.isInteger(amount) || amount <= 0) throw new GameError('INVALID_REQUEST', 'bad amount');
    if (txId in this.state.tx) return this.state.balances[playerId];
    if (this.state.balances[playerId] < amount) throw new GameError('INSUFFICIENT_FUNDS');
    this.state.balances[playerId] -= amount;
    this.state.tx[txId] = -amount;
    this.onChange();
    return this.state.balances[playerId];
  }

  async credit(playerId: string, amount: Minor, txId: string): Promise<Minor> {
    this.ensure(playerId);
    if (this.failNext.credit > 0) {
      this.failNext.credit--;
      throw new Error('wallet down');
    }
    if (!Number.isInteger(amount) || amount < 0) throw new GameError('INVALID_REQUEST', 'bad amount');
    if (txId in this.state.tx) return this.state.balances[playerId];
    this.state.balances[playerId] += amount;
    this.state.tx[txId] = amount;
    this.onChange();
    return this.state.balances[playerId];
  }

  async rollback(playerId: string, txId: string): Promise<Minor> {
    this.ensure(playerId);
    const applied = this.state.tx[txId];
    if (applied) {
      this.state.balances[playerId] -= applied;
      this.state.tx[txId] = 0;
      this.onChange();
    }
    return this.state.balances[playerId];
  }

  /** Demo helper. */
  set(playerId: string, amount: Minor): void {
    this.state.balances[playerId] = amount;
    this.onChange();
  }
}

export class MemoryRoundStore implements RoundStore {
  constructor(
    readonly records: RoundRecord[] = [],
    private readonly onChange: () => void = () => undefined,
    /** Keep at most this many records (0 = unlimited). Demo stores trim; real ones never do. */
    private readonly keep = 0,
  ) {}

  async head(): Promise<string> {
    return this.records.length ? this.records[this.records.length - 1].hash : '';
  }

  async append(record: RoundRecord): Promise<void> {
    this.records.push(structuredClone(record));
    if (this.keep > 0 && this.records.length > this.keep) this.records.splice(0, this.records.length - this.keep);
    this.onChange();
  }

  async update(roundId: string, patch: Partial<RoundRecord>): Promise<void> {
    const r = this.records.find((x) => x.roundId === roundId);
    if (!r) throw new GameError('ROUND_NOT_FOUND');
    Object.assign(r, patch);
    this.onChange();
  }

  async get(roundId: string): Promise<RoundRecord | undefined> {
    const r = this.records.find((x) => x.roundId === roundId);
    return r && structuredClone(r);
  }

  async findByRequest(playerId: string, requestId: string): Promise<RoundRecord | undefined> {
    const r = this.records.find((x) => x.playerId === playerId && x.requestId === requestId);
    return r && structuredClone(r);
  }

  async listByPlayer(playerId: string, limit: number): Promise<RoundRecord[]> {
    const out: RoundRecord[] = [];
    for (let i = this.records.length - 1; i >= 0 && out.length < limit; i--) {
      if (this.records[i].playerId === playerId) out.push(structuredClone(this.records[i]));
    }
    return out;
  }

  async listOpen(playerId: string): Promise<RoundRecord[]> {
    return this.records.filter((r) => r.playerId === playerId && r.status === 'open').map((r) => structuredClone(r));
  }
}
