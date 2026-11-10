# Readiness for real-money release

This document says plainly what this repository is and what still has to
happen before a licensed operator can offer the game for real money. Nothing
here has been reviewed by a test laboratory or a regulator. Every return
figure in this repository is a calculation or a simulation made by the
development tooling and is labelled as such.

## What is in place

| Area | State | Evidence |
| --- | --- | --- |
| Game rules | complete and written down | `docs/GAME_RULES.md`, `src/engine` |
| Math model | closed-form calculation of RTP, hit rate, feature value and buy value for each variant | `src/math/analytic.ts`, `docs/PAR_SHEET.md` |
| Independent check of the math | brute-force full-cycle enumeration of a small model matches the closed form to 12 digits; Monte Carlo of the real engine matches the closed form within its confidence interval | `tests/analytic.test.ts`, `docs/PAR_SHEET.md` |
| Outcome engine | pure, deterministic for a given RNG, no floating-point money | `src/engine/round.ts`, `tests/engine.test.ts` |
| Round replay and audit | any stored round recomputes from its recorded stops; records are hash-chained | `verifyRound`, `/api/audit/rounds/:id` |
| Money flow | debit, persist, credit with idempotency, rollback and recovery | `src/rgs/server.ts`, `tests/rgs.test.ts`, `tests/http.test.ts` |
| Jurisdiction behaviour | configurable profiles, enforced server-side where possible | `docs/COMPLIANCE.md` |
| Client | desktop and phone, portrait and landscape, keyboard and screen-reader basics, interrupted-round recovery | `npm run e2e` |
| RTP variants | 96%, 94% and 92% strip sets with identical rules and paytable | `src/engine/models` |

## What a release still needs

1. **Test laboratory certification.** An accredited lab (for example GLI,
   BMM, eCOGRA or iTech Labs) must verify the math, the RNG and the game
   behaviour for each target jurisdiction. The PAR sheet, rules, source and
   the simulator are the submission material; the certificate is theirs to
   issue.
2. **A certified RNG.** `CryptoRng` draws from the runtime's CSPRNG with
   rejection sampling and is suitable as a reference. Certification is of a
   specific RNG in a specific deployment; plug the certified one in behind
   the `Rng` interface.
3. **Platform integration.** Real authentication, the operator's wallet and
   a transactional round database (see `docs/INTEGRATION.md`). The reference
   server keeps sessions in memory and rounds in a file.
4. **Security review.** Penetration test of the deployed server, rate
   limiting and abuse controls at the edge, authentication on the audit
   endpoint, dependency and supply-chain review.
5. **Load and soak testing** of the deployed stack, including wallet
   time-outs and recovery under failure.
6. **Art provenance.** The fourteen symbol images come from a supplied image
   pack. Confirm in writing that the pack may be used commercially, or
   replace the files (each one is swappable by name). Frame, logo,
   backgrounds, crate and all effects are original to this repository.
7. **Audio.** All sound is synthesised in the browser. It is original and
   licence-free, but a commercial release would normally commission recorded
   music and effects.
8. **Device testing.** The client has been exercised in headless Chromium at
   desktop and phone sizes. It has not been run on a device matrix (iOS
   Safari, Android Chrome, low-end phones, in-app web views).
9. **Localisation.** English only. Text is keyed and ready for translation.
10. **Legal review** of the jurisdiction profiles, the help text and the
    feature buy per market.
11. **Responsible gambling tooling** on the platform side: limits,
    self-exclusion, age verification, market detection.

## Known limits of the published figures

- RTP figures are for an unbounded number of rounds. The closed form does
  not include the 10,000× cap; the simulation does. The PAR sheet reports
  both and the size of the difference.
- Volatility is reported as the standard deviation and the win distribution
  measured by simulation, with the number of rounds stated.
- The largest win observed in simulation is reported as observed. The rule
  cap of 10,000× is a limit, not a claim that it is reachable in practice.
