/**
 * Everything drawn on the WebGL canvas: backdrop, reels, frame, the Vault
 * meter and the full-screen moments (vault doors, big-win celebration).
 * The scene exposes verbs ("close the doors", "bump the multiplier"); the
 * controller decides when to use them.
 */
import { Application, Container, Graphics, Sprite, Text, TilingSprite, type TextStyleOptions } from 'pixi.js';
import { Animator, ease } from './anim';
import type { GameTextures } from './assets';
import { Particles } from './fx';
import { CELL, REEL_H, REEL_W, ReelSet } from './reels';

const DISPLAY_FONT = 'Cinzel, "Times New Roman", serif';

const goldText = (size: number, extra: Partial<TextStyleOptions> = {}): TextStyleOptions => ({
  fontFamily: DISPLAY_FONT,
  fontWeight: '900',
  fontSize: size,
  fill: 0xffd977,
  stroke: { color: 0x1a0f22, width: Math.max(4, size * 0.09), join: 'round' },
  dropShadow: { color: 0x000000, alpha: 0.65, blur: size * 0.08, distance: size * 0.06, angle: Math.PI / 2 },
  align: 'center',
  ...extra,
});

interface Mote {
  sprite: Sprite;
  vx: number;
  vy: number;
  phase: number;
  base: number;
}

export type WinTier = 0 | 1 | 2 | 3;
export const TIER_TITLES = ['', 'BIG WIN', 'MEGA WIN', 'EPIC WIN'];

export class Scene {
  readonly app = new Application();
  readonly anim = new Animator();
  readonly particles = new Particles();
  /** Screen-space particles (coins over the whole view). */
  readonly screenParticles = new Particles();
  reels!: ReelSet;

  private readonly bg = new Container();
  private readonly world = new Container();
  private readonly screen = new Container();
  private bgMarket!: Sprite;
  private bgVault!: Sprite;
  private fog: TilingSprite[] = [];
  private lights: Array<{ sprite: Sprite; phase: number; speed: number; base: number }> = [];
  private motes: Mote[] = [];
  private logo!: Sprite;
  private meter = new Container();
  private meterSpins!: Text;
  private meterMult!: Text;
  private meterTotal!: Text;
  private meterMedal!: Container;
  private winPopup!: Text;
  private doorL!: Sprite;
  private doorR!: Sprite;
  private doorTitle!: Text;
  private doorSub!: Text;
  private doorAmount!: Text;
  private bigWin = new Container();
  private bigDim = new Graphics();
  private bigRays!: Sprite;
  private bigTitle!: Text;
  private bigAmount!: Text;
  private readonly tensionDim = new Graphics();
  private readonly flashG = new Graphics();
  /** Screen-space effects drawn above everything else. */
  private readonly fx = new Container();
  private zoom = 1;
  private zoomTarget = 1;
  private tension = 0;
  private tensionTarget = 0;
  private rain = 0;
  private rainAcc = 0;
  private amountPunch = 0;
  private bigS = 1;
  private vault = false;
  private shakeAmp = 0;
  private worldX = 0;
  private worldY = 0;
  private time = 0;
  private viewW = 1;
  private viewH = 1;
  private scale = 1;
  reducedMotion = false;
  /** QA only: runs the whole presentation faster or slower. */
  timeScale = 1;

  constructor(private readonly tex: GameTextures) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x07040d,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.app.stage.addChild(this.bg, this.world, this.screen);
    this.buildBackground();
    this.tensionDim.rect(0, 0, 2048, 2048).fill(0x05010a);
    this.tensionDim.alpha = 0;
    this.bg.addChild(this.tensionDim);
    this.buildWorld();
    this.buildScreen();
    this.app.ticker.add((ticker) => this.update(Math.min(ticker.deltaMS, 100) * this.timeScale));
  }

  // ── Construction ────────────────────────────────────────────────────────
  private buildBackground(): void {
    const t = this.tex;
    this.bgMarket = new Sprite(t.bgMarket);
    this.bgVault = new Sprite(t.bgVault);
    this.bgVault.alpha = 0;
    for (const s of [this.bgMarket, this.bgVault]) {
      s.width = s.height = 2048;
      this.bg.addChild(s);
    }
    // Lantern and string-light glows painted in the backdrop, made to flicker.
    const spots: Array<[number, number, number, number]> = [
      [300, 830, 0xffb347, 5.2],
      [1880, 1110, 0xb85cff, 5.2],
      [180, 366, 0xffb347, 1.6],
      [420, 408, 0xb85cff, 1.6],
      [660, 388, 0xffb347, 1.6],
      [880, 350, 0x6fe05a, 1.6],
      [1168, 350, 0xffb347, 1.6],
      [1388, 388, 0xb85cff, 1.6],
      [1628, 408, 0xffb347, 1.6],
      [1868, 366, 0x6fe05a, 1.6],
      [1024, 1000, 0x9a6bff, 9],
    ];
    spots.forEach(([x, y, tint, size], i) => {
      const s = new Sprite(t.glow);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.scale.set(size);
      s.tint = tint;
      s.blendMode = 'add';
      this.bg.addChild(s);
      this.lights.push({ sprite: s, phase: i * 1.7, speed: 0.6 + (i % 4) * 0.35, base: i === spots.length - 1 ? 0.22 : 0.4 });
    });
    for (let i = 0; i < 2; i++) {
      const f = new TilingSprite({ texture: t.fog, width: 2048, height: 2048 });
      f.tileScale.set(3 + i * 1.5);
      f.alpha = 0.5 - i * 0.15;
      f.tint = 0x9a7bd8;
      f.blendMode = 'add';
      this.fog.push(f);
      this.bg.addChild(f);
    }
    for (let i = 0; i < 46; i++) {
      const s = new Sprite(t.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.position.set(Math.random() * 2048, Math.random() * 2048);
      s.scale.set(0.06 + Math.random() * 0.12);
      this.bg.addChild(s);
      this.motes.push({
        sprite: s,
        vx: (Math.random() - 0.5) * 14,
        vy: -6 - Math.random() * 16,
        phase: Math.random() * 6.28,
        base: 0.25 + Math.random() * 0.5,
      });
    }
    this.tintAtmosphere();
  }

  private tintAtmosphere(): void {
    const v = this.vault;
    for (const f of this.fog) f.tint = v ? 0xd86a3a : 0x9a7bd8;
    for (const m of this.motes) m.sprite.tint = v ? 0xffc46b : 0xd9c2ff;
    this.lights.forEach((l, i) => (l.sprite.visible = !v || i === this.lights.length - 1));
    const centre = this.lights[this.lights.length - 1];
    centre.sprite.tint = v ? 0xffa53a : 0x9a6bff;
  }

  private buildWorld(): void {
    const t = this.tex;
    this.reels = new ReelSet(t, this.anim, this.particles);

    const frame = new Sprite(t.frame);
    frame.position.set(-100, -100);
    frame.width = REEL_W + 200;
    frame.height = REEL_H + 200;

    this.logo = new Sprite(t.logo);
    this.logo.anchor.set(0.5);
    this.logo.position.set(REEL_W / 2, -134);
    this.logo.scale.set(0.52);

    this.buildMeter();

    this.winPopup = new Text({ text: '', style: goldText(110) });
    this.winPopup.anchor.set(0.5);
    this.winPopup.position.set(REEL_W / 2, REEL_H / 2);
    this.winPopup.visible = false;

    this.world.addChild(
      this.logo,
      this.meter,
      this.reels.container,
      frame,
      this.reels.overlay,
      this.particles.container,
      this.winPopup,
    );
  }

  private plaque(x: number, w: number, label: string): Text {
    const g = new Graphics()
      .roundRect(-w / 2, -44, w, 88, 18)
      .fill({ color: 0x150a12, alpha: 0.92 })
      .roundRect(-w / 2, -44, w, 88, 18)
      .stroke({ color: 0xd9a441, width: 4 })
      .roundRect(-w / 2 + 7, -37, w - 14, 74, 12)
      .stroke({ color: 0x6e4513, width: 2 });
    g.position.set(x, -118);
    const cap = new Text({
      text: label,
      style: { fontFamily: DISPLAY_FONT, fontWeight: '700', fontSize: 22, fill: 0xc9a86a, letterSpacing: 3 },
    });
    cap.anchor.set(0.5);
    cap.position.set(x, -140);
    const value = new Text({ text: '', style: goldText(40, { fill: 0xfff0c2 }) });
    value.anchor.set(0.5);
    value.position.set(x, -104);
    this.meter.addChild(g, cap, value);
    return value;
  }

  private buildMeter(): void {
    this.meterSpins = this.plaque(170, 300, 'FREE SPINS LEFT');
    this.meterTotal = this.plaque(REEL_W - 170, 300, 'VAULT WIN');
    const medal = new Container();
    medal.position.set(REEL_W / 2, -128);
    const rays = new Sprite(this.tex.rays);
    rays.anchor.set(0.5);
    rays.scale.set(0.5);
    rays.tint = 0xffb347;
    rays.blendMode = 'add';
    rays.alpha = 0.55;
    rays.label = 'rays';
    const disc = new Graphics()
      .circle(0, 0, 68)
      .fill(0x1a0a10)
      .circle(0, 0, 68)
      .stroke({ color: 0xfbe7a1, width: 6 })
      .circle(0, 0, 58)
      .stroke({ color: 0x8a5a1c, width: 3 });
    this.meterMult = new Text({ text: '×1', style: goldText(62) });
    this.meterMult.anchor.set(0.5);
    const cap = new Text({
      text: 'MULTIPLIER',
      style: { fontFamily: DISPLAY_FONT, fontWeight: '700', fontSize: 12, fill: 0xc9a86a, letterSpacing: 2 },
    });
    cap.anchor.set(0.5);
    cap.y = 40;
    this.meterMult.y = -8;
    medal.addChild(rays, disc, this.meterMult, cap);
    this.meterMedal = medal;
    this.meter.addChild(medal);
    this.meter.visible = false;
  }

  private buildScreen(): void {
    const t = this.tex;
    this.bigRays = new Sprite(t.rays);
    this.bigRays.anchor.set(0.5);
    this.bigRays.blendMode = 'add';
    this.bigRays.tint = 0xffb347;
    this.bigRays.alpha = 0.42;
    this.bigTitle = new Text({ text: '', style: goldText(150) });
    this.bigTitle.anchor.set(0.5);
    this.bigAmount = new Text({ text: '', style: goldText(120, { fill: 0xffffff }) });
    this.bigAmount.anchor.set(0.5);
    this.bigWin.addChild(this.bigDim, this.bigRays, this.screenParticles.container, this.bigTitle, this.bigAmount);
    this.bigWin.visible = false;

    this.doorL = new Sprite(t.door);
    this.doorR = new Sprite(t.door);
    this.doorL.anchor.set(1, 0.5);
    this.doorR.anchor.set(1, 0.5);
    this.doorTitle = new Text({ text: '', style: goldText(120) });
    this.doorSub = new Text({ text: '', style: goldText(64, { fill: 0xfff0c2 }) });
    this.doorAmount = new Text({ text: '', style: goldText(120, { fill: 0xffffff }) });
    for (const x of [this.doorTitle, this.doorSub, this.doorAmount]) {
      x.anchor.set(0.5);
      x.visible = false;
    }
    this.doorL.visible = this.doorR.visible = false;
    this.flashG.alpha = 0;
    this.screen.addChild(this.bigWin, this.doorL, this.doorR, this.doorTitle, this.doorSub, this.doorAmount, this.fx, this.flashG);
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  /** Fits the scene to the view. Insets are the DOM bars above and below. */
  layout(w: number, h: number, top: number, bottom: number): void {
    this.viewW = w;
    this.viewH = h;
    const portrait = w < h * 0.8;
    const boxW = portrait ? 1056 : 1180;
    const bandTop = 200;
    const bandBottom = 78;
    const boxH = bandTop + REEL_H + bandBottom;
    const availH = Math.max(120, h - top - bottom);
    const scale = Math.min(w / boxW, availH / boxH);
    this.scale = scale;
    this.world.scale.set(scale);
    this.worldX = (w - REEL_W * scale) / 2;
    const free = availH - boxH * scale;
    this.worldY = top + free * (portrait ? 0.46 : 0.5) + bandTop * scale;
    this.world.position.set(this.worldX, this.worldY);

    // Backdrop: cover the view, keeping the arch behind the reels.
    const bgScale = Math.max(w / 2048, h / 2048) * 1.02;
    this.bg.scale.set(bgScale);
    const reelCx = this.worldX + (REEL_W * scale) / 2;
    const reelCy = this.worldY + (REEL_H * scale) / 2;
    const bx = reelCx - 1024 * bgScale;
    const by = reelCy - 1010 * bgScale;
    this.bg.position.set(
      Math.min(0, Math.max(w - 2048 * bgScale, bx)),
      Math.min(0, Math.max(h - 2048 * bgScale, by)),
    );

    // Full-screen pieces.
    this.bigDim.clear().rect(0, 0, w, h).fill({ color: 0x05020a, alpha: 0.72 });
    this.flashG.clear().rect(0, 0, w, h).fill(0xffffff);
    const s = Math.min(w / 1100, h / 900);
    this.bigS = s;
    this.bigRays.position.set(w / 2, h * 0.45);
    this.bigRays.scale.set((Math.max(w, h) / 512) * 1.5);
    this.bigTitle.position.set(w / 2, h * 0.36);
    this.bigTitle.scale.set(s);
    this.bigAmount.position.set(w / 2, h * 0.36 + 170 * s);
    this.bigAmount.scale.set(s);
    const ds = Math.max(h / 1024, (w / 2 + 2) / 512);
    this.doorL.scale.set(ds, ds);
    this.doorR.scale.set(-ds, ds);
    this.doorL.y = this.doorR.y = h / 2;
    this.doorTitle.position.set(w / 2, h * 0.4);
    this.doorSub.position.set(w / 2, h * 0.4 + 120 * s);
    this.doorAmount.position.set(w / 2, h * 0.4 + 130 * s);
    for (const x of [this.doorTitle, this.doorSub, this.doorAmount]) x.scale.set(s);
    this.placeDoors(this.doorL.visible ? 1 : 0);
  }

  /** Converts a point in reel coordinates to screen pixels. */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.worldX + x * this.scale, y: this.worldY + y * this.scale };
  }

  // ── Frame update ────────────────────────────────────────────────────────
  private update(dt: number): void {
    this.time += dt;
    this.anim.update(dt);
    this.reels.update(dt);
    this.particles.update(dt);
    this.screenParticles.update(dt);
    const t = this.time / 1000;
    if (!this.reducedMotion) {
      this.fog[0].tilePosition.x += dt * 0.012;
      this.fog[0].tilePosition.y += dt * 0.003;
      this.fog[1].tilePosition.x -= dt * 0.02;
      for (const l of this.lights) {
        l.sprite.alpha = l.base * (0.8 + 0.2 * Math.sin(t * l.speed + l.phase) + 0.06 * Math.sin(t * 13.7 + l.phase * 3));
      }
      for (const m of this.motes) {
        const s = m.sprite;
        s.x += (m.vx * dt) / 1000;
        s.y += ((this.vault ? m.vy * 4 : m.vy) * dt) / 1000;
        if (s.y < -20) {
          s.y = 2068;
          s.x = Math.random() * 2048;
        }
        if (s.x < -20) s.x = 2068;
        if (s.x > 2068) s.x = -20;
        s.alpha = m.base * (0.5 + 0.5 * Math.sin(t * 0.9 + m.phase));
      }
      const rays = this.meterMedal.getChildByLabel('rays');
      if (rays) rays.rotation = t * 0.25;
      if (this.bigWin.visible) this.bigRays.rotation = t * 0.18;
    }
    // Tension: a slow push-in on the reels and darker surroundings.
    const lerp = Math.min(1, dt * 0.006);
    this.zoom += (this.zoomTarget - this.zoom) * lerp;
    this.tension += (this.tensionTarget - this.tension) * lerp;
    this.tensionDim.alpha = this.tension;
    const ws = this.scale * this.zoom;
    this.world.scale.set(ws);
    let px = this.worldX - (REEL_W * (ws - this.scale)) / 2;
    let py = this.worldY - (REEL_H * (ws - this.scale)) / 2;
    if (this.shakeAmp > 0.2) {
      px += (Math.random() - 0.5) * this.shakeAmp;
      py += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp *= Math.pow(0.0015, dt / 1000);
    } else {
      this.shakeAmp = 0;
    }
    this.world.position.set(px, py);

    if (this.bigWin.visible) {
      // Coins rain from the top for as long as the count is running.
      if (this.rain > 0) {
        this.rainAcc += dt * (0.01 + 0.012 * this.rain);
        const k = Math.min(this.viewW, this.viewH) / 800;
        while (this.rainAcc >= 1) {
          this.rainAcc -= 1;
          this.screenParticles.burst(Math.random() * this.viewW, -30, {
            texture: this.tex.coin,
            count: 1,
            speed: [150 * k, 520 * k],
            angle: Math.PI / 2,
            spread: 0.5,
            gravity: 1100 * k,
            life: [1700, 2600],
            scale: [0.4 * k, 0.8 * k],
            endScale: 1,
            spin: 8,
            fadeIn: 0.02,
          });
        }
      }
      this.amountPunch *= Math.pow(0.002, dt / 1000);
      const raw = Math.max(1, this.bigAmount.width / this.bigAmount.scale.x);
      const fit = Math.min(1, (this.viewW * 0.9) / raw / this.bigS);
      this.bigAmount.scale.set(this.bigS * fit * (1 + this.amountPunch));
    }
  }

  /** 0 = calm. Higher levels push in and darken the surroundings. */
  setTension(level: number): void {
    this.tensionTarget = Math.min(0.55, level * 0.24);
    this.zoomTarget = this.reducedMotion ? 1 : 1 + Math.min(3, level) * 0.018;
  }

  /** Brief full-screen flash. */
  screenFlash(alpha = 0.7, ms = 300, color = 0xffffff): void {
    const a = this.reducedMotion ? alpha * 0.25 : alpha;
    this.flashG.tint = color;
    this.flashG.alpha = a;
    void this.anim.run(ms, (t) => (this.flashG.alpha = a * (1 - t) * (1 - t)), true);
  }

  /** Expanding shockwave ring in screen pixels. */
  ring(x: number, y: number, tint: number, size: number, ms = 650): void {
    if (this.reducedMotion) return;
    const r = new Sprite(this.tex.ring);
    r.anchor.set(0.5);
    r.position.set(x, y);
    r.tint = tint;
    r.blendMode = 'add';
    this.fx.addChild(r);
    void this.anim
      .run(
        ms,
        (t) => {
          r.scale.set((size / 256) * (0.15 + 0.85 * ease.outCubic(t)));
          r.alpha = (1 - t) * (1 - t);
        },
        true,
      )
      .then(() => r.destroy());
  }

  /** Shockwave centred on a reel cell. */
  cellRing(reel: number, row: number, tint: number, cells = 3): void {
    const c = this.reels.cellCenter(reel, row);
    const p = this.toScreen(c.x, c.y);
    this.ring(p.x, p.y, tint, this.cell * cells);
  }

  /**
   * Sends a glowing orb from each cell to a point on screen (the win meter),
   * so the player sees where the money goes. Resolves when the first lands.
   */
  flyToScreen(cells: Array<[number, number]>, sx: number, sy: number, tint: number): Promise<void> {
    if (this.reducedMotion || !cells.length) return Promise.resolve();
    const k = this.scale;
    const flights = cells.slice(0, 10).map(async ([r, row], i) => {
      const c = this.reels.cellCenter(r, row);
      const from = this.toScreen(c.x, c.y);
      const orb = new Sprite(this.tex.glow);
      orb.anchor.set(0.5);
      orb.blendMode = 'add';
      orb.tint = tint;
      orb.scale.set(0.55 * k);
      orb.position.set(from.x, from.y);
      orb.alpha = 0;
      this.fx.addChild(orb);
      await this.anim.run(i * 35, () => undefined, true);
      const cx = from.x + (sx - from.x) * 0.3 + (i % 2 ? 90 : -90) * k;
      const cy = from.y - 120 * k;
      await this.anim.run(
        430,
        (t) => {
          const e = ease.inQuad(t);
          const a = (1 - e) * (1 - e);
          const b = 2 * (1 - e) * e;
          orb.position.set(a * from.x + b * cx + e * e * sx, a * from.y + b * cy + e * e * sy);
          orb.alpha = Math.min(1, t * 5);
          orb.scale.set(0.55 * k * (1 - 0.5 * e));
        },
        true,
      );
      orb.destroy();
    });
    return Promise.race(flights);
  }

  shake(strength: number): void {
    if (this.reducedMotion) return;
    this.shakeAmp = Math.max(this.shakeAmp, strength * this.scale * 2);
  }

  // ── Vault mode ──────────────────────────────────────────────────────────
  setVault(on: boolean): void {
    this.vault = on;
    this.bgVault.alpha = on ? 1 : 0;
    this.reels.setVault(on);
    this.logo.visible = !on;
    this.meter.visible = on;
    this.tintAtmosphere();
  }

  setMeter(spinsLeft: number, multiplier: number, totalText: string): void {
    this.meterSpins.text = String(spinsLeft);
    this.meterMult.text = `×${multiplier}`;
    this.meterMult.scale.set(multiplier >= 100 ? 0.68 : multiplier >= 10 ? 0.82 : 1);
    this.meterTotal.text = totalText;
    this.meterTotal.scale.set(Math.min(1, 9 / Math.max(1, totalText.length)));
  }

  /** Flies a spark from each given cell to the multiplier medal, then pops it. */
  async bumpMultiplier(cells: Array<[number, number]>, onArrive: () => void): Promise<void> {
    const target = { x: this.meterMedal.x, y: this.meterMedal.y };
    await Promise.all(
      cells.map(async ([r, row], i) => {
        const from = this.reels.cellCenter(r, row);
        const orb = new Sprite(this.tex.glow);
        orb.anchor.set(0.5);
        orb.blendMode = 'add';
        orb.tint = 0xd9a0ff;
        orb.scale.set(0.9);
        orb.position.set(from.x, from.y);
        this.reels.overlay.addChild(orb);
        await this.anim.wait(i * 70);
        const cx = (from.x + target.x) / 2 + (from.x < target.x ? -160 : 160);
        const cy = Math.min(from.y, target.y) - 120;
        await this.anim.run(420, (t) => {
          const k = ease.inOutQuad(t);
          const a = (1 - k) * (1 - k);
          const b = 2 * (1 - k) * k;
          const c = k * k;
          orb.position.set(a * from.x + b * cx + c * target.x, a * from.y + b * cy + c * target.y);
          this.particles.burst(orb.x, orb.y, {
            texture: this.tex.spark,
            count: 1,
            tints: [0xd9a0ff, 0xffffff],
            speed: [10, 60],
            life: [200, 450],
            scale: [0.15, 0.4],
            additive: true,
          });
        });
        orb.destroy();
      }),
    );
    onArrive();
    this.particles.burst(target.x, target.y, {
      texture: this.tex.spark,
      count: 18,
      tints: [0xffd977, 0xffffff, 0xffa53a],
      speed: [120, 420],
      life: [350, 800],
      scale: [0.25, 0.7],
      additive: true,
    });
    await this.anim.run(320, (t) => this.meterMedal.scale.set(1 + 0.35 * (1 - ease.outElastic(t))));
    this.meterMedal.scale.set(1);
  }

  /** Milestone flourish on the multiplier medal. */
  medalBurst(text: string): void {
    const p = this.toScreen(this.meterMedal.x, this.meterMedal.y);
    this.ring(p.x, p.y, 0xffd977, this.cell * 7, 800);
    this.ring(p.x, p.y, 0xffffff, this.cell * 4, 550);
    this.screenFlash(0.22, 300, 0xffd977);
    this.shake(10);
    const t = new Text({ text, style: goldText(96) });
    t.anchor.set(0.5);
    t.position.set(REEL_W / 2, REEL_H / 2);
    this.reels.overlay.addChild(t);
    void this.anim
      .run(
        1000,
        (k) => {
          t.scale.set(0.5 + 1.1 * ease.outBack(Math.min(1, k * 3)));
          t.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        },
        true,
      )
      .then(() => t.destroy());
  }

  /** Small caption that rises from a cell (e.g. "+1 SPIN"). */
  floatText(reel: number, row: number, text: string, fill = 0xfff0c2): void {
    const { x, y } = this.reels.cellCenter(reel, row);
    const t = new Text({ text, style: goldText(46, { fill }) });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.reels.overlay.addChild(t);
    void this.anim
      .run(1100, (k) => {
        t.y = y - 90 * ease.outCubic(k);
        t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        t.scale.set(0.6 + 0.4 * ease.outBack(Math.min(1, k * 4)));
      })
      .then(() => t.destroy());
  }

  // ── Win amount over the reels ───────────────────────────────────────────
  showWinPopup(text: string, emphasis: number): void {
    this.winPopup.text = text;
    this.winPopup.visible = true;
    this.winPopup.scale.set(Math.min(1, (REEL_W * 0.86) / Math.max(1, this.winPopup.width / this.winPopup.scale.x)) * emphasis);
  }

  popWinPopup(): Promise<void> {
    const s = this.winPopup.scale.x;
    return this.anim.run(260, (t) => this.winPopup.scale.set(s * (0.6 + 0.4 * ease.outBack(t))));
  }

  hideWinPopup(): void {
    this.winPopup.visible = false;
  }

  // ── Vault doors ─────────────────────────────────────────────────────────
  private placeDoors(closed: number): void {
    const half = this.viewW / 2 + 2;
    this.doorL.x = -2 + half * closed;
    this.doorR.x = this.viewW + 2 - half * closed;
  }

  async closeDoors(title: string, sub: string): Promise<void> {
    this.doorL.visible = this.doorR.visible = true;
    await this.anim.run(this.reducedMotion ? 120 : 520, (t) => this.placeDoors(ease.inCubic(t)));
    this.shake(14);
    this.screenParticles.burst(this.viewW / 2, this.viewH / 2, {
      texture: this.tex.spark,
      count: 26,
      tints: [0xffd977, 0xffffff],
      speed: [100, 700],
      angle: -Math.PI / 2,
      spread: Math.PI * 2,
      life: [300, 800],
      scale: [0.3, 0.8],
      additive: true,
    });
    this.doorTitle.text = title;
    this.doorSub.text = sub;
    this.doorTitle.visible = true;
    this.doorSub.visible = sub !== '';
    const s = this.doorTitle.scale.x;
    const fit = Math.min(1, (this.viewW * 0.9) / Math.max(1, this.doorTitle.width));
    await this.anim.run(380, (t) => {
      const k = ease.outBack(t);
      this.doorTitle.scale.set(s * fit * (0.5 + 0.5 * k));
      this.doorTitle.alpha = Math.min(1, t * 3);
      this.doorSub.alpha = Math.min(1, t * 2);
    });
  }

  setDoorAmount(text: string | null): void {
    this.doorAmount.visible = text !== null;
    if (text !== null) this.doorAmount.text = text;
  }

  async openDoors(): Promise<void> {
    const s = Math.min(this.viewW / 1100, this.viewH / 900);
    await this.anim.run(180, (t) => {
      this.doorTitle.alpha = this.doorSub.alpha = this.doorAmount.alpha = 1 - t;
    });
    this.doorTitle.visible = this.doorSub.visible = this.doorAmount.visible = false;
    this.doorTitle.alpha = this.doorSub.alpha = this.doorAmount.alpha = 1;
    this.doorTitle.scale.set(s);
    await this.anim.run(this.reducedMotion ? 120 : 620, (t) => this.placeDoors(1 - ease.inOutCubic(t)));
    this.doorL.visible = this.doorR.visible = false;
  }

  // ── Big win ─────────────────────────────────────────────────────────────
  showBigWin(tier: WinTier, amount: string): void {
    this.bigWin.visible = true;
    this.bigWin.alpha = 1;
    this.bigDim.alpha = 0;
    void this.anim.tween(this.bigDim, { alpha: 1 }, 220);
    this.bigTitle.text = '';
    this.setBigWin(tier, amount);
  }

  /** Updates the celebration. A new tier slams its title in with a shockwave. */
  setBigWin(tier: WinTier, amount: string): void {
    const title = TIER_TITLES[tier];
    const changed = this.bigTitle.text !== title;
    this.bigTitle.text = title;
    this.bigAmount.text = amount;
    if (!changed) return;
    const tint = [0xffb347, 0xffb347, 0xff7ad9, 0xb98cff][tier];
    this.bigRays.tint = tint;
    this.bigRays.alpha = 0.3 + tier * 0.08;
    this.rain = tier;
    const s = this.bigS;
    const fit = Math.min(1, (this.viewW * 0.92) / Math.max(1, this.bigTitle.width / this.bigTitle.scale.x) / s);
    const big = this.reducedMotion ? 1.15 : 2.6;
    void this.anim.run(
      460,
      (t) => {
        // Drop in oversized, hit, then settle.
        const k = t < 0.4 ? big + (0.9 - big) * ease.inCubic(t / 0.4) : 0.9 + 0.1 * ease.outBack((t - 0.4) / 0.6);
        this.bigTitle.scale.set(s * fit * k);
        this.bigTitle.alpha = Math.min(1, t * 5);
      },
      true,
    );
    void this.anim.run(180, () => undefined, true).then(() => {
      if (!this.bigWin.visible) return;
      this.shake(10 + tier * 7);
      this.screenFlash(0.22 + tier * 0.08, 320, tint);
      this.ring(this.bigTitle.x, this.bigTitle.y, tint, Math.max(this.viewW, this.viewH) * (0.9 + tier * 0.25), 800);
      this.coinBurst(26 + tier * 22);
      this.amountPunch = 0.2;
    });
  }

  /** Tiny kick on the amount, called as the count ticks. */
  bumpAmount(): void {
    if (!this.reducedMotion) this.amountPunch = Math.max(this.amountPunch, 0.035);
  }

  /** The count has landed on the final amount. */
  bigWinFinale(): void {
    this.rain = 0;
    this.amountPunch = this.reducedMotion ? 0 : 0.4;
    const tint = this.bigRays.tint;
    this.ring(this.bigAmount.x, this.bigAmount.y, 0xffffff, Math.max(this.viewW, this.viewH) * 1.2, 900);
    this.ring(this.bigAmount.x, this.bigAmount.y, tint, Math.max(this.viewW, this.viewH) * 0.7, 700);
    this.screenFlash(0.3, 380);
    this.shake(16);
    this.coinBurst(70);
    this.screenParticles.burst(this.bigAmount.x, this.bigAmount.y, {
      texture: this.tex.spark,
      count: 40,
      tints: [0xffd977, 0xffffff, tint],
      speed: [200, 900],
      life: [500, 1200],
      scale: [0.3, 0.9],
      additive: true,
    });
  }

  coinBurst(count: number): void {
    const w = this.viewW;
    const h = this.viewH;
    const k = Math.min(w, h) / 800;
    this.screenParticles.burst(w / 2, h * 0.62, {
      texture: this.tex.coin,
      count,
      speed: [500 * k, 1300 * k],
      angle: -Math.PI / 2,
      spread: 1.5,
      gravity: 1500 * k,
      life: [1100, 2000],
      scale: [0.45 * k, 0.85 * k],
      endScale: 1,
      spin: 9,
      radius: 60 * k,
    });
  }

  async hideBigWin(): Promise<void> {
    this.rain = 0;
    await this.anim.tween(this.bigWin, { alpha: 0 }, 300);
    this.bigWin.visible = false;
    this.screenParticles.clear();
  }

  get cell(): number {
    return CELL * this.scale;
  }
}
