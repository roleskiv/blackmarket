import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { REELS, ROWS } from '../config/game';
import { SYMBOLS, type SymbolId } from '../config/symbols';
import { PAYLINES, PAYLINE_COLORS } from '../config/paylines';
import type { CellChange, Grid } from '../engine/types';
import { SymbolImage } from './SymbolImage';
import { spinReel, landReel, fadeSwapReel, clearStrip } from '../animations/reelAnimation';
import { transformCells } from '../animations/winEffects';
import { skipper } from '../animations/skip';

export type CellState = 'win' | 'dim' | 'changed' | 'scatter' | 'target' | undefined;

export interface ReelGridHandle {
  spin(final: Grid, opts: SpinAnimOptions): Promise<void>;
  applyChanges(changes: CellChange[], style: 'magic' | 'smoke' | 'wild'): Promise<void>;
  setGrid(g: Grid): void;
  cellEl(reel: number, row: number): HTMLElement | null;
  reelEl(reel: number): HTMLElement | null;
  windowEl(): HTMLElement | null;
}

export interface SpinAnimOptions {
  turbo: boolean;
  reducedMotion: boolean;
  onReelStop?: (reel: number, column: SymbolId[]) => void;
  /** Reel index from which to add anticipation (after 2 scatters have landed). */
  anticipationFrom?: number;
}

interface Props {
  initial: Grid;
  cellStates: Record<string, CellState>;
  lines: number[];
  spinning: boolean;
  bonus: boolean;
}

export const cellKey = (reel: number, row: number) => `${reel}-${row}`;

export const ReelGrid = forwardRef<ReelGridHandle, Props>(function ReelGrid({ initial, cellStates, lines, spinning, bonus }, ref) {
  const [grid, setGrid] = useState<Grid>(initial);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const [spinningReels, setSpinningReels] = useState<boolean[]>(Array(REELS).fill(false));
  const windowRef = useRef<HTMLDivElement>(null);
  const reelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const setColumn = (reel: number, col: SymbolId[]) =>
    setGrid((g) => {
      const n = g.map((c) => c.slice());
      n[reel] = col.slice();
      return n;
    });

  useImperativeHandle(ref, () => ({
    async spin(final, opts) {
      const current = gridRef.current;
      if (opts.reducedMotion) {
        await Promise.all(
          final.map((col, reel) =>
            fadeSwapReel(
              Array.from({ length: ROWS }, (_, row) => cellRefs.current[cellKey(reel, row)]),
              reel * (opts.turbo ? 0.03 : 0.08),
              () => {
                setColumn(reel, col);
                opts.onReelStop?.(reel, col);
              },
            ),
          ),
        );
        return;
      }
      setSpinningReels(Array(REELS).fill(true));
      const scale = opts.turbo ? 0.4 : 1;
      const promises = final.map((col, reel) => {
        const extra = opts.anticipationFrom !== undefined && reel >= opts.anticipationFrom ? 0.9 * (reel - opts.anticipationFrom + 1) : 0;
        const duration = (0.75 + reel * 0.16) * scale + (opts.turbo ? extra * 0.5 : extra);
        const strip = stripRefs.current[reel]!;
        return spinReel(strip, current[reel], col, duration, extra > 0).then(() => {
          // Commit the static column synchronously before removing the strip — no blank frame.
          flushSync(() => {
            setColumn(reel, col);
            setSpinningReels((s) => s.map((v, i) => (i === reel ? false : v)));
          });
          clearStrip(strip);
          opts.onReelStop?.(reel, col);
          landReel(
            Array.from({ length: ROWS }, (_, row) => cellRefs.current[cellKey(reel, row)]),
            col.map((s) => !!SYMBOLS[s].heavyLand),
          );
        });
      });
      await Promise.all(promises);
    },
    async applyChanges(changes, style) {
      await transformCells(
        changes.map((c) => ({ el: cellRefs.current[cellKey(c.reel, c.row)], change: c })),
        style,
        (c) =>
          setGrid((g) => {
            const n = g.map((col) => col.slice());
            n[c.reel][c.row] = c.to;
            return n;
          }),
      );
    },
    setGrid(g) {
      setGrid(g.map((c) => c.slice()));
    },
    cellEl: (reel, row) => cellRefs.current[cellKey(reel, row)] ?? null,
    reelEl: (reel) => reelRefs.current[reel] ?? null,
    windowEl: () => windowRef.current,
  }));

  return (
    <div className={`reel-frame ${bonus ? 'is-bonus' : ''}`}>
      <div className="reel-frame-inner">
        <div className="reel-window" ref={windowRef} onClick={() => spinning && skipper.skip()}>
          {grid.map((col, reel) => (
            <div key={reel} className="reel" ref={(el) => (reelRefs.current[reel] = el)}>
              <div className={`reel-static ${spinningReels[reel] ? 'is-hidden' : ''}`}>
                {col.map((id, row) => {
                  const st = cellStates[cellKey(reel, row)];
                  return (
                    <div
                      key={row}
                      ref={(el) => (cellRefs.current[cellKey(reel, row)] = el)}
                      className={`cell rarity-${SYMBOLS[id].rarity} ${st ? `cell-${st}` : ''} sym-${id}`}
                      style={{ ['--glow' as string]: SYMBOLS[id].glow }}
                    >
                      <div className="cell-glow" />
                      <SymbolImage id={id} />
                    </div>
                  );
                })}
              </div>
              <div className="reel-strip" ref={(el) => (stripRefs.current[reel] = el)} />
            </div>
          ))}
          <svg className="payline-overlay" viewBox="0 0 500 400" preserveAspectRatio="none">
            {lines.map((li) => (
              <polyline
                key={li}
                points={PAYLINES[li].map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
                stroke={PAYLINE_COLORS[li]}
                className="payline"
              />
            ))}
          </svg>
        </div>
      </div>
      <div className="frame-corner tl" />
      <div className="frame-corner tr" />
      <div className="frame-corner bl" />
      <div className="frame-corner br" />
    </div>
  );
});
