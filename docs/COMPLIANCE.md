# Player protection and jurisdiction behaviour

Regulated markets differ in how a slot may be paced and presented. Those
rules live in one table, `src/rgs/jurisdictions.ts`, which both the server and
the client read. The server enforces what can be enforced server-side; the
client hides or disables what the profile switches off.

The three presets are engineering defaults modelled on published
requirements. **They are not legal advice.** The operator's compliance team
owns the final values for each market and should review them before launch.

| Behaviour | `intl` | `uk` | `de` | Enforced by |
| --- | --- | --- | --- | --- |
| Autoplay | 10/25/50/100, loss limit required | off | off | client |
| Quick spin | on | off | off | client |
| Stop reels early | on | off | off | client |
| Minimum time between spins | none | 2.5 s | 5 s | server (`TOO_FAST`) and client |
| Buy the Vault | on | off | off | server (`FEATURE_NOT_AVAILABLE`) and client |
| Regulatory stake ceiling | operator limits | 5.00 | 1.00 | server (bet levels above it are removed) |
| Session timer | shown | shown | shown | client |
| Net position | hidden | shown | shown | client |
| Reality check | 60 min | 60 min | 60 min | client |

## Behaviour that is always on

- **No false wins.** A return at or below the stake is shown as a plain
  amount with no celebration, sound or count-up.
- **Result first.** The outcome is final when the server answers. Skipping,
  quick spin and stopping early only shorten the animation.
- **No near-miss manufacturing.** The reels show the true stop positions of
  the strips; the anticipation effect plays only when two Scatters have
  really landed and a third is still possible.
- **Autoplay** needs a loss limit, offers an optional single-win limit, and
  stops on the limit, on a low balance, on any message, and optionally when
  the Vault opens.
- **Information.** Paytable values follow the current bet. The rules page
  states the RTP of the active variant, the separate RTP of buying the
  feature, the maximum win and the malfunction rule. The game and math
  version are shown.
- **History.** The last 50 rounds with every spin, crate reveal, multiplier
  and amount, read from the server's records.
- **Interrupted rounds** are completed on the server and replayed on return.
- **Accessibility.** Keyboard control (Space/Enter to spin, Escape to close),
  focus trapping in dialogs, live-region announcements of results, a reduced
  motion setting that also follows the system preference, and a left-handed
  layout.
- **Demo mode** is labelled, uses play credits, and shows amounts without a
  currency symbol.

## Not handled by the game

Age and identity verification, deposit and loss limits, self-exclusion,
time-outs, bonus restrictions and jurisdiction detection belong to the
operator platform. The game obeys the profile it is launched with.
