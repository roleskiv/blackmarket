# BLACK MARKET

An original 5×4, 25-line browser slot prototype set in a secret underground market for supernatural contraband, hosted by **The Dealer**.

> **Virtual demo credits only.** There are no deposits, withdrawals, wallets, crypto or real-money paths of any kind. Credits have no value.

```bash
npm install
npm run dev        # play locally
npm test           # unit tests + 100,000-spin simulation
npm run simulate   # longer simulation: npm run simulate -- 1000000 <seed>
npm run build      # production build in dist/ (relative paths, host anywhere)
```

Add `?seed=<number>` to the URL to play a deterministic, replayable session.

## Features

| | |
|---|---|
| **Reels** | 5 reels × 4 rows, 25 explicit fixed paylines (`src/config/paylines.ts`), left-to-right 3/4/5 of a kind |
| **Wild** | Substitutes for everything except the Scatter; reels 2–5; 3+ Wilds on a line pay as Wild |
| **Scatter** | Pays anywhere on total bet; 3/4/5 open the Dealer’s Vault for 10/12/20 free spins |
| **Black Market Crates** | Random modifier: Wild Contraband (2–4 wilds), Counterfeit Swap (suit → uncommon), Loaded Ledger (×2/×3/×5 line wins), Raven Column (full wild reel), Appraiser’s Eye (uncommon → premium) |
| **Dealer’s Hand** | The Dealer deals a premium symbol or Wild and points at a reel; every non-scatter symbol on it transforms |
| **Dealer’s Vault bonus** | Cinematic vault opening, free spins at the trigger bet, retriggers (+5), collectible contraband with persistent modifiers (Golden Ledger multiplier, Raven Feather wilds, Stolen Hourglass +2 spins, Eye Sigil suit upgrades), bonus summary |
| **Controls** | Bet ±, spin / slam-skip, auto-spin (10/25/50/100/∞ with stop), turbo, win counter, balance |
| **Settings** | Audio on/off, music & effects volume, turbo, reduced motion, spin history, reset demo balance (stored in `localStorage`) |
| **Accessibility** | Reduced-motion mode (no scrolling, shaking or particles), skip button / tap / Space to skip any long sequence |

## Architecture

```
src/
  config/      symbols.ts · paylines.ts · game.ts (bets, crates, hand, vault, artifacts) · visual.ts (timing)
  engine/      rng.ts · reels.ts · evaluate.ts · features.ts · bonus.ts · accounting.ts · spin.ts · game.ts · simulate.ts
  animations/  reelAnimation · winEffects · crateAnimation · dealerAnimation · vaultAnimation · fx (PixiJS particles) · skip
  components/  ReelGrid · SymbolImage · Dealer · Controls · TopBar · Overlays (crate/hand/vault) · Bonus · Panels · Backdrop · WinBanner
  audio/       AudioManager (Howler.js, silent fallback)
tests/         evaluate · features · engine (accounting, bonus transitions, replay, 100k simulation)
scripts/       simulate.ts · gen-audio.mjs
```

**The engine decides; the UI only animates.** `SlotEngine.spin()` generates the grid, applies features in order, evaluates the *final* grid, settles the wallet (bet debited, win credited) and returns a `SpinResult` describing every change (`initialGrid`, ordered `steps` with per-cell changes, `finalGrid`, `lineWins`, `scatter`, `multiplier`, `totalWin`). Animations replay that record. Skipping or reduced motion only fast-forwards presentation; it can never change an outcome or delay a payout that the engine has already settled.

Tech: React 18 + TypeScript, Vite, Tailwind CSS, GSAP (reels, cinematics, character), PixiJS (dust, smoke, bursts, fountains), Howler.js (layered audio).

## Symbol artwork

The current art is the supplied **BLACK MARKET PNG icon pack** (initial concept art), in `public/assets/symbols/` with the filenames from `public/assets/symbols/manifest.txt`:

| Rarity | Symbols |
|---|---|
| Common | `spade` `heart` `club` `diamond` |
| Uncommon | `pocket_watch` `candle_skull` `plague_mask` `crystal_bag` |
| Premium | `horned_skull` `bottled_creature` `forbidden_grimoire` `cursed_dagger` |
| Special | `wild` `scatter` |

To replace a symbol, overwrite its PNG with a new file of the same name — no code changes. If a file is missing, the reels show a clearly labelled **PLACEHOLDER** tile instead of a broken image. Names, weights, pays and glow colours live in `src/config/symbols.ts`.

Known art note: as the manifest says, some extractions keep faint traces of the original white card background; they are visible as light fringes on dark reels.

## Audio

`npm run gen:audio` synthesises every sound (ambience, bonus music, reel spin/stop, wins, crate, magic, dealer, vault, transitions) from oscillators and noise into `public/assets/audio/*.wav`. They are original and license-free placeholders; drop in a final file with the same name to replace one. Missing or failing files are silently skipped.

## Simulation estimates (uncalibrated prototype math)

`npm run simulate -- 1000000 2026` (bet 100, full game loop including bonuses):

| Metric | Observed estimate |
|---|---|
| RTP | **95.5%** (base 61.9% + bonus 33.6%) |
| Hit frequency | 27.0% |
| Bonus frequency | ~1 in 192 spins |
| Average bonus | 64.5× bet |
| Crate frequency | 7.8% of all spins |
| Dealer’s Hand frequency | 4.6% of all spins |
| Largest observed round | 3,668× bet |

A 500k run with seed 12345 gave 96.3%, so expect a ±1–2% spread between runs at this sample size.

### Prototype math limitations

- These are **Monte-Carlo estimates**, not certified values. There is no closed-form RTP calculation, no confidence interval analysis and no third-party certification.
- No RTP, volatility class or maximum win is claimed. The largest observed win is just the largest seen in one run; the real maximum is not bounded by analysis.
- Symbols are drawn independently per cell from per-reel weights (max one scatter per reel) rather than from physical reel strips, so stacked-symbol behaviour differs from a strip-based game.
- Feature chances, crate effect weights, bonus artifacts and pays were tuned by hand against the simulator for a playable feel.
- RNG is mulberry32 (seedable, fine for a demo); a production game would need a certified RNG and a full math model.

## QA hooks

In the browser console: `blackMarketDebug.forceNext({ forceCrate: 'multiplier' })`, `blackMarketDebug.forceNext({ forceDealerHand: true })` or `blackMarketDebug.forceVault()` force the next engine resolution (still generated, evaluated and settled by the engine).
