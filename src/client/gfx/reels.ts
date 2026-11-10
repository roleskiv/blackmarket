/**
 * The 5×4 reel window. Reels scroll their real strips, so what passes by is
 * exactly what is on the strip, and a stop always shows the true neighbours
 * of the result. Nothing here decides an outcome: the stops come from the
 * round record.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { REELS, ROWS } from '../../engine/model';
import { CRATE, SCATTER, WILD } from '../../engine/symbols';
import { ease, type Animator } from './anim';
import type { GameTextures } from './assets';
import type { Particles } from './fx';

export const CELL = 200;
export const REEL_W = CELL * REELS;
export const REEL_H = CELL * ROWS;

/** Accent colour per symbol for glows and particles. */
export const SYMBOL_TINT = [
  0x7dff6a, 0x9b6bff, 0xff4a5e, 0xf1b84a, 0xe8c069, 0xd27bff, 0xb45cff, 0xc9a24a, 0xff3355, 0xf1d58a, 0x7dff6a,
  0xd27bff, 0xb45cff, 0xff2d6f, 0xc86bff,
];

const SYMBOL_SCALE = 0.95;
const SPIN_SPEED = 30; // cells per second at full speed
const mod = (a: number, n: number) => ((a % n) + n) % n;

type ReelState = 'idle' | 'starting' | 'running' | 'stopping';

class Reel {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  strip: number[] = [0];
  /** Strip index shown in the top row (fractional while moving). */
  pos = 0;
  speed = 0;
  state: ReelState = 'idle';
  /** Per-row symbol override after a crate reveal; -1 = show the strip. */
  readonly override = new Array<number>(ROWS).fill(-1);
  /** Per-row visibility, so a winner can be drawn by an overlay instead. */
  readonly hidden = new Array<boolean>(ROWS).fill(false);
  dim = 1;

  constructor(private readonly tex: GameTextures) {
    for (let i = 0; i <= ROWS; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.x = CELL / 2;
      this.sprites.push(s);
      this.container.addChild(s);
    }
  }

  symbolAtRow(row: number): number {
    return this.override[row] >= 0 ? this.override[row] : this.strip[mod(Math.round(this.pos) + row, this.strip.length)];
  }

  layout(): void {
    const n = this.strip.length;
    const whole = Math.floor(this.pos);
    const frac = this.pos - whole;
    const blurred = Math.abs(this.speed) > 14;
    const settled = this.state === 'idle' && frac === 0;
    for (let i = 0; i <= ROWS; i++) {
      const s = this.sprites[i];
      let sym = this.strip[mod(whole + i, n)];
      if (settled && i < ROWS && this.override[i] >= 0) sym = this.override[i];
      if (blurred) {
        s.texture = this.tex.blurred[sym];
        s.scale.set(SYMBOL_SCALE * 2, SYMBOL_SCALE * 2);
      } else {
        s.texture = this.tex.symbols[sym];
        s.scale.set(SYMBOL_SCALE * (256 / s.texture.width));
      }
      s.y = (i + 0.5 - frac) * CELL;
      s.visible = !(settled && i < ROWS && this.hidden[i]);
      const c = Math.round(255 * this.dim);
      s.tint = (c << 16) | (c << 8) | c;
    }
  }

  update(dt: number): void {
    if (this.state === 'starting' || this.state === 'running') {
      if (this.state === 'starting') {
        this.speed = Math.min(SPIN_SPEED, this.speed + dt * 190);
        if (this.speed >= SPIN_SPEED) this.state = 'running';
      }
      this.pos = mod(this.pos - this.speed * dt, this.strip.length);
    }
    this.layout();
  }
}

export interface StopOptions {
  stops: number[];
  /** Milliseconds between consecutive reel stops. */
  stagger: number;
  /** Extra spin time for reels that could still complete a scatter trigger. */
  anticipation: number;
  onReelStop: (reel: number, landed: number[]) => void;
  onAnticipation: (reel: number) => void;
}

export class ReelSet {
  readonly container = new Container();
  /** Unmasked layer above the frame for winning symbols and effects. */
  readonly overlay = new Container();
  private readonly reels: Reel[] = [];
  private readonly backdrop = new Graphics();
  private readonly reelLayer = new Container();
  private readonly glowLayer = new Container();
  private readonly teaseGlow: Sprite[] = [];
  private winClones: Array<{ sprite: Sprite; glow: Sprite; reel: number; row: number }> = [];
  private stopPulse: (() => void) | null = null;
  /** Resolves any pending per-reel waits when the player slams the reels. */
  slam = false;

  constructor(
    private readonly tex: GameTextures,
    private readonly anim: Animator,
    private readonly particles: Particles,
  ) {
    this.drawBackdrop(false);
    const mask = new Graphics().roundRect(0, 0, REEL_W, REEL_H, 12).fill(0xffffff);
    this.reelLayer.mask = mask;
    this.container.addChild(this.backdrop, mask, this.glowLayer, this.reelLayer);
    for (let r = 0; r < REELS; r++) {
      const reel = new Reel(tex);
      reel.container.x = r * CELL;
      this.reels.push(reel);
      this.reelLayer.addChild(reel.container);
      const glow = new Sprite(tex.glow);
      glow.anchor.set(0.5);
      glow.position.set(r * CELL + CELL / 2, REEL_H / 2);
      glow.width = CELL * 2.2;
      glow.height = REEL_H * 1.5;
      glow.tint = 0xff2d6f;
      glow.blendMode = 'add';
      glow.alpha = 0;
      this.teaseGlow.push(glow);
      this.glowLayer.addChild(glow);
    }
  }

  private drawBackdrop(vault: boolean): void {
    const g = this.backdrop;
    g.clear();
    g.roundRect(0, 0, REEL_W, REEL_H, 12).fill({ color: vault ? 0x1a070c : 0x0d0718, alpha: 0.9 });
    for (let r = 0; r < REELS; r++) {
      g.rect(r * CELL + 6, 0, CELL - 12, REEL_H).fill({ color: vault ? 0x5a1626 : 0x3a2260, alpha: r % 2 ? 0.2 : 0.3 });
    }
    for (let r = 1; r < REELS; r++) {
      g.rect(r * CELL - 2, 0, 4, REEL_H).fill({ color: 0x000000, alpha: 0.55 });
      g.rect(r * CELL - 0.5, 0, 1, REEL_H).fill({ color: vault ? 0xd9a441 : 0x8a66c4, alpha: 0.35 });
    }
    // Soft shading at the top and bottom edges of the window.
    for (let i = 0; i < 6; i++) {
      const a = 0.22 * (1 - i / 6);
      g.rect(0, i * 10, REEL_W, 10).fill({ color: 0x000000, alpha: a });
      g.rect(0, REEL_H - (i + 1) * 10, REEL_W, 10).fill({ color: 0x000000, alpha: a });
    }
  }

  setVault(vault: boolean): void {
    this.drawBackdrop(vault);
  }

  setStrips(strips: number[][], stops: number[]): void {
    this.reels.forEach((reel, r) => {
      reel.strip = strips[r];
      reel.pos = stops[r];
      reel.speed = 0;
      reel.state = 'idle';
      reel.override.fill(-1);
      reel.layout();
    });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const reel of this.reels) reel.update(dt);
  }

  get spinning(): boolean {
    return this.reels.some((r) => r.state !== 'idle');
  }

  cellCenter(reel: number, row: number): { x: number; y: number } {
    return { x: reel * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  }

  /** Starts every reel moving. The stops are not needed (or known) yet. */
  start(turbo: boolean): void {
    this.slam = false;
    this.clearHighlight();
    this.reels.forEach((reel, r) => {
      reel.override.fill(-1);
      reel.hidden.fill(false);
      reel.dim = 1;
      const begin = () => {
        if (reel.state !== 'idle') return;
        reel.state = 'starting';
        reel.speed = turbo ? SPIN_SPEED : 0;
      };
      if (turbo) begin();
      else {
        // Small wind-up before the reel takes off.
        void this.anim
          .wait(r * 55)
          .then(() => this.anim.tween(reel, { pos: reel.pos + 0.22 }, 110, ease.outQuad))
          .then(begin);
      }
    });
  }

  private async stopReel(r: number, stop: number): Promise<void> {
    const reel = this.reels[r];
    if (reel.state === 'idle') {
      // Slammed before the wind-up finished.
      reel.pos = stop;
      reel.layout();
      return;
    }
    const n = reel.strip.length;
    const travel = 6;
    reel.state = 'stopping';
    reel.pos = stop + travel;
    reel.speed = SPIN_SPEED;
    // Cubic ease-out whose initial speed matches the running speed.
    const ms = ((3 * travel) / SPIN_SPEED) * 1000;
    await this.anim.run(ms, (t) => {
      const k = (1 - t) ** 3;
      reel.pos = stop + travel * k;
      reel.speed = SPIN_SPEED * (1 - t) ** 2;
    });
    reel.speed = 0;
    // Settle: overshoot a little and spring back.
    await this.anim.run(70, (t) => (reel.pos = stop - 0.1 * ease.outQuad(t)));
    await this.anim.run(130, (t) => (reel.pos = stop - 0.1 * (1 - ease.outBack(t))));
    reel.pos = mod(stop, n);
    reel.state = 'idle';
    reel.layout();
  }

  /** Brings the reels to rest on the given stops, left to right. */
  async stop(o: StopOptions): Promise<void> {
    let scatters = 0;
    const pending: Array<Promise<void>> = [];
    for (let r = 0; r < REELS; r++) {
      const reel = this.reels[r];
      const tease = scatters >= 2 && o.anticipation > 0 && !this.slam;
      if (r > 0 && !this.slam) {
        if (tease) {
          o.onAnticipation(r);
          const glow = this.teaseGlow[r];
          void this.anim.tween(glow, { alpha: 0.5 }, 250);
          await this.waitOrSlam(o.anticipation);
          void this.anim.tween(glow, { alpha: 0 }, 300);
        } else {
          await this.waitOrSlam(o.stagger);
        }
      }
      const landed: number[] = [];
      for (let i = 0; i < ROWS; i++) landed.push(reel.strip[mod(o.stops[r] + i, reel.strip.length)]);
      if (landed.includes(SCATTER)) scatters++;
      const p = this.stopReel(r, o.stops[r]).then(() => {
        o.onReelStop(r, landed);
        this.landingEffects(r, landed);
      });
      // With anticipation the next reel waits for this one to land.
      if (tease) await p;
      else pending.push(p);
    }
    await Promise.all(pending);
    for (const g of this.teaseGlow) g.alpha = 0;
  }

  private async waitOrSlam(ms: number): Promise<void> {
    let left = ms;
    while (left > 0 && !this.slam) {
      const slice = Math.min(40, left);
      await this.anim.wait(slice);
      left -= slice;
    }
  }

  private landingEffects(r: number, landed: number[]): void {
    landed.forEach((sym, row) => {
      if (sym !== SCATTER && sym !== WILD) return;
      const { x, y } = this.cellCenter(r, row);
      const tint = SYMBOL_TINT[sym];
      this.particles.burst(x, y, {
        texture: this.tex.spark,
        count: 10,
        tints: [tint, 0xffffff],
        speed: [60, 260],
        life: [350, 800],
        scale: [0.25, 0.7],
        additive: true,
      });
      this.flash(x, y, tint, 1.6);
    });
  }

  /** Expanding additive flash at a cell. */
  flash(x: number, y: number, tint: number, size = 1.3): void {
    const s = new Sprite(this.tex.glow);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.tint = tint;
    s.blendMode = 'add';
    s.width = s.height = CELL * 0.6;
    this.overlay.addChild(s);
    void this.anim
      .run(420, (t) => {
        const k = ease.outCubic(t);
        s.width = s.height = CELL * (0.6 + size * k);
        s.alpha = 1 - t;
      })
      .then(() => s.destroy());
  }

  /** Opens every crate in view to show the revealed symbol. */
  async revealCrates(grid: number[][], reveal: number): Promise<void> {
    const cells: Array<[number, number]> = [];
    grid.forEach((col, r) => col.forEach((sym, row) => sym === CRATE && cells.push([r, row])));
    if (!cells.length || reveal < 0) return;
    // Rattle.
    const reelsWithCrates = [...new Set(cells.map((c) => c[0]))];
    await this.anim.run(380, (t) => {
      const shake = Math.sin(t * Math.PI * 9) * 5 * (1 - t);
      for (const r of reelsWithCrates) this.reels[r].container.x = r * CELL + shake;
    });
    for (const r of reelsWithCrates) this.reels[r].container.x = r * CELL;
    const tint = SYMBOL_TINT[reveal];
    for (const [r, row] of cells) {
      this.reels[r].override[row] = reveal;
      this.reels[r].layout();
      const { x, y } = this.cellCenter(r, row);
      this.flash(x, y, 0xe6c2ff, 1.5);
      this.particles.burst(x, y, {
        texture: this.tex.smoke,
        count: 4,
        tints: [0xb45cff, 0x7a2bd0],
        speed: [20, 90],
        life: [500, 900],
        scale: [0.7, 1.2],
        endScale: 2,
        alpha: 0.7,
      });
      this.particles.burst(x, y, {
        texture: this.tex.spark,
        count: 8,
        tints: [tint, 0xffffff, 0xc86bff],
        speed: [90, 300],
        life: [300, 700],
        scale: [0.2, 0.55],
        additive: true,
      });
    }
    await this.anim.wait(320);
  }

  /** Highlights winning cells: winners pulse above the frame, the rest dim. */
  highlight(cells: Array<[number, number]>, tint: number, celebrate: boolean): void {
    this.clearHighlight();
    for (const reel of this.reels) reel.dim = 0.38;
    for (const [r, row] of cells) {
      const reel = this.reels[r];
      reel.hidden[row] = true;
      const { x, y } = this.cellCenter(r, row);
      const glow = new Sprite(this.tex.cellGlow);
      glow.anchor.set(0.5);
      glow.position.set(x, y);
      glow.tint = tint;
      glow.blendMode = 'add';
      glow.scale.set(CELL / 190);
      const sym = reel.symbolAtRow(row);
      const sprite = new Sprite(this.tex.symbols[sym]);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.scale.set(SYMBOL_SCALE * (256 / sprite.texture.width));
      this.overlay.addChild(glow, sprite);
      this.winClones.push({ sprite, glow, reel: r, row });
    }
    for (const reel of this.reels) reel.layout();
    const base = SYMBOL_SCALE;
    const amp = celebrate ? 0.09 : 0.04;
    this.stopPulse = this.anim.loop(700, (t) => {
      const k = Math.sin(t * Math.PI);
      for (const c of this.winClones) {
        c.sprite.scale.set(base * (256 / c.sprite.texture.width) * (1 + amp * k));
        c.glow.alpha = 0.55 + 0.45 * k;
      }
    });
  }

  clearHighlight(): void {
    this.stopPulse?.();
    this.stopPulse = null;
    for (const c of this.winClones) {
      c.sprite.destroy();
      c.glow.destroy();
    }
    this.winClones = [];
    for (const reel of this.reels) {
      reel.dim = 1;
      reel.hidden.fill(false);
      reel.layout();
    }
  }

  /** Positions (reel,row) of a symbol id currently in view, after reveals. */
  findSymbol(sym: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    this.reels.forEach((reel, r) => {
      for (let row = 0; row < ROWS; row++) if (reel.symbolAtRow(row) === sym) out.push([r, row]);
    });
    return out;
  }
}
