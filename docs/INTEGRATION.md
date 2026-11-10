# Operator integration guide

BLACK MARKET is split so that an operator or aggregator replaces three small
adapters and touches nothing else.

```
 browser                         game server (RGS)                  operator platform
┌──────────────┐   HTTPS/JSON   ┌───────────────────────────┐      ┌───────────────┐
│ src/client   │ ─────────────▶ │ src/server/main.ts (HTTP) │      │               │
│ presentation │                │   authenticate()  ────────┼────▶ │ launch tokens │
│ only         │ ◀───────────── │ src/rgs/server.ts         │      │               │
└──────────────┘  round record  │   GameServer              │      │               │
                                │     Wallet        ────────┼────▶ │ wallet API    │
                                │     RoundStore    ────────┼────▶ │ database      │
                                │ src/engine (pure math)    │      │               │
                                └───────────────────────────┘      └───────────────┘
```

The client never decides an outcome and never holds a balance. It sends
"play this bet" and replays the round record that comes back.

## What you replace

| Adapter | Where | Reference implementation | What production needs |
| --- | --- | --- | --- |
| `authenticate()` | `src/server/main.ts` | trusts `playerId` in the request | validate the platform launch token, return the platform player id, apply player limits |
| `Wallet` | `src/rgs/types.ts` | `MemoryWallet` | calls to the platform wallet; every call idempotent on its transaction id |
| `RoundStore` | `src/rgs/types.ts` | `FileRoundStore` (append-only JSONL), `MemoryRoundStore` | a transactional database with a unique index on `(playerId, requestId)` |
| RNG | `src/engine/rng.ts` | `CryptoRng` over the runtime CSPRNG | the operator's or lab's certified RNG behind the same `Rng` interface |

Session state in the reference server is in process memory. Run a single
instance, or move sessions and the per-session play lock to shared storage before
scaling out.

## Round lifecycle

1. Debit the stake (`<roundId>:debit`).
2. Resolve the outcome (engine + RNG).
3. Persist the round as `open`, hash-chained to the previous record.
4. Credit the win (`<roundId>:credit`).
5. Mark the round `settled`.

A failure before step 3 rolls the debit back and the player is told no bet
was taken. A failure after step 3 never discards the outcome: the round stays
`open` and is settled the next time the player opens a session. A repeated
`requestId` returns the original round and moves no money. These paths are
covered in `tests/rgs.test.ts` and `tests/http.test.ts`.

## HTTP API

All bodies are JSON. Money is an integer in minor units.

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /api/session/open` | `{ playerId, token? }` | `SessionInfo`: session id, balance, game configuration, any unfinished round |
| `POST /api/round/play` | `{ sessionId, requestId, mode: "spin" \| "buy", bet }` | `{ round, balance }` |
| `POST /api/round/ack` | `{ sessionId, roundId }` | `{ ok: true }` once the client has shown the round to the end |
| `GET /api/history?sessionId=&limit=` | | `{ rounds }`, newest first |
| `GET /api/audit/rounds/:id` | | the stored round, whether its outcome recomputes, whether its hash is intact |
| `GET /healthz` | | `{ ok, game, model }` |

Errors are `{ error, message }` with one of: `INVALID_REQUEST` 400,
`INVALID_BET` 400, `SESSION_NOT_FOUND` 401, `SESSION_EXPIRED` 401,
`INSUFFICIENT_FUNDS` 402, `FEATURE_NOT_AVAILABLE` 403, `ROUND_NOT_FOUND` 404,
`TOO_FAST` 429, `WALLET_UNAVAILABLE` 503, `INTERNAL` 500.

The audit endpoint is a back-office tool. Put it behind operator
authentication before exposing the server.

## Configuration

Environment of the reference server: `PORT`, `MODEL` (RTP variant),
`JURISDICTION` (`intl`, `uk`, `de`), `CURRENCY`, `ROUND_LOG`, `DEMO_BALANCE`,
`CORS_ORIGIN`. Bet levels, default bet and session lifetime are in the
`OperatorConfig` passed to `GameServer`.

## Launching the client

Build with `npm run build` and host `dist/` anywhere; all paths are relative.

| Query parameter | Meaning |
| --- | --- |
| `rgs=https://host` | talk to that game server; without it the client runs the built-in demo server with play credits |
| `player=`, `token=` | passed to `/api/session/open` |
| `rtp=96\|94\|92`, `jur=intl\|uk\|de`, `seed=` | demo mode only: pick the variant, the jurisdiction profile and a fixed RNG seed |

## Replacing art and sound

Every bitmap is addressed by file name under `public/assets`. Drop a new file
with the same name and rebuild; no code changes. Interface art is drawn in
`art/src/*.svg` and rendered with `npm run art`. All sound is synthesised in
`src/client/audio/sound.ts` behind one small class, which is the single place
to swap in recorded audio.

## Translating

All player-facing text is in `src/client/ui/i18n.ts`, keyed. A language is a
second table with the same keys. Amounts, dates and times already follow the
browser locale.
