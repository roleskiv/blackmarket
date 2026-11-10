import type { RoundMode, RoundOutcome } from '../engine/round';
import type { JurisdictionProfile } from './jurisdictions';

/** All money values are integers in the currency's minor unit. */
export type Minor = number;

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'INVALID_BET'
  | 'FEATURE_NOT_AVAILABLE'
  | 'TOO_FAST'
  | 'INSUFFICIENT_FUNDS'
  | 'WALLET_UNAVAILABLE'
  | 'ROUND_NOT_FOUND'
  | 'INTERNAL';

export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * Operator wallet. Every call carries a transaction id and must be
 * idempotent on it: repeating a call with the same id returns the same
 * result without moving money twice.
 */
export interface Wallet {
  balance(playerId: string): Promise<Minor>;
  debit(playerId: string, amount: Minor, txId: string, roundId: string): Promise<Minor>;
  credit(playerId: string, amount: Minor, txId: string, roundId: string): Promise<Minor>;
  /** Reverses a debit. Used only when a round could not be created. */
  rollback(playerId: string, txId: string): Promise<Minor>;
}

export type RoundStatus =
  /** Stake taken and outcome stored; win not yet confirmed by the wallet. */
  | 'open'
  /** Win credited (or nothing to credit). */
  | 'settled';

export interface RoundRecord {
  roundId: string;
  playerId: string;
  sessionId: string;
  requestId: string;
  gameId: string;
  gameVersion: string;
  modelId: string;
  currency: string;
  mode: RoundMode;
  /** Total bet in minor units. */
  bet: Minor;
  /** Amount debited: the bet, or the feature-buy price. */
  stake: Minor;
  win: Minor;
  outcome: RoundOutcome;
  createdAt: string;
  /** Hash of the previous record in this store, forming a tamper-evident chain. */
  prevHash: string;
  hash: string;
  status: RoundStatus;
  /** Set once the client reports the round was shown to the end. */
  presented: boolean;
  /** Player balance after settlement (after the debit while open). */
  balanceAfter: Minor;
}

export interface RoundStore {
  /** Hash of the newest record, or '' for an empty store. */
  head(): Promise<string>;
  append(record: RoundRecord): Promise<void>;
  update(roundId: string, patch: Partial<Pick<RoundRecord, 'status' | 'presented' | 'balanceAfter'>>): Promise<void>;
  get(roundId: string): Promise<RoundRecord | undefined>;
  findByRequest(playerId: string, requestId: string): Promise<RoundRecord | undefined>;
  /** Newest first. */
  listByPlayer(playerId: string, limit: number): Promise<RoundRecord[]>;
  listOpen(playerId: string): Promise<RoundRecord[]>;
}

export interface PublicGameInfo {
  gameId: string;
  gameVersion: string;
  modelId: string;
  rtpLabel: string;
  buyRtpLabel: string;
  currency: { code: string; decimals: number };
  betLevels: Minor[];
  defaultBet: Minor;
  pays: number[][];
  scatterPays: number[];
  freeSpinsAward: number[];
  buyPriceBets: number;
  maxWinBets: number;
  maxMultiplier: number;
  maxFreeSpins: number;
  /** Reel strips, so the client can show true neighbours while spinning. */
  strips: { base: number[][]; free: number[][] };
  jurisdiction: JurisdictionProfile;
}

export interface SessionInfo {
  sessionId: string;
  playerId: string;
  balance: Minor;
  game: PublicGameInfo;
  /** A round the player has paid for but not yet seen to the end. */
  pendingRound: RoundRecord | null;
}

export interface PlayRequest {
  sessionId: string;
  /** Client-generated id; repeating it returns the original round. */
  requestId: string;
  mode: RoundMode;
  bet: Minor;
}

export interface PlayResult {
  round: RoundRecord;
  /** Balance after the stake was taken and the win credited. */
  balance: Minor;
}

/** What the game client talks to: a remote RGS or the in-browser demo server. */
export interface GameService {
  open(): Promise<SessionInfo>;
  play(req: Omit<PlayRequest, 'sessionId'>): Promise<PlayResult>;
  ack(roundId: string): Promise<void>;
  history(limit: number): Promise<RoundRecord[]>;
  /** Demo only: top the balance back up. Absent on real-money services. */
  resetDemoBalance?(): Promise<Minor>;
}
