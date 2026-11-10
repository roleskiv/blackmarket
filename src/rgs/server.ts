/**
 * Game server core. Platform-neutral: the Node HTTP server (src/server) and
 * the in-browser demo service both wrap this class, so the money flow that is
 * tested is the money flow that ships.
 *
 * Round lifecycle
 *   1. debit stake          (wallet, idempotent on "<roundId>:debit")
 *   2. resolve outcome      (engine + RNG, pure)
 *   3. persist record       (status "open", hash-chained)
 *   4. credit win           (wallet, idempotent on "<roundId>:credit")
 *   5. mark "settled"
 * A failure before step 3 rolls the debit back. A failure after step 3 never
 * discards the outcome: the round stays "open" and is settled by reconcile(),
 * which runs whenever the player opens a session.
 */
import { BET_COINS, type MathModel } from '../engine/model';
import type { Rng } from '../engine/rng';
import { resolveRound } from '../engine/round';
import type { JurisdictionProfile } from './jurisdictions';
import {
  GameError,
  type Minor,
  type PlayRequest,
  type PlayResult,
  type PublicGameInfo,
  type RoundRecord,
  type RoundStore,
  type SessionInfo,
  type Wallet,
} from './types';

export const GAME_ID = 'black-market';
export const GAME_VERSION = '2.0.0';

export interface OperatorConfig {
  model: MathModel;
  jurisdiction: JurisdictionProfile;
  currency: { code: string; decimals: number };
  /** Selectable total bets in minor units. Each must be a multiple of 20. */
  betLevels: Minor[];
  defaultBet: Minor;
  /** Idle time after which a session is refused, in milliseconds. */
  sessionTtlMs: number;
}

export interface ServerDeps {
  wallet: Wallet;
  store: RoundStore;
  rng: Rng;
  now: () => number;
  newId: () => string;
  config: OperatorConfig;
}

interface Session {
  sessionId: string;
  playerId: string;
  lastSeen: number;
  lastPlayAt: number;
  busy: boolean;
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The immutable part of a record, in a fixed field order, for hashing. */
export function recordDigestInput(r: RoundRecord): string {
  return JSON.stringify([
    r.prevHash,
    r.roundId,
    r.playerId,
    r.sessionId,
    r.requestId,
    r.gameId,
    r.gameVersion,
    r.modelId,
    r.currency,
    r.mode,
    r.bet,
    r.stake,
    r.win,
    r.createdAt,
    r.outcome,
  ]);
}

export class GameServer {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly deps: ServerDeps) {
    const { betLevels, defaultBet, jurisdiction } = deps.config;
    for (const b of betLevels) {
      if (!Number.isInteger(b) || b <= 0 || b % BET_COINS !== 0) {
        throw new Error(`Bet level ${b} is not a positive multiple of ${BET_COINS} minor units`);
      }
    }
    if (!this.allowedBets().includes(defaultBet)) throw new Error('Default bet is not an allowed bet level');
    void jurisdiction;
  }

  private allowedBets(): Minor[] {
    const { betLevels, jurisdiction } = this.deps.config;
    const cap = jurisdiction.maxBetMinor;
    return cap === null ? betLevels : betLevels.filter((b) => b <= cap);
  }

  gameInfo(): PublicGameInfo {
    const { model, jurisdiction, currency, defaultBet } = this.deps.config;
    return {
      gameId: GAME_ID,
      gameVersion: GAME_VERSION,
      modelId: model.id,
      rtpLabel: model.rtpLabel,
      buyRtpLabel: model.buyRtpLabel,
      currency,
      betLevels: this.allowedBets(),
      defaultBet,
      pays: model.pays,
      scatterPays: model.scatterPays,
      freeSpinsAward: model.freeSpinsAward,
      buyPriceBets: model.buyPriceBets,
      maxWinBets: model.maxWinBets,
      maxMultiplier: model.maxMultiplier,
      maxFreeSpins: model.maxFreeSpins,
      strips: { base: model.base.strips, free: model.free.strips },
      jurisdiction,
    };
  }

  /** Opens a session for an authenticated player (authentication is the operator's job). */
  async openSession(playerId: string): Promise<SessionInfo> {
    if (!playerId) throw new GameError('INVALID_REQUEST', 'playerId required');
    await this.reconcile(playerId);
    const sessionId = this.deps.newId();
    const now = this.deps.now();
    this.sessions.set(sessionId, { sessionId, playerId, lastSeen: now, lastPlayAt: -Infinity, busy: false });
    const recent = await this.deps.store.listByPlayer(playerId, 1);
    const pending = recent[0] && !recent[0].presented ? recent[0] : null;
    return {
      sessionId,
      playerId,
      balance: await this.deps.wallet.balance(playerId),
      game: this.gameInfo(),
      pendingRound: pending,
    };
  }

  private session(sessionId: string): Session {
    const s = this.sessions.get(sessionId);
    if (!s) throw new GameError('SESSION_NOT_FOUND');
    const now = this.deps.now();
    if (now - s.lastSeen > this.deps.config.sessionTtlMs) {
      this.sessions.delete(sessionId);
      throw new GameError('SESSION_EXPIRED');
    }
    s.lastSeen = now;
    return s;
  }

  async play(req: PlayRequest): Promise<PlayResult> {
    if (!req || typeof req.requestId !== 'string' || !req.requestId || req.requestId.length > 64) {
      throw new GameError('INVALID_REQUEST', 'requestId required');
    }
    const s = this.session(req.sessionId);
    const { store, wallet, config } = this.deps;

    // Idempotency: a repeated request returns the original round.
    const existing = await store.findByRequest(s.playerId, req.requestId);
    if (existing) return { round: existing, balance: await wallet.balance(s.playerId) };

    if (req.mode !== 'spin' && req.mode !== 'buy') throw new GameError('INVALID_REQUEST', 'unknown mode');
    if (!this.allowedBets().includes(req.bet)) throw new GameError('INVALID_BET');
    if (req.mode === 'buy' && !config.jurisdiction.featureBuy) throw new GameError('FEATURE_NOT_AVAILABLE');
    if (s.busy) throw new GameError('TOO_FAST', 'a round is already in progress');
    const now = this.deps.now();
    if (now - s.lastPlayAt < config.jurisdiction.minSpinMs) throw new GameError('TOO_FAST');

    s.busy = true;
    try {
      const roundId = this.deps.newId();
      const stake = req.mode === 'buy' ? req.bet * config.model.buyPriceBets : req.bet;
      const debitTx = `${roundId}:debit`;
      let balance: Minor;
      try {
        balance = await wallet.debit(s.playerId, stake, debitTx, roundId);
      } catch (e) {
        if (e instanceof GameError) throw e;
        throw new GameError('WALLET_UNAVAILABLE');
      }

      let record: RoundRecord;
      try {
        const outcome = resolveRound(config.model, this.deps.rng, req.mode);
        const coinValue = req.bet / BET_COINS;
        record = {
          roundId,
          playerId: s.playerId,
          sessionId: s.sessionId,
          requestId: req.requestId,
          gameId: GAME_ID,
          gameVersion: GAME_VERSION,
          modelId: config.model.id,
          currency: config.currency.code,
          mode: req.mode,
          bet: req.bet,
          stake,
          win: outcome.totalCoins * coinValue,
          outcome,
          createdAt: new Date(now).toISOString(),
          prevHash: await store.head(),
          hash: '',
          status: 'open',
          presented: false,
          balanceAfter: balance,
        };
        record.hash = await sha256Hex(recordDigestInput(record));
        await store.append(record);
      } catch (e) {
        // Nothing was recorded, so the stake goes back.
        await wallet.rollback(s.playerId, debitTx).catch(() => undefined);
        throw e instanceof GameError ? e : new GameError('INTERNAL');
      }

      s.lastPlayAt = now;
      const settled = await this.settle(record);
      return { round: settled, balance: settled.balanceAfter };
    } finally {
      s.busy = false;
    }
  }

  /** Credits the win of an open round. Safe to repeat. */
  private async settle(record: RoundRecord): Promise<RoundRecord> {
    const { wallet, store } = this.deps;
    let balance: Minor;
    try {
      balance =
        record.win > 0
          ? await wallet.credit(record.playerId, record.win, `${record.roundId}:credit`, record.roundId)
          : await wallet.balance(record.playerId);
    } catch {
      // The outcome stands. It is shown to the player and paid on reconcile.
      return record;
    }
    await store.update(record.roundId, { status: 'settled', balanceAfter: balance });
    return { ...record, status: 'settled', balanceAfter: balance };
  }

  /** Settles any rounds left open by a wallet outage. */
  async reconcile(playerId: string): Promise<number> {
    const open = await this.deps.store.listOpen(playerId);
    let done = 0;
    for (const r of open) if ((await this.settle(r)).status === 'settled') done++;
    return done;
  }

  async ack(sessionId: string, roundId: string): Promise<void> {
    const s = this.session(sessionId);
    const r = await this.deps.store.get(roundId);
    if (!r || r.playerId !== s.playerId) throw new GameError('ROUND_NOT_FOUND');
    if (!r.presented) await this.deps.store.update(roundId, { presented: true });
  }

  async history(sessionId: string, limit = 50): Promise<RoundRecord[]> {
    const s = this.session(sessionId);
    return this.deps.store.listByPlayer(s.playerId, Math.max(1, Math.min(200, limit | 0)));
  }

  async balance(sessionId: string): Promise<Minor> {
    return this.deps.wallet.balance(this.session(sessionId).playerId);
  }
}
