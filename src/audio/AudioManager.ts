/**
 * Layered audio via Howler.js.
 * Each sound is loaded from public/assets/audio/<name>.wav. If a file is
 * missing or audio is unavailable the manager silently no-ops, so the game
 * always runs (silent fallback).
 */
import { Howl, Howler } from 'howler';

export type SfxName =
  | 'reel_spin' | 'reel_stop' | 'click' | 'coin' | 'scatter_land' | 'wild_land'
  | 'win_small' | 'win_big' | 'crate_shake' | 'crate_open' | 'magic' | 'dealer'
  | 'vault' | 'transition' | 'artifact' | 'tease' | 'potion';
export type MusicName = 'ambience' | 'bonus_music';

const SFX: SfxName[] = ['reel_spin', 'reel_stop', 'click', 'coin', 'scatter_land', 'wild_land', 'win_small', 'win_big', 'crate_shake', 'crate_open', 'magic', 'dealer', 'vault', 'transition', 'artifact', 'tease', 'potion'];
const MUSIC: MusicName[] = ['ambience', 'bonus_music'];

const base = import.meta.env.BASE_URL;

class AudioManager {
  private sfx = new Map<SfxName, Howl>();
  private music = new Map<MusicName, Howl>();
  private failed = new Set<string>();
  private current: MusicName | null = null;
  private loaded = false;
  enabled = true;
  musicVolume = 0.5;
  sfxVolume = 0.8;

  /** Lazily create Howls on first user interaction (browser autoplay rules). */
  init() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      for (const name of SFX) {
        this.sfx.set(name, new Howl({
          src: [`${base}assets/audio/${name}.wav`],
          volume: this.sfxVolume,
          loop: name === 'reel_spin',
          onloaderror: () => this.failed.add(name),
        }));
      }
      for (const name of MUSIC) {
        this.music.set(name, new Howl({
          src: [`${base}assets/audio/${name}.wav`],
          loop: true,
          volume: 0,
          onloaderror: () => this.failed.add(name),
        }));
      }
    } catch {
      /* audio unavailable — stay silent */
    }
    // Mobile Safari suspends (or "interrupts") the audio context when the tab is
    // hidden or a call comes in; pause while hidden and resume on return / next touch.
    const resume = () => {
      const ctx = Howler.ctx;
      if (ctx && ctx.state !== 'running' && document.visibilityState === 'visible') ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') Howler.ctx?.suspend().catch(() => {});
      else resume();
    });
    window.addEventListener('pointerdown', resume, { passive: true });
    if (this.current) {
      const m = this.current;
      this.current = null;
      this.playMusic(m);
    }
  }

  play(name: SfxName, opts: { rate?: number; volume?: number } = {}) {
    if (!this.enabled || this.failed.has(name)) return;
    const h = this.sfx.get(name);
    if (!h) return;
    try {
      const id = h.play();
      h.volume(this.sfxVolume * (opts.volume ?? 1), id);
      if (opts.rate) h.rate(opts.rate, id);
    } catch {
      /* ignore */
    }
  }

  stop(name: SfxName) {
    this.sfx.get(name)?.stop();
  }

  playMusic(name: MusicName) {
    if (this.current === name) return;
    const prev = this.current ? this.music.get(this.current) : undefined;
    this.current = name;
    if (prev) {
      prev.fade(prev.volume(), 0, 800);
      setTimeout(() => prev.stop(), 850);
    }
    const h = this.music.get(name);
    if (!h || this.failed.has(name)) return;
    if (!h.playing()) h.play();
    h.fade(0, this.enabled ? this.musicVolume : 0, 1200);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    Howler.mute(!on);
    if (on && this.current) this.music.get(this.current)?.volume(this.musicVolume);
  }

  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.current) this.music.get(this.current)?.volume(v);
  }

  setSfxVolume(v: number) {
    this.sfxVolume = v;
  }
}

export const audio = new AudioManager();
