/** Lightweight sprite particle system. */
import { Container, Sprite, type Texture } from 'pixi.js';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  spin: number;
  life: number;
  maxLife: number;
  scale0: number;
  scale1: number;
  alpha: number;
  fadeIn: number;
}

export interface BurstOptions {
  texture: Texture;
  count: number;
  tints?: number[];
  /** Speed range in px/s. */
  speed?: [number, number];
  /** Emission cone: centre angle and spread, radians. Default: all directions. */
  angle?: number;
  spread?: number;
  gravity?: number;
  drag?: number;
  life?: [number, number];
  scale?: [number, number];
  endScale?: number;
  alpha?: number;
  additive?: boolean;
  spin?: number;
  /** Random offset radius for the spawn point. */
  radius?: number;
  fadeIn?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  readonly container = new Container();
  private live: Particle[] = [];
  private pool: Sprite[] = [];
  /** Hard cap so effects can never run away on slow devices. */
  maxParticles = 420;
  enabled = true;

  burst(x: number, y: number, o: BurstOptions): void {
    if (!this.enabled) return;
    const speed = o.speed ?? [80, 240];
    const life = o.life ?? [500, 1100];
    const scale = o.scale ?? [0.3, 0.7];
    for (let i = 0; i < o.count && this.live.length < this.maxParticles; i++) {
      const s = this.pool.pop() ?? new Sprite();
      s.texture = o.texture;
      s.anchor.set(0.5);
      s.blendMode = o.additive ? 'add' : 'normal';
      s.tint = o.tints ? o.tints[(Math.random() * o.tints.length) | 0] : 0xffffff;
      const a = o.angle === undefined ? rand(0, Math.PI * 2) : o.angle + rand(-0.5, 0.5) * (o.spread ?? 0.6);
      const v = rand(speed[0], speed[1]);
      const r = o.radius ? rand(0, o.radius) : 0;
      const ra = rand(0, Math.PI * 2);
      s.position.set(x + Math.cos(ra) * r, y + Math.sin(ra) * r);
      s.rotation = rand(0, Math.PI * 2);
      const sc = rand(scale[0], scale[1]);
      s.scale.set(sc);
      s.alpha = 0;
      this.container.addChild(s);
      this.live.push({
        sprite: s,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 0,
        spin: (o.spin ?? 0) * rand(-1, 1),
        life: 0,
        maxLife: rand(life[0], life[1]),
        scale0: sc,
        scale1: sc * (o.endScale ?? 0.2),
        alpha: o.alpha ?? 1,
        fadeIn: o.fadeIn ?? 0.08,
      });
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dtMs;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        this.container.removeChild(p.sprite);
        this.pool.push(p.sprite);
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      const s = p.sprite;
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.rotation += p.spin * dt;
      s.scale.set(p.scale0 + (p.scale1 - p.scale0) * t);
      s.alpha = p.alpha * (t < p.fadeIn ? t / p.fadeIn : 1 - (t - p.fadeIn) / (1 - p.fadeIn));
    }
  }

  clear(): void {
    for (const p of this.live) {
      this.container.removeChild(p.sprite);
      this.pool.push(p.sprite);
    }
    this.live = [];
  }
}
