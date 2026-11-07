/** Presentation timing & visual tuning. Pure presentation — never affects outcomes. */
export const TIMING = {
  reelSpinBase: 0.75, // seconds the first reel spins
  reelStagger: 0.16, // extra seconds per subsequent reel
  anticipationExtra: 0.9, // extra spin on reels after 2 scatters have landed
  turboScale: 0.4,
  winLinePause: 1.1,
  bigWinThresholdX: 15, // total win ÷ bet
  megaWinThresholdX: 40,
  epicWinThresholdX: 100,
  autoSpinPause: 0.35,
};

export const AUTO_SPIN_OPTIONS = [10, 25, 50, 100] as const;
