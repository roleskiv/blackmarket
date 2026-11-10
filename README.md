# BLACK MARKET

A 5×4, 1024-ways video slot with mystery Contraband Crates and a free-spin
feature, the Vault, whose multiplier grows with every Wild and never resets.

This repository is a complete hand-over package: the game client, the
outcome engine, a reference game server, the math tooling that derived and
verified the reel strips, and the documents a platform and a test lab ask
for.

> The hosted build runs in **demo mode with play credits only**. No real
> money is staked or won. The return figures here are calculations and
> simulations made by this repository's tooling and have **not** been
> certified by a test laboratory. See `docs/CERTIFICATION.md` for what a
> real-money release still needs.

## Quick start

```bash
npm install
npm run dev        # client with the built-in demo server, http://localhost:5173
npm test           # engine, math, money-flow and HTTP tests
npm run build      # production client in dist/
npm run server     # reference game server on :8787 (serves dist/ too)
npm run e2e        # browser end-to-end checks against dist/
```

Open `http://localhost:8787/?rgs=http://localhost:8787&player=demo` to play
the client against the reference server instead of the in-browser demo.

## What is where

| Path | What it is |
| --- | --- |
| `src/engine` | Rules, paytable, reel strips per RTP variant, RNGs, round resolution and replay verification. Pure TypeScript, no I/O. |
| `src/math` | Closed-form calculator (RTP, hit rate, feature value, buy value) and the Monte Carlo simulator. |
| `src/rgs` | Game server core: sessions, bet validation, wallet and round-store interfaces, idempotent money flow, recovery, jurisdiction profiles. |
| `src/server` | Node HTTP server around the core, with an append-only round log and an audit endpoint. |
| `src/client` | PixiJS (WebGL) presentation, DOM interface, synthesised audio. Replays server results; decides nothing. |
| `scripts` | Strip tuner, parallel simulator, PAR sheet generator, art renderer, browser end-to-end script. |
| `tests` | Vitest suites. |
| `docs` | Rules, PAR sheet, integration guide, compliance behaviour, readiness. |
| `art`, `public/assets` | Source SVG art and the shipped images. |

## The math, in one paragraph

Each variant is a set of physical reel strips for the base game and for the
Vault. `src/math/analytic.ts` computes the exact return of those strips: way
wins by per-reel polynomials, the Vault by dynamic programming over spins
left and multiplier, the hit rate by enumeration. The tests check that
calculator against a brute-force enumeration of every stop combination of a
small model, and the simulator plays the real engine hundreds of millions of
times as a second, independent check. `docs/PAR_SHEET.md` has the numbers.

```bash
npm run math:sim -- --model bm2-96 --mode spin --rounds 1e9 --out docs/par/bm2-96-spin.json
npm run math:par
npm run math:tune -- --from bm2-96 --id bm2-94 --target 0.941
```

## Documents

- [Game rules](docs/GAME_RULES.md)
- [PAR sheet](docs/PAR_SHEET.md)
- [Operator integration](docs/INTEGRATION.md)
- [Player protection and jurisdictions](docs/COMPLIANCE.md)
- [Readiness for real-money release](docs/CERTIFICATION.md)

## Art and sound

The fourteen symbol images are from a supplied pack and are addressed by file
name, so any of them can be replaced without code changes. Frame, logo,
backgrounds and the crate are drawn as SVG in `art/src` and rendered with
`npm run art`. Effects are procedural. All audio is synthesised at run time.
