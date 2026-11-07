/**
 * Procedurally synthesises the prototype's ORIGINAL sound effects and loops
 * into public/assets/audio/*.wav (22.05 kHz mono, 16-bit).
 * No samples are used — everything is generated from oscillators and noise,
 * so the audio is original and license-free. Replace any file with a final
 * sound of the same name; the game picks it up without code changes.
 *
 *   npm run gen:audio
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 22050;
const OUT = join(process.cwd(), 'public/assets/audio');
mkdirSync(OUT, { recursive: true });

let seed = 1337;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const TAU = Math.PI * 2;
const buf = (sec) => new Float32Array(Math.round(sec * SR));
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const note = (n) => 440 * 2 ** ((n - 69) / 12);

function writeWav(name, data, gain = 0.9) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? gain / peak : 1;
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * k * 32767))), 44 + i * 2));
  writeFileSync(join(OUT, `${name}.wav`), b);
  console.log(`${name}.wav  ${(b.length / 1024).toFixed(0)} KB`);
}

/** One-pole low-pass in place. */
function lowpass(d, cutoff) {
  const a = 1 - Math.exp((-TAU * cutoff) / SR);
  let y = 0;
  for (let i = 0; i < d.length; i++) d[i] = y += a * (d[i] - y);
  return d;
}
function add(d, start, fn, len) {
  const s0 = Math.round(start * SR);
  const n = Math.round(len * SR);
  for (let i = 0; i < n && s0 + i < d.length; i++) d[s0 + i] += fn(i / SR);
}
/** Crossfade the tail into the head so a loop is seamless. */
function makeLoop(d, fade = 0.5) {
  const n = Math.round(fade * SR);
  const out = d.slice(0, d.length - n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out[i] = out[i] * t + d[d.length - n + i] * (1 - t);
  }
  return out;
}
const bell = (f, dur = 1.2, amp = 1) => (t) =>
  amp * env(t, 0.003, dur / 4) * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t) + 0.25 * Math.sin(TAU * f * 5.4 * t));
const thunk = (f = 70, amp = 1) => (t) => amp * env(t, 0.002, 0.06) * Math.sin(TAU * f * t * (1 + 2 * Math.exp(-t * 40)));

// ── Ambience: underground market drone, murmur and distant clinks ──────────
{
  const d = buf(12.5);
  const noise = lowpass(Float32Array.from(d, () => rand()), 300);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const lfo = 0.6 + 0.4 * Math.sin(TAU * 0.11 * t);
    d[i] = 0.35 * Math.sin(TAU * 55 * t) * lfo + 0.25 * Math.sin(TAU * 82.4 * t + Math.sin(TAU * 0.3 * t)) + 0.2 * Math.sin(TAU * 110.3 * t) * (1 - lfo) + noise[i] * 2.2 * (0.6 + 0.4 * Math.sin(TAU * 0.07 * t));
  }
  for (let k = 0; k < 9; k++) add(d, 0.5 + k * 1.3 + rand() * 0.3, bell(1800 + rand() * 900, 0.6, 0.05), 0.6);
  writeWav('ambience', makeLoop(d, 0.5), 0.6);
}
// ── Bonus music: pulsing minor arpeggio over drone ─────────────────────────
{
  const d = buf(8.5);
  const seq = [57, 60, 64, 69, 67, 64, 60, 64, 57, 60, 65, 69, 67, 65, 62, 65];
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    d[i] = 0.3 * Math.sin(TAU * 55 * t) + 0.15 * Math.sin(TAU * 82.4 * t);
  }
  for (let bar = 0; bar < 2; bar++)
    seq.forEach((n, j) => add(d, bar * 4 + j * 0.25, (t) => 0.35 * env(t, 0.005, 0.18) * (Math.sin(TAU * note(n) * t) + 0.3 * Math.sin(TAU * note(n) * 2 * t)), 0.5));
  for (let b = 0; b < 16; b++) add(d, b * 0.5, thunk(55, 0.6), 0.3);
  writeWav('bonus_music', makeLoop(d, 0.5), 0.6);
}
// ── Reel spin loop: mechanical ratchet ────────────────────────────────────
{
  const d = buf(1.05);
  for (let k = 0; k < 24; k++) add(d, k * 0.042, (t) => env(t, 0.001, 0.008) * rand() * 0.7 + env(t, 0.001, 0.01) * Math.sin(TAU * 900 * t) * 0.3, 0.03);
  for (let i = 0; i < d.length; i++) d[i] += 0.15 * Math.sin(TAU * 60 * (i / SR));
  writeWav('reel_spin', makeLoop(d, 0.05), 0.5);
}
// ── Reel stop, click, coin, scatter, wild ─────────────────────────────────
{
  const d = buf(0.25);
  add(d, 0, thunk(75), 0.25);
  add(d, 0, (t) => env(t, 0.001, 0.01) * rand() * 0.6, 0.05);
  writeWav('reel_stop', d, 0.8);
}
{
  const d = buf(0.06);
  add(d, 0, (t) => env(t, 0.001, 0.01) * Math.sin(TAU * 1600 * t), 0.06);
  writeWav('click', d, 0.5);
}
{
  const d = buf(0.25);
  add(d, 0, bell(2093, 0.25, 0.8), 0.25);
  add(d, 0.04, bell(2637, 0.25, 0.6), 0.2);
  writeWav('coin', d, 0.5);
}
{
  const d = buf(1.6);
  [72, 76, 79, 84].forEach((n, i) => add(d, i * 0.06, bell(note(n), 1.4, 0.7), 1.5));
  writeWav('scatter_land', d, 0.8);
}
{
  const d = buf(1.2);
  add(d, 0, (t) => env(t, 0.05, 0.25) * rand() * Math.sin(TAU * (300 + 1200 * t) * t) * 0.5, 0.6);
  [57, 64, 69].forEach((n) => add(d, 0.08, (t) => 0.4 * env(t, 0.01, 0.4) * Math.sin(TAU * note(n) * t + 2 * Math.sin(TAU * 3 * note(n) * t) * Math.exp(-t * 3)), 1.1));
  writeWav('wild_land', lowpass(d, 4000), 0.8);
}
// ── Wins ──────────────────────────────────────────────────────────────────
{
  const d = buf(1.1);
  [69, 72, 76].forEach((n, i) => add(d, i * 0.08, bell(note(n), 0.9, 0.7), 1));
  writeWav('win_small', d, 0.7);
}
{
  const d = buf(3.2);
  const ladder = [57, 60, 64, 69, 72, 76, 81];
  ladder.forEach((n, i) => add(d, i * 0.11, (t) => 0.5 * env(t, 0.01, 0.5) * (Math.sin(TAU * note(n) * t) + 0.4 * Math.sin(TAU * note(n) * 3 * t)), 1.2));
  [69, 73, 76, 81].forEach((n) => add(d, 0.85, (t) => 0.35 * env(t, 0.05, 1.0) * (Math.sin(TAU * note(n) * t) + 0.5 * Math.sin(TAU * note(n) * 1.005 * t)), 2.3));
  for (let k = 0; k < 30; k++) add(d, 0.9 + k * 0.07, bell(1500 + Math.abs(rand()) * 2500, 0.3, 0.12), 0.3);
  add(d, 0.85, thunk(50, 1), 0.4);
  writeWav('win_big', d, 0.9);
}
// ── Crate: rattle, burst ──────────────────────────────────────────────────
{
  const d = buf(1.4);
  for (let k = 0; k < 18; k++) add(d, k * 0.07 + Math.abs(rand()) * 0.02, (t) => env(t, 0.001, 0.02) * (rand() * 0.5 + Math.sin(TAU * (180 + k * 6) * t)) * (0.4 + k / 30), 0.08);
  add(d, 0, (t) => 0.2 * Math.sin(TAU * (200 + 400 * t) * t) * env(t, 1.0, 0.3), 1.4);
  writeWav('crate_shake', lowpass(d, 3000), 0.8);
}
{
  const d = buf(2.0);
  add(d, 0, (t) => env(t, 0.002, 0.15) * rand(), 0.8);
  add(d, 0, thunk(55, 1.2), 0.4);
  [64, 68, 71, 76].forEach((n) => add(d, 0.05, (t) => 0.4 * env(t, 0.02, 0.7) * Math.sin(TAU * note(n) * t), 1.9));
  for (let k = 0; k < 16; k++) add(d, 0.1 + k * 0.05, bell(2000 + Math.abs(rand()) * 3000, 0.25, 0.1), 0.25);
  writeWav('crate_open', d, 0.9);
}
// ── Magic activation (shimmer sweep) ──────────────────────────────────────
{
  const d = buf(1.3);
  add(d, 0, (t) => env(t, 0.3, 0.3) * Math.sin(TAU * (400 * t + 900 * t * t)) * 0.5, 1.3);
  for (let k = 0; k < 20; k++) add(d, k * 0.045, bell(1200 + k * 120, 0.3, 0.2), 0.3);
  writeWav('magic', d, 0.7);
}
// ── Dealer reaction: low formant "hmmm" ───────────────────────────────────
{
  const d = buf(1.3);
  const f0 = 82;
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (TAU * f0 * (1 - 0.08 * t)) / SR;
    let v = 0;
    for (let h = 1; h < 30; h++) {
      const f = f0 * h;
      const formant = Math.exp(-((f - 500) ** 2) / 20000) + 0.6 * Math.exp(-((f - 1000) ** 2) / 40000) + 0.2;
      v += (Math.sin(h * ph) / h) * formant;
    }
    d[i] = v * env(t, 0.15, 0.5);
  }
  writeWav('dealer', lowpass(d, 2500), 0.7);
}
// ── Vault: clunks, rumble, creak, golden swell ────────────────────────────
{
  const d = buf(4.2);
  [0, 0.45, 0.9].forEach((s) => {
    add(d, s, thunk(60, 1.2), 0.35);
    add(d, s, (t) => env(t, 0.001, 0.03) * rand() * 0.8, 0.1);
    add(d, s + 0.05, bell(900, 0.3, 0.3), 0.3);
  });
  const rumble = lowpass(Float32Array.from(buf(2.6), () => rand()), 120);
  add(d, 1.4, (t) => rumble[Math.min(rumble.length - 1, Math.round(t * SR))] * 5 * env(t, 0.3, 0.8), 2.6);
  add(d, 1.4, (t) => 0.25 * env(t, 0.2, 0.6) * Math.sin(TAU * (140 + 40 * Math.sin(TAU * 3 * t)) * t), 1.6);
  [57, 64, 69, 73].forEach((n) => add(d, 2.0, (t) => 0.3 * env(t, 0.4, 1.0) * Math.sin(TAU * note(n) * t), 2.2));
  writeWav('vault', d, 0.9);
}
// ── Transition whoosh ─────────────────────────────────────────────────────
{
  const d = buf(1.2);
  const n = Float32Array.from(d, () => rand());
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const cutoff = 200 + 3000 * Math.sin(Math.PI * Math.min(1, t / 1.1));
    const a = 1 - Math.exp((-TAU * cutoff) / SR);
    y += a * (n[i] - y);
    d[i] = y * Math.sin(Math.PI * Math.min(1, t / 1.2));
  }
  writeWav('transition', d, 0.7);
}
// ── Artifact collect ──────────────────────────────────────────────────────
{
  const d = buf(1.0);
  [76, 79, 83, 88].forEach((n, i) => add(d, i * 0.05, bell(note(n), 0.8, 0.6), 0.9));
  writeWav('artifact', d, 0.7);
}
