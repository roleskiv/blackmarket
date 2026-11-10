/**
 * Reference Remote Game Server (RGS) for BLACK MARKET.
 *
 *   npm run server            # http://localhost:8787, serves dist/ if built
 *
 * Environment
 *   PORT=8787
 *   MODEL=bm2-96              RTP variant (see src/engine/models)
 *   JURISDICTION=intl         intl | uk | de (see src/rgs/jurisdictions.ts)
 *   CURRENCY=EUR
 *   ROUND_LOG=data/rounds.jsonl
 *   DEMO_BALANCE=500000       opening balance (minor units) of the built-in demo wallet
 *   CORS_ORIGIN=              allowed origin for a separately hosted client
 *
 * What an operator replaces before going live: authenticate() (validate the
 * launch token with the platform), the Wallet (call the platform's wallet
 * API) and the RoundStore (the platform's database). Nothing in src/engine
 * or src/rgs/server.ts changes. See docs/INTEGRATION.md.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { CryptoRng } from '../engine/rng';
import { MODELS } from '../engine/models';
import { verifyRound } from '../engine/round';
import { JURISDICTIONS } from '../rgs/jurisdictions';
import { MemoryWallet } from '../rgs/memory';
import { GameServer, recordDigestInput, sha256Hex } from '../rgs/server';
import { GameError, type ErrorCode } from '../rgs/types';
import { FileRoundStore } from './fileStore';

const env = process.env;
const model = MODELS[env.MODEL ?? 'bm2-96'];
const jurisdiction = JURISDICTIONS[env.JURISDICTION ?? 'intl'];
if (!model) throw new Error(`Unknown MODEL ${env.MODEL}`);
if (!jurisdiction) throw new Error(`Unknown JURISDICTION ${env.JURISDICTION}`);

const store = new FileRoundStore(resolve(env.ROUND_LOG ?? 'data/rounds.jsonl'));
const wallet = new MemoryWallet(undefined, Number(env.DEMO_BALANCE ?? 500000));
const game = new GameServer({
  wallet,
  store,
  rng: new CryptoRng(),
  now: Date.now,
  newId: randomUUID,
  config: {
    model,
    jurisdiction,
    currency: { code: env.CURRENCY ?? 'EUR', decimals: 2 },
    betLevels: [20, 40, 60, 80, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000],
    defaultBet: 100,
    sessionTtlMs: 30 * 60 * 1000,
  },
});

/**
 * Demo authentication: trusts the playerId in the request. A real
 * integration validates the operator's launch token here and returns the
 * platform's player id.
 */
async function authenticate(body: { playerId?: unknown; token?: unknown }): Promise<string> {
  const id = typeof body.playerId === 'string' ? body.playerId : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new GameError('INVALID_REQUEST', 'playerId required');
  return id;
}

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_BET: 400,
  FEATURE_NOT_AVAILABLE: 403,
  SESSION_NOT_FOUND: 401,
  SESSION_EXPIRED: 401,
  TOO_FAST: 429,
  INSUFFICIENT_FUNDS: 402,
  WALLET_UNAVAILABLE: 503,
  ROUND_NOT_FOUND: 404,
  INTERNAL: 500,
};

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 16 * 1024) throw new GameError('INVALID_REQUEST', 'body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new GameError('INVALID_REQUEST', 'invalid JSON');
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};
const DIST = resolve('dist');

function serveStatic(pathname: string, res: ServerResponse): boolean {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\]|\.\.)+/, '');
  let file = join(DIST, rel || 'index.html');
  if (!file.startsWith(DIST)) return false;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return false;
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
  return true;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  if (env.CORS_ORIGIN) {
    res.setHeader('access-control-allow-origin', env.CORS_ORIGIN);
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
  }
  try {
    if (path === '/healthz') return send(res, 200, { ok: true, game: game.gameInfo().gameId, model: model.id });

    if (req.method === 'POST' && path === '/api/session/open') {
      const body = await readJson(req);
      return send(res, 200, await game.openSession(await authenticate(body)));
    }
    if (req.method === 'POST' && path === '/api/round/play') {
      const b = await readJson(req);
      const result = await game.play({
        sessionId: str(b.sessionId),
        requestId: str(b.requestId),
        mode: b.mode as 'spin' | 'buy',
        bet: Number(b.bet),
      });
      return send(res, 200, result);
    }
    if (req.method === 'POST' && path === '/api/round/ack') {
      const b = await readJson(req);
      await game.ack(str(b.sessionId), str(b.roundId));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && path === '/api/history') {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      return send(res, 200, { rounds: await game.history(url.searchParams.get('sessionId') ?? '', limit) });
    }
    // Back-office audit: recompute a stored round from its recorded stops.
    const audit = /^\/api\/audit\/rounds\/([A-Za-z0-9-]{1,64})$/.exec(path);
    if (req.method === 'GET' && audit) {
      const r = await store.get(audit[1]);
      if (!r) throw new GameError('ROUND_NOT_FOUND');
      const recomputed = verifyRound(MODELS[r.modelId], r.outcome);
      const hashOk = (await sha256Hex(recordDigestInput(r))) === r.hash;
      return send(res, 200, { round: r, outcomeVerified: recomputed.ok, reason: recomputed.reason, hashOk });
    }
    if (req.method === 'GET' && serveStatic(path, res)) return;
    send(res, 404, { error: 'NOT_FOUND' });
  } catch (e) {
    if (e instanceof GameError) return send(res, STATUS[e.code], { error: e.code, message: e.message });
    console.error(e);
    send(res, 500, { error: 'INTERNAL' });
  }
});

const port = Number(env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`BLACK MARKET RGS on http://localhost:${port}  model=${model.id} (${model.rtpLabel})  jurisdiction=${jurisdiction.id}`);
  if (!existsSync(DIST)) console.log('dist/ not found: run "npm run build" to serve the client from this server.');
});
