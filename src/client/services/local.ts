/**
 * In-browser demo service. It runs the very same GameServer class as the
 * Node RGS, with a play-money wallet and a short round history kept in
 * localStorage, so the static demo exercises the real money flow, round
 * recovery and audit records. No real money can be involved.
 */
import { MODELS, DEFAULT_MODEL_ID } from '../../engine/models';
import { CryptoRng, ScriptedRng, SeededRng, type Rng } from '../../engine/rng';
import { JURISDICTIONS } from '../../rgs/jurisdictions';
import { MemoryRoundStore, MemoryWallet, type MemoryWalletState } from '../../rgs/memory';
import { GameServer } from '../../rgs/server';
import type { GameService, Minor, PlayRequest, PlayResult, RoundRecord, SessionInfo } from '../../rgs/types';

const PLAYER = 'demo-player';
const OPENING_BALANCE = 500_000; // 5,000.00 demo credits
const STORAGE_KEY = 'blackmarket.demo.v2';

interface Persisted {
  wallet: MemoryWalletState;
  rounds: RoundRecord[];
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

/** RNG whose next draws can be scripted from the QA console. */
class DemoRng implements Rng {
  private scripted: ScriptedRng | null = null;
  constructor(private readonly inner: Rng) {}
  force(draws: number[]): void {
    this.scripted = new ScriptedRng(draws, this.inner);
  }
  nextInt(n: number): number {
    return (this.scripted ?? this.inner).nextInt(n);
  }
  clear(): void {
    this.scripted = null;
  }
}

export interface LocalOptions {
  model?: string;
  jurisdiction?: string;
  seed?: number;
}

export class LocalService implements GameService {
  private readonly server: GameServer;
  private readonly wallet: MemoryWallet;
  private readonly rng: DemoRng;
  private sessionId = '';

  constructor(opts: LocalOptions = {}) {
    const saved = load();
    let counter = 0;
    const state: Persisted = {
      wallet: saved?.wallet ?? { balances: {}, tx: {} },
      rounds: saved?.rounds ?? [],
    };
    const save = () => {
      try {
        // Keep the idempotency ledger from growing without bound.
        const tx = Object.entries(state.wallet.tx).slice(-200);
        state.wallet.tx = Object.fromEntries(tx);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* storage unavailable: the demo still works for this visit */
      }
    };
    this.wallet = new MemoryWallet(state.wallet, OPENING_BALANCE, save);
    const store = new MemoryRoundStore(state.rounds, save, 50);
    this.rng = new DemoRng(opts.seed === undefined ? new CryptoRng() : new SeededRng(opts.seed));
    const model = MODELS[opts.model ?? ''] ?? MODELS[DEFAULT_MODEL_ID];
    const jurisdiction = JURISDICTIONS[opts.jurisdiction ?? ''] ?? JURISDICTIONS.intl;
    this.server = new GameServer({
      wallet: this.wallet,
      store,
      rng: this.rng,
      now: Date.now,
      newId: () =>
        globalThis.crypto?.randomUUID?.() ?? `r-${Date.now().toString(36)}-${(counter++).toString(36)}`,
      config: {
        model,
        jurisdiction,
        currency: { code: 'FUN', decimals: 2 },
        betLevels: [20, 40, 60, 80, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000],
        defaultBet: 100,
        sessionTtlMs: 12 * 60 * 60 * 1000,
      },
    });
  }

  async open(): Promise<SessionInfo> {
    const info = await this.server.openSession(PLAYER);
    this.sessionId = info.sessionId;
    return info;
  }

  async play(req: Omit<PlayRequest, 'sessionId'>): Promise<PlayResult> {
    try {
      return await this.server.play({ ...req, sessionId: this.sessionId });
    } finally {
      this.rng.clear();
    }
  }

  ack(roundId: string): Promise<void> {
    return this.server.ack(this.sessionId, roundId);
  }

  history(limit: number): Promise<RoundRecord[]> {
    return this.server.history(this.sessionId, limit);
  }

  async resetDemoBalance(): Promise<Minor> {
    this.wallet.set(PLAYER, OPENING_BALANCE);
    return OPENING_BALANCE;
  }

  /** QA hook: script the RNG draws of the next round (reel stops, then reveal). */
  forceNext(draws: number[]): void {
    this.rng.force(draws);
  }
}
