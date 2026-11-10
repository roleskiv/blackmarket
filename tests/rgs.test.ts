import { beforeEach, describe, expect, it } from 'vitest';
import { MODELS } from '../src/engine/models';
import { SeededRng } from '../src/engine/rng';
import { verifyRound } from '../src/engine/round';
import { JURISDICTIONS } from '../src/rgs/jurisdictions';
import { MemoryRoundStore, MemoryWallet } from '../src/rgs/memory';
import { GameServer, recordDigestInput, sha256Hex } from '../src/rgs/server';
import { GameError } from '../src/rgs/types';

const model = MODELS['bm2-96'];
const BETS = [20, 100, 200, 1000];

function setup(jur = 'intl', balance = 100_000) {
  let now = 1_700_000_000_000;
  let id = 0;
  const wallet = new MemoryWallet(undefined, balance);
  const store = new MemoryRoundStore();
  const server = new GameServer({
    wallet,
    store,
    rng: new SeededRng(11),
    now: () => now,
    newId: () => `id-${++id}`,
    config: {
      model,
      jurisdiction: JURISDICTIONS[jur],
      currency: { code: 'EUR', decimals: 2 },
      betLevels: BETS,
      defaultBet: 100,
      sessionTtlMs: 60_000,
    },
  });
  return { server, wallet, store, advance: (ms: number) => (now += ms) };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof GameError ? e.code : `unexpected:${String(e)}`;
  }
  return 'ok';
};

describe('game server money flow', () => {
  let ctx: ReturnType<typeof setup>;
  let sessionId: string;
  beforeEach(async () => {
    ctx = setup();
    sessionId = (await ctx.server.openSession('p1')).sessionId;
  });

  it('debits the stake, credits the win and reports the balance', async () => {
    let expected = 100_000;
    for (let i = 0; i < 200; i++) {
      const { round, balance } = await ctx.server.play({ sessionId, requestId: `r${i}`, mode: 'spin', bet: 100 });
      expected += round.win - 100;
      expect(balance).toBe(expected);
      expect(round.status).toBe('settled');
      expect(round.win).toBe(round.outcome.totalCoins * 5);
      expect(Number.isInteger(round.win)).toBe(true);
      expect(verifyRound(model, round.outcome).ok).toBe(true);
    }
    expect(await ctx.wallet.balance('p1')).toBe(expected);
  });

  it('charges the buy price for a bought round', async () => {
    const { round, balance } = await ctx.server.play({ sessionId, requestId: 'b1', mode: 'buy', bet: 100 });
    expect(round.stake).toBe(100 * model.buyPriceBets);
    expect(round.outcome.steps.length).toBeGreaterThan(1);
    expect(balance).toBe(100_000 - round.stake + round.win);
  });

  it('is idempotent on requestId', async () => {
    const a = await ctx.server.play({ sessionId, requestId: 'same', mode: 'spin', bet: 100 });
    const b = await ctx.server.play({ sessionId, requestId: 'same', mode: 'spin', bet: 100 });
    expect(b.round.roundId).toBe(a.round.roundId);
    expect(b.balance).toBe(a.balance);
    expect(ctx.store.records.length).toBe(1);
  });

  it('rejects bad requests without touching the wallet', async () => {
    const play = (o: object) => ctx.server.play({ sessionId, requestId: 'x', mode: 'spin', bet: 100, ...o } as never);
    expect(await code(play({ bet: 30 }))).toBe('INVALID_BET');
    expect(await code(play({ bet: -100 }))).toBe('INVALID_BET');
    expect(await code(play({ mode: 'gift' }))).toBe('INVALID_REQUEST');
    expect(await code(play({ requestId: '' }))).toBe('INVALID_REQUEST');
    expect(await code(play({ sessionId: 'nope' }))).toBe('SESSION_NOT_FOUND');
    expect(await ctx.wallet.balance('p1')).toBe(100_000);
    expect(ctx.store.records.length).toBe(0);
  });

  it('refuses a stake the player cannot cover', async () => {
    const poor = setup('intl', 50);
    const s = (await poor.server.openSession('p')).sessionId;
    expect(await code(poor.server.play({ sessionId: s, requestId: 'a', mode: 'spin', bet: 100 }))).toBe('INSUFFICIENT_FUNDS');
    expect(await poor.wallet.balance('p')).toBe(50);
    expect(poor.store.records.length).toBe(0);
  });

  it('expires idle sessions', async () => {
    ctx.advance(61_000);
    expect(await code(ctx.server.play({ sessionId, requestId: 'late', mode: 'spin', bet: 100 }))).toBe('SESSION_EXPIRED');
  });

  it('a wallet outage on debit takes no money and records nothing', async () => {
    ctx.wallet.failNext.debit = 1;
    expect(await code(ctx.server.play({ sessionId, requestId: 'o1', mode: 'spin', bet: 100 }))).toBe('WALLET_UNAVAILABLE');
    expect(await ctx.wallet.balance('p1')).toBe(100_000);
    expect(ctx.store.records.length).toBe(0);
  });

  it('a wallet outage on credit keeps the outcome and pays it on reconcile', async () => {
    // Find a winning round, then replay the same RNG state with the credit failing.
    const probe = setup();
    const ps = (await probe.server.openSession('p1')).sessionId;
    let n = 0;
    for (;;) {
      const r = await probe.server.play({ sessionId: ps, requestId: `p${n}`, mode: 'spin', bet: 100 });
      n++;
      if (r.round.win > 0) break;
    }
    for (let i = 0; i < n - 1; i++) await ctx.server.play({ sessionId, requestId: `p${i}`, mode: 'spin', bet: 100 });
    const before = await ctx.wallet.balance('p1');
    ctx.wallet.failNext.credit = 1;
    const { round } = await ctx.server.play({ sessionId, requestId: 'win', mode: 'spin', bet: 100 });
    expect(round.win).toBeGreaterThan(0);
    expect(round.status).toBe('open');
    expect(await ctx.wallet.balance('p1')).toBe(before - 100);
    // Opening a session settles it, exactly once.
    await ctx.server.openSession('p1');
    expect(await ctx.wallet.balance('p1')).toBe(before - 100 + round.win);
    await ctx.server.openSession('p1');
    expect(await ctx.wallet.balance('p1')).toBe(before - 100 + round.win);
    expect((await ctx.store.get(round.roundId))!.status).toBe('settled');
  });

  it('returns an unseen round when the player comes back, until it is acknowledged', async () => {
    const { round } = await ctx.server.play({ sessionId, requestId: 'r', mode: 'spin', bet: 100 });
    const again = await ctx.server.openSession('p1');
    expect(again.pendingRound?.roundId).toBe(round.roundId);
    await ctx.server.ack(again.sessionId, round.roundId);
    expect((await ctx.server.openSession('p1')).pendingRound).toBeNull();
    const other = await ctx.server.openSession('p2');
    expect(await code(ctx.server.ack(other.sessionId, round.roundId))).toBe('ROUND_NOT_FOUND');
  });

  it('chains records by hash', async () => {
    for (let i = 0; i < 5; i++) await ctx.server.play({ sessionId, requestId: `h${i}`, mode: 'spin', bet: 20 });
    let prev = '';
    for (const r of ctx.store.records) {
      expect(r.prevHash).toBe(prev);
      expect(r.hash).toBe(await sha256Hex(recordDigestInput(r)));
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
      prev = r.hash;
    }
    const forged = { ...ctx.store.records[2], win: 999_999 };
    expect(await sha256Hex(recordDigestInput(forged))).not.toBe(forged.hash);
  });

  it('lists history newest first, per player', async () => {
    for (let i = 0; i < 3; i++) await ctx.server.play({ sessionId, requestId: `a${i}`, mode: 'spin', bet: 20 });
    const p2 = (await ctx.server.openSession('p2')).sessionId;
    await ctx.server.play({ sessionId: p2, requestId: 'z', mode: 'spin', bet: 20 });
    const h = await ctx.server.history(sessionId, 10);
    expect(h.map((r) => r.requestId)).toEqual(['a2', 'a1', 'a0']);
  });
});

describe('jurisdiction rules are enforced by the server', () => {
  it('UK profile: no feature buy, stake ceiling, minimum game cycle', async () => {
    const ctx = setup('uk');
    const info = await ctx.server.openSession('p1');
    expect(info.game.jurisdiction.autoplay.enabled).toBe(false);
    expect(info.game.betLevels).toEqual([20, 100, 200]);
    const s = info.sessionId;
    expect(await code(ctx.server.play({ sessionId: s, requestId: 'b', mode: 'buy', bet: 100 }))).toBe('FEATURE_NOT_AVAILABLE');
    expect(await code(ctx.server.play({ sessionId: s, requestId: 'c', mode: 'spin', bet: 1000 }))).toBe('INVALID_BET');
    expect(await code(ctx.server.play({ sessionId: s, requestId: '1', mode: 'spin', bet: 100 }))).toBe('ok');
    ctx.advance(1000);
    expect(await code(ctx.server.play({ sessionId: s, requestId: '2', mode: 'spin', bet: 100 }))).toBe('TOO_FAST');
    ctx.advance(1600);
    expect(await code(ctx.server.play({ sessionId: s, requestId: '2', mode: 'spin', bet: 100 }))).toBe('ok');
  });

  it('rejects bet tables that cannot be paid in whole minor units', () => {
    expect(
      () =>
        new GameServer({
          wallet: new MemoryWallet(),
          store: new MemoryRoundStore(),
          rng: new SeededRng(1),
          now: Date.now,
          newId: () => 'x',
          config: {
            model,
            jurisdiction: JURISDICTIONS.intl,
            currency: { code: 'EUR', decimals: 2 },
            betLevels: [25],
            defaultBet: 25,
            sessionTtlMs: 1,
          },
        }),
    ).toThrow(/multiple of 20/);
  });
});
