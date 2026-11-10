# BLACK MARKET: game rules

This is the rule set the engine implements (`src/engine`). The in-game help
(`src/client/ui/i18n.ts`) says the same thing in player language; if the two
ever differ, the engine and this document win and the help text is a bug.

## Layout and bet

- 5 reels, 4 rows, **1024 ways**. There are no paylines.
- A way win is 3, 4 or 5 matching symbols on adjacent reels starting from
  reel 1, in any rows. The number of ways for a symbol is the product of how
  many of it (or Wilds) each reel shows. Only the longest match per symbol
  pays; wins for different symbols add up.
- The total bet is 20 coins. Coin value = total bet / 20. Every pay below is
  in coins per way, so all wins are whole numbers of the minor currency unit
  whenever the bet is a multiple of 20 minor units (the server enforces this).

## Paytable (coins per way)

| Symbol | 3 | 4 | 5 |
| --- | ---: | ---: | ---: |
| Horned Skull | 20 | 50 | 150 |
| Bottled Creature | 12 | 30 | 80 |
| Forbidden Grimoire | 10 | 25 | 60 |
| Cursed Dagger | 8 | 20 | 50 |
| Plague Mask, Crystal Bag | 5 | 12 | 30 |
| Candle Skull, Pocket Watch | 4 | 10 | 20 |
| Diamond, Heart | 2 | 6 | 12 |
| Spade, Club | 2 | 5 | 10 |

## Special symbols

- **Wild** appears on reels 2, 3 and 4 only. It substitutes for every pay
  symbol. It does not substitute for the Scatter or the Contraband Crate and
  has no pay of its own.
- **Scatter** appears on all reels, at most one in view per reel. 3, 4 or 5
  Scatters anywhere pay 2×, 10× or 100× the total bet and open the Vault with
  10, 15 or 25 free spins.
- **Contraband Crate** lands in stacks. After the reels stop, every crate in
  view opens to reveal the same pay symbol, chosen by one weighted random
  draw. Wins are evaluated after the reveal.

## The Vault (free spins)

- Played on a separate reel set at the bet of the triggering spin.
- The Vault multiplier starts at ×1. Every Wild that lands adds +1 before
  that spin is paid. It never resets during the feature and stops at ×100.
- The multiplier applies to all way wins.
- Each Scatter that lands during the feature awards +1 free spin. Scatters
  do not pay during the feature and cannot retrigger it. A feature
  can never exceed 60 free spins in total.

## Buy the Vault

For 80× the total bet the player buys one base-game spin that is guaranteed
to show 3 or more Scatters. The spin is drawn from the same reels as a normal
spin, conditioned on that outcome (the server redraws until the condition
holds), so 4 and 5 Scatter triggers keep their natural relative odds. The
option is switched off by jurisdiction where feature buys are not permitted.

## Maximum win

A game round pays at most 10,000× the total bet. When the running total
reaches the cap the round ends immediately and exactly the cap is paid.

## Randomness

One round consumes random draws in a fixed, documented order: five reel
stops (uniform over each strip's length), then one crate-reveal draw if a
crate is in view, repeated for every free spin. The complete outcome is
decided on the server before anything is shown. A stored round can be
recomputed from its recorded stops with `verifyRound`.

## Interrupted rounds

The stake is taken and the outcome stored before the client hears about it.
If the connection drops, the win is still credited and the round is replayed
to the player the next time the game is opened. Malfunction voids all pays
and plays.
