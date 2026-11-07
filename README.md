# BLACK MARKET

An original 5×4, 25-line browser slot prototype set in a secret underground market for supernatural contraband, hosted by **The Dealer**.

> **Virtual demo credits only.** There are no deposits, withdrawals, wallets, crypto or real-money paths of any kind. Credits have no value.

```bash
npm install
npm run dev        # play locally
npm test           # unit tests + 100,000-spin simulation
npm run simulate   # longer simulation: npm run simulate -- 1000000 <seed>
npm run build      # production build in dist/ (relative paths, host anywhere)
npm run gen:audio  # regenerate the synthesized sounds
python3 scripts/clean-symbols.py  # re-clean art from art/symbols-original (needs numpy, pillow, scipy)
```

Add `?seed=<number>` to the URL to play a deterministic, replayable session.

## Features

| | |
|---|---|
| **Reels** | 5 reels × 4 rows, 25 explicit fixed paylines (`src/config/paylines.ts`), left-to-right 3/4/5 of a kind |
| **Wild** | Substitutes for everything except the Scatter; reels 2–5; 3+ Wilds on a line pay as Wild |
| **Scatter** | Pays anywhere on total bet; 3/4/5 open the Dealer’s Vault for 9/11/17 free spins. Two scatters with reels still spinning trigger a tease (sound, Dealer lean, glowing eyes) |
| **Black Market Crates (pick 1 of 3)** | The Dealer offers three different crates; you pick one (click or keys 1–3, auto-pick after 10 s) and the other two are revealed as “Passed on”. Effects: Wild Contraband (2–4 wilds), Counterfeit Swap (suit → uncommon), Toxic Tonic (×2/×3/×5 line wins), Raven Column (full wild reel), Appraiser’s Eye (uncommon → premium). Each offer is resolved by the engine before you choose; the choice only selects which one settles |
| **Multiplier potions** | Occasionally a potion (×2/×3/×5) lands on a cell; any line win passing through it is multiplied (potions on one line multiply together). More frequent in the bonus |
| **Dealer’s Hand** | The Dealer deals a premium symbol or Wild and points at a reel; every non-scatter symbol on it transforms |
| **Dealer’s Vault bonus** | Cinematic vault opening, free spins at the trigger bet, retriggers (+5), collectible contraband with persistent modifiers (Golden Ledger multiplier, Raven Feather wilds, Stolen Hourglass +2 spins, Eye Sigil suit upgrades, Iron Shackles sticky wilds up to 4), bonus summary |
| **Win cap** | A round (base spin plus any bonus it triggers) pays at most 10,000× the bet; reaching it ends the bonus |
| **Loading** | Loading screen preloads all symbol art with progress; “Enter the market” unlocks audio |
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

**The engine decides; the UI only animates.** A spin is two steps: `SlotEngine.startSpin()` debits the bet and returns the initial grid, pre-feature steps and either the settled `outcome` or three `crateOffers`; `pickCrate(i)` then settles the chosen offer. `SlotEngine.spin()` does both in one call (used by tests and the simulator). The engine generates the grid, applies features in order, evaluates the *final* grid, settles the wallet (bet debited, win credited) and returns a `SpinResult` describing every change (`initialGrid`, ordered `steps` with per-cell changes, `finalGrid`, `lineWins`, `scatter`, `multiplier`, `totalWin`). Animations replay that record. Skipping or reduced motion only fast-forwards presentation; it can never change an outcome or delay a payout that the engine has already settled.

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

The supplied originals are kept untouched in `art/symbols-original/`. `scripts/clean-symbols.py` strips the faint white card-background fringes the pack shipped with and writes the cleaned PNGs here, plus 128px vertical motion-blur copies in `public/assets/symbols/blur/` used while reels spin (a missing blur file falls back to the sharp art).

## Audio

`npm run gen:audio` synthesises every sound (ambience, bonus music, reel spin/stop, wins, crate, magic, dealer, vault, transitions) from oscillators and noise into `public/assets/audio/*.wav`. They include reverb, a crowd murmur in the ambience, a layered bonus track, a scatter tease and a potion sting. They are original and license-free placeholders; drop in a final file with the same name to replace one. Missing or failing files are silently skipped.

## Simulation estimates (uncalibrated prototype math)

`npm run simulate -- 2000000 2026` (bet 100, full game loop including bonuses):

| Metric | Observed estimate |
|---|---|
| RTP | **96.1%**, 95% confidence range 94.3–98.0% (base 61.7% + bonus 34.4%) |
| Spread (std dev of round win) | 13.3× bet: a simulation-based volatility index, not a certified class |
| Hit frequency | 27.0% |
| Bonus frequency | ~1 in 190 spins |
| Average bonus | 65.2× bet |
| Largest observed round | 4,433× bet |
| Rounds reaching the 10,000× cap | 0 |

Seed 777 gave 95.8%. The simulator also prints a win distribution, crate, hand and potion frequencies. The confidence range is wide because bonus wins are heavy-tailed; tighten it with more spins.

### Prototype math limitations

- These are **Monte-Carlo estimates**, not certified values. There is no closed-form RTP calculation and no third-party certification.
- No certified RTP or volatility class is claimed. The 10,000× cap is an engine rule, not a claim that it is reachable; the largest observed win is just the largest seen in one run.
- The simulator picks crates at random; a player who always chooses the best-looking crate may see a slightly different return.
- Symbols are drawn independently per cell from per-reel weights (max one scatter per reel) rather than from physical reel strips, so stacked-symbol behaviour differs from a strip-based game.
- Feature chances, crate effect weights, bonus artifacts and pays were tuned by hand against the simulator for a playable feel.
- RNG is mulberry32 (seedable, fine for a demo); a production game would need a certified RNG and a full math model.

## QA hooks

In the browser console: `blackMarketDebug.forceNext({ forceCrate: 'multiplier' })`, `blackMarketDebug.forceNext({ forceDealerHand: true })`, `blackMarketDebug.forceNext({ forcePotion: { cell: { reel: 1, row: 1 }, value: 3 } })` or `blackMarketDebug.forceVault()` force the next engine resolution (still generated, evaluated and settled by the engine).

## CI

`.github/workflows/ci.yml` runs typecheck, tests and a production build on every pull request and push to `main`.
