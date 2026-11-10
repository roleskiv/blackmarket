/**
 * End-to-end check of the reference RGS over real HTTP: session, play,
 * idempotent retry, acknowledgement, history, the file-backed round log and
 * the audit endpoint that recomputes a stored round.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 18000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'bm-rgs-'));
const log = join(dir, 'rounds.jsonl');
let proc: ChildProcess;

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

beforeAll(async () => {
  proc = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
    env: { ...process.env, PORT: String(PORT), ROUND_LOG: log, DEMO_BALANCE: '100000' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE + '/healthz')).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}, 30_000);

afterAll(() => {
  proc?.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('reference RGS over HTTP', () => {
  it('plays, retries idempotently, acknowledges and audits a round', async () => {
    const open = await call('POST', '/api/session/open', { playerId: 'alice' });
    expect(open.status).toBe(200);
    expect(open.data.balance).toBe(100000);
    expect(open.data.pendingRound).toBeNull();
    const sessionId = open.data.sessionId as string;

    const req = { sessionId, requestId: 'req-1', mode: 'spin', bet: 100 };
    const first = await call('POST', '/api/round/play', req);
    expect(first.status).toBe(200);
    const round = first.data.round;
    expect(first.data.balance).toBe(100000 - 100 + round.win);

    // Same requestId: the original round comes back and nothing is charged twice.
    const retry = await call('POST', '/api/round/play', req);
    expect(retry.data.round.roundId).toBe(round.roundId);
    expect(retry.data.balance).toBe(first.data.balance);

    // A fresh session before the ack sees the round as pending.
    const reopened = await call('POST', '/api/session/open', { playerId: 'alice' });
    expect(reopened.data.pendingRound?.roundId).toBe(round.roundId);

    expect((await call('POST', '/api/round/ack', { sessionId, roundId: round.roundId })).status).toBe(200);
    const history = await call('GET', `/api/history?sessionId=${sessionId}&limit=10`);
    expect(history.data.rounds).toHaveLength(1);
    expect(history.data.rounds[0].presented).toBe(true);

    const audit = await call('GET', `/api/audit/rounds/${round.roundId}`);
    expect(audit.data.outcomeVerified).toBe(true);
    expect(audit.data.hashOk).toBe(true);

    // The round log on disk holds the round.
    expect(readFileSync(log, 'utf8')).toContain(round.roundId);
  });

  it('rejects bad input with typed errors', async () => {
    const { data } = await call('POST', '/api/session/open', { playerId: 'bob' });
    const sessionId = data.sessionId as string;
    const badBet = await call('POST', '/api/round/play', { sessionId, requestId: 'x1', mode: 'spin', bet: 7 });
    expect(badBet.status).toBe(400);
    expect(badBet.data.error).toBe('INVALID_BET');
    const noSession = await call('POST', '/api/round/play', { sessionId: 'nope', requestId: 'x2', mode: 'spin', bet: 100 });
    expect(noSession.status).toBe(401);
    expect((await call('POST', '/api/session/open', { playerId: '../etc' })).status).toBe(400);
    expect((await call('GET', '/api/audit/rounds/unknown')).status).toBe(404);
  });
});
