/**
 * Jurisdiction profiles. Each market regulates how a slot may be presented
 * and paced; the client and the server both read these flags, so a rule is
 * enforced in one place and never by ad-hoc client code.
 *
 * The presets below are engineering defaults modelled on published
 * requirements at the time of writing. They are NOT legal advice: the
 * operator's compliance team owns the final values for each market.
 */
export interface JurisdictionProfile {
  id: string;
  label: string;
  autoplay: {
    enabled: boolean;
    /** Selectable spin counts. */
    options: number[];
    /** Player must set a loss limit before autoplay can start. */
    requireLossLimit: boolean;
  };
  /** Quick-spin / turbo setting available. */
  turbo: boolean;
  /** Player may stop the reels early (slam stop). */
  slamStop: boolean;
  /** Minimum time from one spin start to the next, in milliseconds. */
  minSpinMs: number;
  featureBuy: boolean;
  /** Show elapsed session time in the game window. */
  showSessionTimer: boolean;
  /** Show net win/loss for the session. */
  showNetPosition: boolean;
  /** Interrupt play with a reality check every N minutes (0 = off). */
  realityCheckMinutes: number;
  /** Optional regulatory stake ceiling in minor units (null = operator limit only). */
  maxBetMinor: number | null;
}

export const JURISDICTIONS: Record<string, JurisdictionProfile> = {
  intl: {
    id: 'intl',
    label: 'International (.com / MGA-style)',
    autoplay: { enabled: true, options: [10, 25, 50, 100], requireLossLimit: true },
    turbo: true,
    slamStop: true,
    minSpinMs: 0,
    featureBuy: true,
    showSessionTimer: true,
    showNetPosition: false,
    realityCheckMinutes: 60,
    maxBetMinor: null,
  },
  uk: {
    id: 'uk',
    label: 'Great Britain (UKGC RTS-style)',
    autoplay: { enabled: false, options: [], requireLossLimit: true },
    turbo: false,
    slamStop: false,
    minSpinMs: 2500,
    featureBuy: false,
    showSessionTimer: true,
    showNetPosition: true,
    realityCheckMinutes: 60,
    maxBetMinor: 500,
  },
  de: {
    id: 'de',
    label: 'Germany (GlüStV-style)',
    autoplay: { enabled: false, options: [], requireLossLimit: true },
    turbo: false,
    slamStop: false,
    minSpinMs: 5000,
    featureBuy: false,
    showSessionTimer: true,
    showNetPosition: true,
    realityCheckMinutes: 60,
    maxBetMinor: 100,
  },
};
