/**
 * Procedural audio. Every sound and both music loops are synthesised with
 * the Web Audio API at run time: no audio files ship with the game.
 *
 * This is a complete, original and licence-free sound set, but it is
 * synthesised rather than recorded. A studio release would normally layer
 * commissioned music and foley on top; the method names below are the cue
 * list a sound designer would deliver against.
 */
type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  type?: Wave;
  at?: number;
  dur: number;
  gain?: number;
  attack?: number;
  slideTo?: number;
  detune?: number;
  reverb?: number;
  dest?: AudioNode;
  filter?: number;
}

interface NoiseOpts {
  at?: number;
  dur: number;
  gain?: number;
  type?: BiquadFilterType;
  freq: number;
  sweepTo?: number;
  q?: number;
  attack?: number;
  reverb?: number;
  dest?: AudioNode;
}

// D natural minor, as MIDI note numbers.
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const SCALE = [62, 64, 65, 67, 69, 70, 72]; // D E F G A Bb C
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81];
// i – VI – iv – V in D minor: Dm, Bb, Gm, A
const CHORDS = [
  [50, 57, 62, 65, 69],
  [46, 53, 58, 62, 65],
  [43, 50, 55, 58, 62],
  [45, 52, 57, 61, 64],
];

export type MusicMode = 'off' | 'market' | 'vault';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private spinNode: { gain: GainNode; stop: () => void } | null = null;
  private musicMode: MusicMode = 'off';
  private wantedMode: MusicMode = 'off';
  private musicTimer: number | null = null;
  private nextStep = 0;
  private step = 0;
  private lastTick = 0;
  sfxVolume = 0.8;
  musicVolume = 0.5;
  muted = false;

  /** Must be called from a user gesture; browsers block audio before one. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.reverb.connect(wet).connect(this.master);
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(limiter).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.setMusic(this.wantedMode);
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    return buf;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.sfxVolume, t, 0.03);
    this.music.gain.setTargetAtTime(this.musicVolume * 0.55, t, 0.2);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  // ── Primitives ──────────────────────────────────────────────────────────
  private tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node = osc.connect(f);
    }
    node.connect(g);
    g.connect(o.dest ?? this.sfx);
    if (o.reverb) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      g.connect(send).connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g);
    g.connect(o.dest ?? this.sfx);
    if (o.reverb) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      g.connect(send).connect(this.reverb);
    }
    src.start(t0, Math.random());
    src.stop(t0 + o.dur + 0.05);
  }

  /** Bell-like strike: a fundamental with inharmonic partials. */
  private bell(freq: number, at: number, gain: number, dur = 1.4, dest?: AudioNode): void {
    this.tone({ freq, at, dur, gain, reverb: 0.5, dest });
    this.tone({ freq: freq * 2.76, at, dur: dur * 0.5, gain: gain * 0.35, reverb: 0.4, dest });
    this.tone({ freq: freq * 5.4, at, dur: dur * 0.25, gain: gain * 0.18, reverb: 0.3, dest });
  }

  private pluck(freq: number, at: number, gain: number, dest?: AudioNode): void {
    this.tone({ freq, type: 'triangle', at, dur: 0.38, gain, reverb: 0.35, dest });
    this.tone({ freq: freq * 2, type: 'sine', at, dur: 0.16, gain: gain * 0.4, dest });
  }

  // ── Cues ────────────────────────────────────────────────────────────────
  click(): void {
    this.tone({ freq: 900, slideTo: 620, dur: 0.05, gain: 0.12, type: 'triangle' });
  }

  spinStart(): void {
    this.noise({ freq: 280, sweepTo: 1500, dur: 0.28, gain: 0.16, q: 0.8 });
    this.tone({ freq: 120, slideTo: 60, dur: 0.14, gain: 0.25 });
  }

  /** Continuous reel whirr; call reelsQuiet() when the last reel lands. */
  reelsRunning(): void {
    const ctx = this.ctx;
    if (!ctx || this.spinNode) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 620;
    f.Q.value = 0.7;
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 17;
    lfoGain.gain.value = 0.35;
    trem.gain.value = 0.65;
    lfo.connect(lfoGain).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.15);
    src.connect(f).connect(trem).connect(g).connect(this.sfx);
    src.start();
    lfo.start();
    this.spinNode = {
      gain: g,
      stop: () => {
        src.stop();
        lfo.stop();
      },
    };
  }

  reelsQuiet(): void {
    const ctx = this.ctx;
    const n = this.spinNode;
    if (!ctx || !n) return;
    this.spinNode = null;
    n.gain.gain.cancelScheduledValues(ctx.currentTime);
    n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
    window.setTimeout(n.stop, 300);
  }

  reelStop(reel: number): void {
    const f = 150 - reel * 6;
    this.tone({ freq: f, slideTo: f * 0.5, dur: 0.11, gain: 0.3 });
    this.noise({ freq: 2400, type: 'highpass', dur: 0.03, gain: 0.08 });
  }

  /** nth scatter to land this spin (1-based): each one rings higher. */
  scatterLand(nth: number): void {
    const note = [62, 65, 69, 74, 77][Math.min(4, nth - 1)];
    this.bell(midi(note + 12), 0, 0.22);
    this.tone({ freq: midi(note - 12), dur: 0.5, gain: 0.25, slideTo: midi(note - 24) });
  }

  wildLand(): void {
    this.tone({ freq: 220, slideTo: 880, dur: 0.22, gain: 0.12, type: 'sawtooth', filter: 1800, reverb: 0.3 });
    this.bell(midi(81), 0.05, 0.1, 0.8);
  }

  /**
   * Rising tension while a reel that can still add to the trigger is
   * spinning. Each further teased reel (`nth`) starts higher and beats faster.
   */
  anticipation(ms: number, nth = 1): void {
    const dur = ms / 1000 + 0.3;
    const up = 2 ** ((nth - 1) / 4);
    this.tone({ freq: 110 * up, slideTo: 440 * up, dur, gain: 0.09, type: 'sawtooth', filter: 1400, attack: 0.2 });
    this.tone({ freq: 164.8 * up, slideTo: 659 * up, dur, gain: 0.06, type: 'sawtooth', filter: 1400, attack: 0.2 });
    this.noise({ freq: 400, sweepTo: 3200, dur, gain: 0.06, q: 2, attack: dur * 0.8 });
    // Heartbeat underneath, quickening as the reel runs on.
    const gap = Math.max(0.2, 0.4 - nth * 0.05);
    for (let at = 0, i = 0; at < dur - 0.25; at += gap * (1 - i * 0.04), i++) {
      this.tone({ freq: 62, slideTo: 40, at, dur: 0.14, gain: 0.3 });
      this.tone({ freq: 55, slideTo: 38, at: at + 0.11, dur: 0.12, gain: 0.18 });
    }
  }

  /** The teased reel delivered a Scatter. */
  anticipationHit(nth: number): void {
    this.noise({ freq: 5000, type: 'highpass', dur: 0.5, gain: 0.12, reverb: 0.5 });
    this.tone({ freq: midi(50), slideTo: midi(38), dur: 0.5, gain: 0.35 });
    [0, 4, 7, 12].forEach((n, i) => this.bell(midi(74 + nth * 2 + n), i * 0.05, 0.12, 1.2));
  }

  /** The teased reel came up empty: let the tension out gently. */
  anticipationMiss(): void {
    this.tone({ freq: 330, slideTo: 150, dur: 0.45, gain: 0.07, type: 'triangle', filter: 900, reverb: 0.3 });
    this.noise({ freq: 1800, sweepTo: 300, dur: 0.4, gain: 0.04, q: 1 });
  }

  /** Heavy hit that opens a big-win celebration. */
  impact(): void {
    this.tone({ freq: 90, slideTo: 32, dur: 0.7, gain: 0.5 });
    this.noise({ freq: 220, type: 'lowpass', dur: 0.5, gain: 0.35 });
    this.noise({ freq: 7000, type: 'highpass', dur: 0.9, gain: 0.1, reverb: 0.6 });
  }

  /** Final chord when the big-win count lands. */
  bigWinEnd(tier: number): void {
    const root = CHORDS[0];
    for (const n of root) {
      this.tone({ freq: midi(n + 12), type: 'sawtooth', dur: 1.6, gain: 0.07, filter: 2600, attack: 0.02, reverb: 0.5 });
      this.bell(midi(n + 24), 0.04, 0.09, 1.8);
    }
    this.tone({ freq: midi(root[0] - 12), dur: 1.4, gain: 0.3 });
    this.noise({ freq: 6500, type: 'highpass', dur: 1.8, gain: 0.1, reverb: 0.6 });
    this.coins(14 + tier * 6);
  }

  /** Winnings arriving at the win readout. */
  collect(): void {
    this.tone({ freq: 1568, dur: 0.09, gain: 0.07, type: 'triangle' });
    this.tone({ freq: 2093, at: 0.05, dur: 0.14, gain: 0.07, type: 'triangle', reverb: 0.2 });
  }

  crateOpen(): void {
    this.noise({ freq: 900, dur: 0.09, gain: 0.3, q: 1.5 });
    this.noise({ freq: 300, dur: 0.16, gain: 0.2, q: 1 });
    [74, 77, 81, 86].forEach((n, i) => this.pluck(midi(n), 0.06 + i * 0.05, 0.1));
  }

  crateRattle(): void {
    for (let i = 0; i < 5; i++) this.noise({ at: i * 0.07, freq: 500 + i * 60, dur: 0.05, gain: 0.12, q: 3 });
  }

  /** Win stinger, level 0 (small) to 3 (large line win). */
  win(level: number): void {
    const notes = [
      [62, 69],
      [62, 65, 69, 74],
      [62, 65, 69, 74, 77, 81],
      [62, 65, 69, 74, 77, 81, 86, 89],
    ][Math.max(0, Math.min(3, level))];
    notes.forEach((n, i) => this.pluck(midi(n + 12), i * 0.07, 0.13));
    if (level >= 2) this.bell(midi(notes[notes.length - 1] + 12), notes.length * 0.07, 0.12);
  }

  /** Neutral confirmation for a return that does not exceed the stake. */
  smallReturn(): void {
    this.tone({ freq: midi(69), dur: 0.12, gain: 0.07, type: 'triangle' });
  }

  /** Count-up tick; rate-limited so fast counts stay pleasant. */
  tick(progress: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.currentTime - this.lastTick < 0.045) return;
    this.lastTick = ctx.currentTime;
    this.tone({ freq: 1200 + progress * 900, dur: 0.035, gain: 0.05, type: 'square', filter: 3000 });
  }

  bigWin(tier: number): void {
    // Brass-like stabs over i – VI – V, one more chord per tier.
    const seq = [CHORDS[0], CHORDS[1], CHORDS[3], CHORDS[0]].slice(0, 2 + tier);
    seq.forEach((chord, i) => {
      for (const n of chord.slice(1)) {
        this.tone({ freq: midi(n + 12), type: 'sawtooth', at: i * 0.28, dur: 0.5, gain: 0.07, filter: 2200, attack: 0.02, reverb: 0.3 });
      }
      this.tone({ freq: midi(chord[0]), type: 'triangle', at: i * 0.28, dur: 0.5, gain: 0.2 });
    });
    this.noise({ freq: 6000, type: 'highpass', dur: 1.2, gain: 0.08, reverb: 0.4 });
    this.coins(12);
  }

  coins(n: number): void {
    for (let i = 0; i < n; i++) {
      this.tone({ freq: 2400 + Math.random() * 2200, at: i * 0.045 + Math.random() * 0.03, dur: 0.09, gain: 0.04, type: 'sine', reverb: 0.2 });
    }
  }

  multiplierUp(value: number): void {
    const n = PENTA[Math.min(PENTA.length - 1, Math.max(0, value - 2))];
    this.pluck(midi(n + 12), 0, 0.18);
    this.pluck(midi(n + 19), 0.08, 0.14);
    this.noise({ freq: 5000, type: 'highpass', dur: 0.25, gain: 0.04, reverb: 0.4 });
  }

  extraSpin(): void {
    this.bell(midi(81), 0, 0.14, 0.8);
    this.bell(midi(86), 0.11, 0.14, 0.9);
  }

  featureTrigger(): void {
    this.tone({ freq: midi(38), dur: 2.2, gain: 0.35, reverb: 0.5 });
    this.tone({ freq: midi(38) * 2.4, dur: 1.6, gain: 0.08, reverb: 0.6 });
    [62, 65, 69, 74, 77, 81, 86].forEach((n, i) => this.bell(midi(n), 0.15 + i * 0.09, 0.12, 1.2));
  }

  doorSlam(): void {
    this.tone({ freq: 70, slideTo: 32, dur: 0.7, gain: 0.5 });
    this.noise({ freq: 2600, dur: 0.35, gain: 0.16, q: 6, reverb: 0.7 });
    this.noise({ freq: 180, type: 'lowpass', dur: 0.4, gain: 0.3, reverb: 0.5 });
  }

  doorMove(): void {
    this.noise({ freq: 160, sweepTo: 420, dur: 0.6, gain: 0.14, q: 1.2 });
    this.tone({ freq: 55, slideTo: 80, dur: 0.6, gain: 0.12, type: 'sawtooth', filter: 300 });
  }

  featureEnd(): void {
    [50, 57, 62, 66, 69, 74].forEach((n, i) => this.bell(midi(n + 12), i * 0.06, 0.09, 2));
  }

  // ── Music ───────────────────────────────────────────────────────────────
  setMusic(mode: MusicMode): void {
    this.wantedMode = mode;
    if (!this.ctx || mode === this.musicMode) return;
    this.musicMode = mode;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (mode === 'off') return;
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 90);
  }

  /** Temporarily lowers the music under a celebration. */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(this.musicVolume * (on ? 0.18 : 0.55), this.ctx.currentTime, 0.25);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const vault = this.musicMode === 'vault';
    const stepDur = 60 / (vault ? 112 : 80) / 4; // sixteenth notes
    if (this.nextStep < ctx.currentTime) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.3) {
      this.playStep(this.step, this.nextStep - ctx.currentTime, stepDur, vault);
      this.step++;
      this.nextStep += stepDur;
    }
  }

  private playStep(step: number, at: number, d: number, vault: boolean): void {
    const m = this.music;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = CHORDS[bar];
    if (s === 0) {
      // Pad: slow, dark, two detuned voices per note.
      for (const n of chord.slice(1, 4)) {
        for (const det of [-7, 7]) {
          this.tone({ freq: midi(n), type: 'sawtooth', at, dur: d * 16.5, gain: 0.022, attack: d * 4, detune: det, filter: vault ? 900 : 620, dest: m, reverb: 0.25 });
        }
      }
    }
    if (vault) {
      if (s % 4 === 0) this.tone({ freq: 85, slideTo: 42, at, dur: 0.22, gain: 0.3, dest: m });
      if (s % 2 === 0) this.tone({ freq: midi(chord[0] - (s % 8 === 6 ? -12 : 0)), type: 'triangle', at, dur: d * 1.6, gain: 0.11, dest: m });
      if (s % 4 === 2) this.noise({ at, freq: 7000, type: 'highpass', dur: 0.05, gain: 0.035, dest: m });
      const arp = chord[1 + ((s * 3 + bar) % 4)] + 12;
      if (s % 2 === 1 || s % 8 === 0) this.tone({ freq: midi(arp), type: 'triangle', at, dur: d * 1.4, gain: 0.05, dest: m, reverb: 0.3 });
    } else {
      if (s === 0 || s === 10) this.tone({ freq: midi(chord[0]), type: 'triangle', at, dur: d * 5, gain: 0.13, dest: m });
      if (s % 4 === 2) this.noise({ at, freq: 6000, type: 'highpass', dur: 0.04, gain: 0.02, dest: m });
      if (s === 4 || s === 12) this.noise({ at, freq: 1800, dur: 0.07, gain: 0.03, q: 2, dest: m, reverb: 0.3 });
      // Sparse vibraphone-like melody on chord and scale tones.
      if (s % 2 === 0 && Math.random() < 0.3) {
        const pool = Math.random() < 0.7 ? chord.slice(2).map((n) => n + 12) : SCALE.map((n) => n + 12);
        const n = pool[(Math.random() * pool.length) | 0];
        this.bell(midi(n), at, 0.05, 1.6, m);
      }
    }
  }
}
