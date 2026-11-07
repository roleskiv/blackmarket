import type { SymbolId } from '../config/symbols';
import type { ArtifactKind, CrateEffectKind } from '../config/game';

/** grid[reel][row] — 5 reels × 4 rows. */
export type Grid = SymbolId[][];

export interface Cell {
  reel: number;
  row: number;
}

export interface CellChange extends Cell {
  from: SymbolId;
  to: SymbolId;
}

export interface LineWin {
  /** 0-based payline index. */
  line: number;
  symbol: SymbolId;
  count: 3 | 4 | 5;
  /** Cells that form the win (left → right). */
  cells: Cell[];
  /** Base pay as a multiple of the line bet (before multipliers). */
  basePay: number;
  /** Credits won on this line, after multipliers. */
  win: number;
}

export interface ScatterWin {
  count: number;
  cells: Cell[];
  win: number;
}

export type FeatureStep =
  | {
      type: 'crate';
      effect: CrateEffectKind;
      changes: CellChange[];
      /** Line-win multiplier granted by the crate (1 if none). */
      multiplier: number;
      /** Reel affected (expanding wild). */
      reel?: number;
      /** Source / target symbols for transform & upgrade effects. */
      from?: SymbolId;
      to?: SymbolId;
    }
  | { type: 'dealer_hand'; reel: number; symbol: SymbolId; changes: CellChange[] }
  | { type: 'eye_sigil'; from: SymbolId; to: SymbolId; changes: CellChange[] }
  | { type: 'raven_feather'; changes: CellChange[] };

export interface ArtifactDrop {
  kind: ArtifactKind;
  /** For eye_sigil: the suit upgraded and its premium replacement. */
  from?: SymbolId;
  to?: SymbolId;
  /** For hourglass: free spins added. */
  extraSpins?: number;
}

export interface SpinResult {
  mode: 'base' | 'bonus';
  bet: number;
  lineBet: number;
  /** Grid exactly as the reels stop, before any feature. */
  initialGrid: Grid;
  /** Ordered feature steps applied to the grid after the reels stop. */
  steps: FeatureStep[];
  /** Grid after all features; this grid is what gets evaluated. */
  finalGrid: Grid;
  lineWins: LineWin[];
  scatter: ScatterWin;
  /** Total multiplier applied to line wins. */
  multiplier: number;
  totalWin: number;
  /** Free spins awarded (trigger in base, retrigger in bonus). */
  freeSpinsAwarded: number;
  /** Artifact collected this free spin, if any. */
  artifact?: ArtifactDrop;
}
