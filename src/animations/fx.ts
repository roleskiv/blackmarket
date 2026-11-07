/**
 * PixiJS particle layer: ambient dust, smoke, bursts and sparkles.
 * A single transparent full-screen canvas sits above the game with
 * pointer-events disabled. If WebGL/Pixi fails to start, every call no-ops.
 */
import type { Application, Container, Sprite, Texture } from 'pixi.js';

// PixiJS is loaded lazily so the game screen paints before the particle engine downloads.
let PIXI: typeof import('pixi.js') | null = null;
/** Fewer particles and a lower render resolution on small / touch screens. */
const isSmall = () => window.innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
const density = () => (isSmall() ? 0.5 : 1);

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  fade: number;
  gravity: number;
  spin: number;
  ambient?: boolean;
  baseAlpha: number;
}

function softDot(size: number, hard = 0.0): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return PIXI!.Texture.from(c);
}

function spark(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.translate(size / 2, size / 2);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size / 2 : size / 9;
    const a = (i / 8) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return PIXI!.Texture.from(c);
}

const hex = (c: string) => parseInt(c.replace('#', ''), 16);

class FxLayer {
  private app: Application | null = null;
  private layer!: Container;
  private particles: Particle[] = [];
  private tex: { dot: Texture; smoke: Texture; spark: Texture } | null = null;
  enabled = true;
  private ambientOn = true;

  async mount(host: HTMLElement) {
    if (this.app) return;
    try {
      PIXI = await import('pixi.js');
      this.layer = new PIXI.Container();
      const app = new PIXI.Application();
      await app.init({
        backgroundAlpha: 0,
        resizeTo: window,
        antialias: false,
        autoDensity: true,
        // Soft glows don't need retina pixels; rendering the full-screen layer at 1× cuts fill cost up to 4×.
        resolution: Math.min(window.devicePixelRatio || 1, isSmall() ? 1 : 1.25),
        preference: 'webgl',
      });
      app.canvas.style.position = 'fixed';
      app.canvas.style.inset = '0';
      app.canvas.style.pointerEvents = 'none';
      app.canvas.style.zIndex = '60';
      host.appendChild(app.canvas);
      this.tex = { dot: softDot(32, 0.15), smoke: softDot(128, 0), spark: spark(32) };
      app.stage.addChild(this.layer);
      app.ticker.add((t) => this.update(t.deltaTime));
      this.app = app;
      this.seedAmbient();
    } catch (e) {
      console.warn('[fx] Pixi unavailable, particles disabled', e);
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.ambientOn = on;
    if (!on) this.clear();
    else this.seedAmbient();
  }

  private clear() {
    for (const p of this.particles) p.s.destroy();
    this.particles = [];
  }

  private add(tex: Texture, x: number, y: number, o: Partial<Particle> & { tint: number; scale: number; alpha?: number; blend?: 'add' | 'normal' }) {
    const s = new PIXI!.Sprite(tex);
    s.anchor.set(0.5);
    s.x = x;
    s.y = y;
    s.tint = o.tint;
    s.scale.set(o.scale);
    s.alpha = o.alpha ?? 1;
    s.blendMode = o.blend === 'normal' ? 'normal' : 'add';
    this.layer.addChild(s);
    this.particles.push({
      s,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      life: 0,
      max: o.max ?? 60,
      grow: o.grow ?? 0,
      fade: o.fade ?? 1,
      gravity: o.gravity ?? 0,
      spin: o.spin ?? 0,
      ambient: o.ambient,
      baseAlpha: o.alpha ?? 1,
    });
  }

  private seedAmbient() {
    if (!this.app || !this.tex || !this.ambientOn) return;
    const existing = this.particles.filter((p) => p.ambient).length;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const target = Math.round(Math.min(70, (W * H) / 18000) * density());
    for (let i = existing; i < target; i++) this.ambientDust(Math.random() * W, Math.random() * H, true);
  }

  private ambientDust(x: number, y: number, randomAge = false) {
    const colors = [0xc9a24a, 0xb45cff, 0xf1d58a, 0x7dff6a];
    this.add(this.tex!.dot, x, y, {
      tint: colors[Math.floor(Math.random() * (Math.random() < 0.85 ? 2 : 4))],
      scale: 0.06 + Math.random() * 0.14,
      alpha: 0.15 + Math.random() * 0.35,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -0.05 - Math.random() * 0.25,
      max: 400 + Math.random() * 500,
      ambient: true,
      fade: 0,
    });
    if (randomAge) this.particles[this.particles.length - 1].life = Math.random() * 300;
  }

  private update(dt: number) {
    const H = window.innerHeight;
    const W = window.innerWidth;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.vy += p.gravity * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      if (p.grow) p.s.scale.set(p.s.scale.x + p.grow * dt);
      const k = p.life / p.max;
      if (p.ambient) {
        p.s.alpha = p.baseAlpha * Math.sin(Math.min(1, k) * Math.PI);
        p.vx += (Math.random() - 0.5) * 0.01;
      } else {
        p.s.alpha = p.baseAlpha * Math.max(0, 1 - Math.pow(k, p.fade + 0.6));
      }
      if (p.life >= p.max || p.s.y < -40 || p.s.y > H + 80 || p.s.x < -80 || p.s.x > W + 80) {
        const wasAmbient = p.ambient;
        p.s.destroy();
        this.particles.splice(i, 1);
        if (wasAmbient && this.ambientOn) this.ambientDust(Math.random() * W, H * (0.3 + Math.random() * 0.7));
      }
    }
  }

  burst(x: number, y: number, colors: string[], count = 60, power = 1) {
    count = Math.max(1, Math.round(count * density()));
    if (!this.app || !this.tex || !this.enabled) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (2 + Math.random() * 7) * power;
      this.add(Math.random() < 0.4 ? this.tex.spark : this.tex.dot, x, y, {
        tint: hex(colors[i % colors.length]),
        scale: 0.2 + Math.random() * 0.5,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 2,
        gravity: 0.12,
        max: 50 + Math.random() * 50,
        spin: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  smoke(x: number, y: number, color = '#7a3cc0', count = 14, spread = 60) {
    count = Math.max(1, Math.round(count * density()));
    if (!this.app || !this.tex || !this.enabled) return;
    for (let i = 0; i < count; i++) {
      this.add(this.tex.smoke, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.6, {
        tint: hex(color),
        scale: 0.4 + Math.random() * 0.6,
        alpha: 0.12 + Math.random() * 0.14,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -0.3 - Math.random() * 0.8,
        grow: 0.01 + Math.random() * 0.015,
        max: 80 + Math.random() * 70,
        blend: Math.random() < 0.8 ? 'normal' : 'add',
      });
    }
  }

  sparkle(x: number, y: number, w: number, h: number, color: string, count = 8) {
    count = Math.max(1, Math.round(count * density()));
    if (!this.app || !this.tex || !this.enabled) return;
    for (let i = 0; i < count; i++) {
      this.add(this.tex.spark, x + Math.random() * w, y + Math.random() * h, {
        tint: hex(color),
        scale: 0.15 + Math.random() * 0.35,
        vy: -0.4 - Math.random(),
        vx: (Math.random() - 0.5) * 0.6,
        max: 35 + Math.random() * 30,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  /** A stream of golden coins/light rising from a point (big wins, vault). */
  fountain(x: number, y: number, colors: string[], count = 80) {
    count = Math.max(1, Math.round(count * density()));
    if (!this.app || !this.tex || !this.enabled) return;
    for (let i = 0; i < count; i++) {
      this.add(this.tex.dot, x + (Math.random() - 0.5) * 80, y, {
        tint: hex(colors[i % colors.length]),
        scale: 0.15 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 6,
        vy: -6 - Math.random() * 9,
        gravity: 0.22,
        max: 90 + Math.random() * 40,
      });
    }
  }
}

export const fx = new FxLayer();

/** Centre of a DOM element in viewport coordinates. */
export function centerOf(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
