/**
 * Texture loading. Bitmap art is addressed by filename only, so any image
 * can be replaced by dropping a new file with the same name into
 * public/assets (no code changes). Small effect textures are drawn here at
 * start-up instead of shipping as files.
 */
import { Assets, Texture } from 'pixi.js';
import { SYMBOLS } from '../../engine/symbols';

export interface GameTextures {
  symbols: Texture[];
  /** Vertically smeared copies shown while a reel is at full speed. */
  blurred: Texture[];
  frame: Texture;
  logo: Texture;
  bgMarket: Texture;
  bgVault: Texture;
  glow: Texture;
  spark: Texture;
  coin: Texture;
  fog: Texture;
  rays: Texture;
  cellGlow: Texture;
  door: Texture;
  smoke: Texture;
}

const base = import.meta.env.BASE_URL;
export const assetUrl = (path: string): string => `${base}assets/${path}`;
export const symbolUrl = (id: number): string => assetUrl(`symbols/${SYMBOLS[id].key}.png`);

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function glowTexture(): Texture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

function sparkTexture(): Texture {
  const [c, g] = canvas(64, 64);
  g.translate(32, 32);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  for (let i = 0; i < 2; i++) {
    g.beginPath();
    g.moveTo(0, -30);
    g.quadraticCurveTo(2.5, -2.5, 30, 0);
    g.quadraticCurveTo(2.5, 2.5, 0, 30);
    g.quadraticCurveTo(-2.5, 2.5, -30, 0);
    g.quadraticCurveTo(-2.5, -2.5, 0, -30);
    g.fill();
    g.rotate(Math.PI / 4);
    g.scale(0.55, 0.55);
  }
  return Texture.from(c);
}

function coinTexture(): Texture {
  const [c, g] = canvas(64, 64);
  const grad = g.createLinearGradient(8, 8, 56, 56);
  grad.addColorStop(0, '#fff3b8');
  grad.addColorStop(0.45, '#f0b93c');
  grad.addColorStop(1, '#8a5712');
  g.fillStyle = '#2a1608';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(90,50,8,0.75)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 32, 18, 0, Math.PI * 2);
  g.stroke();
  // Raven-eye motif
  g.fillStyle = 'rgba(90,50,8,0.8)';
  g.beginPath();
  g.ellipse(32, 32, 10, 5.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(22, 20, 7, 3.5, -0.7, 0, Math.PI * 2);
  g.fill();
  return Texture.from(c);
}

/** Soft tileable cloud layer for drifting fog. */
function fogTexture(): Texture {
  const size = 512;
  const [c, g] = canvas(size, size);
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 40 + rnd() * 110;
    const a = 0.03 + rnd() * 0.06;
    // Draw with wrap-around so the texture tiles.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        grad.addColorStop(0, `rgba(255,255,255,${a})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  const t = Texture.from(c);
  t.source.addressMode = 'repeat';
  return t;
}

function raysTexture(): Texture {
  const size = 512;
  const [c, g] = canvas(size, size);
  g.translate(size / 2, size / 2);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = (Math.PI / n) * (i % 2 ? 0.55 : 0.8);
    const grad = g.createRadialGradient(0, 0, 10, 0, 0, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, size / 2, a - w / 2, a + w / 2);
    g.closePath();
    g.fill();
  }
  return Texture.from(c);
}

function cellGlowTexture(): Texture {
  const [c, g] = canvas(256, 256);
  g.shadowColor = '#fff';
  g.shadowBlur = 22;
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  for (let i = 0; i < 2; i++) {
    g.beginPath();
    g.roundRect(34, 34, 188, 188, 22);
    g.stroke();
  }
  const fill = g.createRadialGradient(128, 128, 20, 128, 128, 120);
  fill.addColorStop(0, 'rgba(255,255,255,0.28)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.shadowBlur = 0;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(34, 34, 188, 188, 22);
  g.fill();
  return Texture.from(c);
}

/** One leaf of the vault door used for scene transitions. */
function doorTexture(): Texture {
  const w = 512;
  const h = 1024;
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#1a0c12');
  grad.addColorStop(0.5, '#3a1f2a');
  grad.addColorStop(0.92, '#2a141c');
  grad.addColorStop(1, '#0d0508');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Plates
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 6;
  for (let y = 0; y < h; y += 256) g.strokeRect(20, y + 12, w - 60, 232);
  g.fillStyle = '#c9963c';
  for (let y = 40; y < h; y += 128) {
    for (const x of [48, w - 72]) {
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Gold leading edge
  const edge = g.createLinearGradient(w - 26, 0, w, 0);
  edge.addColorStop(0, '#6e4513');
  edge.addColorStop(0.5, '#fbe7a1');
  edge.addColorStop(1, '#8a5a1c');
  g.fillStyle = edge;
  g.fillRect(w - 26, 0, 26, h);
  return Texture.from(c);
}

function smokeTexture(): Texture {
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 9; i++) {
    const x = 64 + Math.cos(i * 2.4) * 22;
    const y = 64 + Math.sin(i * 2.4) * 22;
    const grad = g.createRadialGradient(x, y, 0, x, y, 40);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return Texture.from(c);
}

function blurredCopy(tex: Texture): Texture {
  const src = tex.source.resource as CanvasImageSource;
  const [c, g] = canvas(128, 176);
  const steps = 25;
  g.globalAlpha = 1 / (steps * 0.42);
  for (let i = 0; i < steps; i++) {
    const dy = (i / (steps - 1)) * 48;
    g.drawImage(src, 0, dy, 128, 128);
  }
  return Texture.from(c);
}

/** Labelled stand-in used when an art file is missing, so a gap is obvious. */
function placeholder(label: string): Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3a1f5c';
  g.strokeStyle = '#e9c877';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(24, 24, 208, 208, 24);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 26px sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 128, 120);
  g.font = '500 16px sans-serif';
  g.fillText('ART MISSING', 128, 150);
  return Texture.from(c);
}

async function loadOr(url: string, label: string): Promise<Texture> {
  try {
    return (await Assets.load(url)) as Texture;
  } catch {
    return placeholder(label);
  }
}

export async function loadTextures(onProgress: (fraction: number) => void): Promise<GameTextures> {
  const jobs: Array<Promise<Texture>> = [
    ...SYMBOLS.map((s) => loadOr(symbolUrl(s.id), s.name)),
    loadOr(assetUrl('ui/frame.png'), 'frame'),
    loadOr(assetUrl('ui/logo.png'), 'logo'),
    loadOr(assetUrl('bg/market.jpg'), 'market'),
    loadOr(assetUrl('bg/vault.jpg'), 'vault'),
  ];
  let done = 0;
  for (const j of jobs) void j.then(() => onProgress(++done / jobs.length));
  const all = await Promise.all(jobs);
  const symbols = all.slice(0, SYMBOLS.length);
  const [frame, logo, bgMarket, bgVault] = all.slice(SYMBOLS.length);
  return {
    symbols,
    blurred: symbols.map(blurredCopy),
    frame,
    logo,
    bgMarket,
    bgVault,
    glow: glowTexture(),
    spark: sparkTexture(),
    coin: coinTexture(),
    fog: fogTexture(),
    rays: raysTexture(),
    cellGlow: cellGlowTexture(),
    door: doorTexture(),
    smoke: smokeTexture(),
  };
}
