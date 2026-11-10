/**
 * Game controller: turns player input into service calls and round records
 * into presentation. It owns no game rules. A round's result is final the
 * moment the service returns it; everything after that is replay.
 */
import { BET_COINS, ROWS } from '../engine/model';
import type { SpinStep, WayWin } from '../engine/round';
import { CRATE, SCATTER, SYMBOLS, WILD } from '../engine/symbols';
import { GameError, type GameService, type RoundRecord, type SessionInfo } from '../rgs/types';
import type { Sound } from './audio/sound';
import { ease } from './gfx/anim';
import { SYMBOL_TINT } from './gfx/reels';
import type { Scene, WinTier } from './gfx/scene';
import { NetworkError } from './services/remote';
import { Dialogs, openAuto, openBuy, openInfo, openRealityCheck, type AutoConfig } from './ui/dialogs';
import { formatClock, formatDuration, makeMoneyFormatter } from './ui/format';
import type { Hud } from './ui/hud';
import { t, type MsgKey } from './ui/i18n';

const SETTINGS_KEY = 'blackmarket.settings.v2';
/** Round win (in bets) at which each celebration tier starts. */
const TIERS = [20, 50, 150];

interface Settings {
  sfx: boolean;
  music: boolean;
  turbo: boolean;
  reducedMotion: boolean;
  leftHand: boolean;
  bet: number;
}

interface AutoState extends AutoConfig {
  remaining: number;
  startBalance: number;
}

export class Game {
  private readonly game;
  private readonly money: (minor: number) => string;
  private settings: Settings;
  private balance: number;
  private bet: number;
  private busy = false;
  private auto: AutoState | null = null;
  private lastSpinAt = -Infinity;
  private readonly sessionStart = Date.now();
  private lastRealityCheck = Date.now();
  private staked = 0;
  private won = 0;
  /** True while the reels are still in motion (slam-stop applies). */
  private reelsMoving = false;
  private buyRtp = '';

  constructor(
    private readonly scene: Scene,
    private readonly hud: Hud,
    private readonly dialogs: Dialogs,
    private readonly sound: Sound,
    private readonly service: GameService,
    session: SessionInfo,
    opts: { demo: boolean; buyRtpLabel: string },
  ) {
    this.game = session.game;
    this.buyRtp = opts.buyRtpLabel;
    this.money = makeMoneyFormatter(this.game.currency);
    this.balance = session.balance;
    this.settings = this.loadSettings();
    const j = this.game.jurisdiction;
    if (!j.turbo) this.settings.turbo = false;
    this.bet = this.game.betLevels.includes(this.settings.bet) ? this.settings.bet : this.game.defaultBet;

    hud.setDemo(opts.demo);
    hud.setFeatureAvailability({ buy: j.featureBuy, auto: j.autoplay.enabled, turbo: j.turbo });
    this.applySettings();
    this.refreshHud();
    hud.setWin(this.money(0));
    hud.setMessage(t('msg.idle'));
    scene.reels.setStrips(this.game.strips.base, this.restingStops());

    window.setInterval(() => this.tickClock(), 1000);
    this.tickClock();
    document.addEventListener('visibilitychange', () => (document.hidden ? sound.suspend() : sound.resume()));
    document.addEventListener('keydown', (e) => this.onKey(e));
    scene.app.canvas.addEventListener('pointerdown', () => this.requestSkip());
  }

  // ── Settings ────────────────────────────────────────────────────────────
  private loadSettings(): Settings {
    const dflt: Settings = {
      sfx: true,
      music: true,
      turbo: false,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      leftHand: false,
      bet: this.game.defaultBet,
    };
    try {
      return { ...dflt, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) };
    } catch {
      return dflt;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...this.settings, bet: this.bet }));
    } catch {
      /* ignore */
    }
  }

  private applySettings(): void {
    const s = this.settings;
    this.sound.sfxVolume = s.sfx ? 0.8 : 0;
    this.sound.musicVolume = s.music ? 0.5 : 0;
    this.sound.applyVolumes();
    this.scene.reducedMotion = s.reducedMotion;
    this.scene.particles.enabled = this.scene.screenParticles.enabled = !s.reducedMotion;
    this.hud.setTurbo(s.turbo);
    this.hud.setSound(s.sfx || s.music);
    document.documentElement.classList.toggle('left-hand', s.leftHand);
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
  }

  // ── HUD ─────────────────────────────────────────────────────────────────
  private refreshHud(): void {
    const levels = this.game.betLevels;
    const i = levels.indexOf(this.bet);
    const idle = !this.busy && !this.auto;
    this.hud.setBalance(this.money(this.balance));
    this.hud.setBet(this.money(this.bet), idle && i > 0, idle && i < levels.length - 1);
    this.hud.setControlsEnabled(idle);
  }

  private tickClock(): void {
    const j = this.game.jurisdiction;
    this.hud.setClock(formatClock(new Date()));
    this.hud.setSession(j.showSessionTimer ? formatDuration(Date.now() - this.sessionStart) : null);
    this.hud.setNet(j.showNetPosition ? this.money(this.won - this.staked) : null);
  }

  private restingStops(): number[] {
    // A tidy opening screen: no specials in view and nothing that looks like a win.
    const strips = this.game.strips.base;
    const used = new Set<number>();
    return strips.map((strip, r) => {
      const n = strip.length;
      for (let p = (7 * r + 3) % n, tries = 0; tries < n; tries++, p = (p + 1) % n) {
        const window = [0, 1, 2, 3].map((i) => strip[(p + i) % n]);
        const plain = window.every((s) => s < 12);
        const fresh = r > 1 || window.every((s) => !used.has(s));
        if (plain && fresh && new Set(window).size >= 3) {
          if (r === 0) window.forEach((s) => used.add(s));
          return p;
        }
      }
      return 0;
    });
  }

  // ── Input ───────────────────────────────────────────────────────────────
  private onKey(e: KeyboardEvent): void {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (this.dialogs.isOpen) return;
    const el = document.activeElement;
    if (el && el !== document.body && el.tagName !== 'CANVAS' && !(el as HTMLElement).dataset?.id?.startsWith('spin')) {
      // Let focused controls handle their own activation.
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') return;
    }
    e.preventDefault();
    if (e.repeat) return;
    this.onSpinButton();
  }

  onSpinButton(): void {
    this.sound.unlock();
    if (this.auto) {
      this.stopAuto();
      return;
    }
    if (this.busy) {
      this.requestSkip();
      return;
    }
    void this.playRound('spin');
  }

  private requestSkip(): void {
    if (!this.busy) return;
    if (this.reelsMoving) {
      if (!this.game.jurisdiction.slamStop) return;
      this.scene.reels.slam = true;
    }
    this.scene.anim.fast = true;
  }

  betStep(dir: -1 | 1): void {
    if (this.busy || this.auto) return;
    const levels = this.game.betLevels;
    const i = Math.max(0, Math.min(levels.length - 1, levels.indexOf(this.bet) + dir));
    if (levels[i] === this.bet) return;
    this.bet = levels[i];
    this.sound.click();
    this.saveSettings();
    this.refreshHud();
  }

  toggleTurbo(): void {
    if (!this.game.jurisdiction.turbo) return;
    this.settings.turbo = !this.settings.turbo;
    this.sound.click();
    this.applySettings();
    this.saveSettings();
  }

  toggleSound(): void {
    const on = !(this.settings.sfx || this.settings.music);
    this.settings.sfx = this.settings.music = on;
    this.applySettings();
    this.saveSettings();
    if (on) this.sound.click();
  }

  openMenu(tab: 'paytable' | 'rules' | 'settings' | 'history' = 'paytable'): void {
    if (this.busy) return;
    this.sound.click();
    openInfo(
      this.dialogs,
      {
        game: this.game,
        bet: this.bet,
        money: this.money,
        buyRtpLabel: this.buyRtp,
        history: () => this.service.history(50),
        settings: this.settings,
        onSetting: (key, value) => {
          this.settings[key] = value;
          this.applySettings();
          this.saveSettings();
        },
        resetDemo: this.service.resetDemoBalance
          ? async () => {
              this.balance = await this.service.resetDemoBalance!();
              this.refreshHud();
            }
          : undefined,
      },
      tab,
    );
  }

  openAutoDialog(): void {
    if (this.busy || this.auto || !this.game.jurisdiction.autoplay.enabled) return;
    this.sound.click();
    openAuto(this.dialogs, this.game, this.bet, this.money, (cfg) => {
      this.auto = { ...cfg, remaining: cfg.spins, startBalance: this.balance };
      void this.playRound('spin');
    });
  }

  openBuyDialog(): void {
    if (this.busy || this.auto || !this.game.jurisdiction.featureBuy) return;
    this.sound.click();
    openBuy(this.dialogs, this.game, this.bet, this.money, this.buyRtp, () => void this.playRound('buy'));
  }

  private stopAuto(messageKey?: MsgKey): void {
    if (!this.auto) return;
    this.auto = null;
    if (messageKey) this.hud.setMessage(t(messageKey as Exclude<MsgKey, 'rules.list'>));
    if (!this.busy) this.setIdle();
    else this.hud.setSpinMode('skip');
  }

  private setIdle(): void {
    this.hud.setSpinMode('spin');
    this.refreshHud();
  }

  // ── Round ───────────────────────────────────────────────────────────────
  private async playRound(mode: 'spin' | 'buy'): Promise<void> {
    if (this.busy) return;
    const { scene, hud } = this;
    const stake = mode === 'buy' ? this.bet * this.game.buyPriceBets : this.bet;
    if (this.balance < stake) {
      this.stopAuto();
      this.dialogs.notice(t('error.INSUFFICIENT_FUNDS'));
      return;
    }
    this.busy = true;
    hud.setSpinMode('disabled');
    this.refreshHud();

    // Respect the market's minimum game-cycle time.
    const minGap = this.game.jurisdiction.minSpinMs;
    const waitMs = this.lastSpinAt + minGap - performance.now();
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    this.lastSpinAt = performance.now();

    scene.anim.fast = false;
    scene.anim.rate = this.settings.turbo ? 1.5 : 1;
    scene.hideWinPopup();
    hud.setWin(this.money(0));
    hud.setBalance(this.money(this.balance - stake));
    hud.setMessage(this.auto ? t('msg.autoLeft', { n: this.auto.remaining - 1 }) : t('msg.goodLuck'));
    this.startReels();
    this.updateSpinButton();

    let record: RoundRecord;
    let finalBalance: number;
    try {
      const requestId = globalThis.crypto?.randomUUID?.() ?? `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const [result] = await Promise.all([
        this.service.play({ requestId, mode, bet: this.bet }),
        scene.anim.wait(this.settings.turbo ? 120 : 520),
      ]);
      record = result.round;
      finalBalance = result.balance;
    } catch (e) {
      await this.abortSpin(e);
      return;
    }

    this.staked += record.stake;
    this.won += record.win;
    await this.presentRound(record);
    void this.service.ack(record.roundId).catch(() => undefined);
    this.balance = finalBalance;
    this.finishRound(record);
  }

  private startReels(): void {
    this.reelsMoving = true;
    this.scene.reels.start(this.settings.turbo);
    this.sound.spinStart();
    this.sound.reelsRunning();
  }

  private updateSpinButton(): void {
    if (this.auto) this.hud.setSpinMode('auto', this.auto.remaining);
    else if (this.reelsMoving) this.hud.setSpinMode(this.game.jurisdiction.slamStop ? 'stop' : 'disabled');
    else this.hud.setSpinMode('skip');
  }

  private async abortSpin(e: unknown): Promise<void> {
    // No round was created: bring the reels back to rest and restore the display.
    const { scene } = this;
    scene.anim.fast = true;
    scene.reels.slam = true;
    await scene.reels.stop({
      stops: this.restingStops(),
      stagger: 0,
      anticipation: 0,
      onReelStop: () => undefined,
      onAnticipation: () => undefined,
    });
    scene.anim.fast = false;
    this.sound.reelsQuiet();
    this.reelsMoving = false;
    this.busy = false;
    this.auto = null;
    this.setIdle();
    this.hud.setMessage(t('msg.idle'));
    const code = e instanceof GameError ? e.code : e instanceof NetworkError ? 'NETWORK' : 'INTERNAL';
    const shown = code === 'INVALID_REQUEST' || code === 'ROUND_NOT_FOUND' ? 'INTERNAL' : code;
    this.dialogs.notice(t(`error.${shown}`));
  }

  private finishRound(record: RoundRecord): void {
    const { hud } = this;
    this.busy = false;
    this.scene.anim.fast = false;
    hud.setBalance(this.money(this.balance));
    hud.setWin(this.money(record.win), record.win > record.stake);
    if (record.win > 0) hud.setMessage(record.outcome.capped ? t('msg.maxWin') : t('msg.win', { amount: this.money(record.win) }));
    else hud.setMessage(t('msg.idle'));

    const j = this.game.jurisdiction;
    const rcDue = j.realityCheckMinutes > 0 && Date.now() - this.lastRealityCheck >= j.realityCheckMinutes * 60_000;

    if (this.auto) {
      const a = this.auto;
      a.remaining--;
      const featured = record.outcome.steps.length > 1;
      let stop: MsgKey | null | '' = null;
      if (a.remaining <= 0 || this.balance < this.bet || rcDue) stop = '';
      else if (a.lossLimit > 0 && a.startBalance - this.balance >= a.lossLimit) stop = 'auto.stopped.loss';
      else if (a.winLimit > 0 && record.win >= a.winLimit) stop = 'auto.stopped.win';
      else if (a.stopOnFeature && featured) stop = 'auto.stopped.feature';
      if (stop === null) {
        hud.setSpinMode('auto', a.remaining);
        window.setTimeout(() => {
          if (this.auto && !this.busy) void this.playRound('spin');
          else if (!this.busy) this.setIdle();
        }, this.settings.turbo ? 250 : 600);
        return;
      }
      this.auto = null;
      if (stop) hud.setMessage(t(stop as Exclude<MsgKey, 'rules.list'>));
    }
    this.setIdle();
    if (rcDue) this.realityCheck();
  }

  private realityCheck(): void {
    this.lastRealityCheck = Date.now();
    const minutes = Math.round((Date.now() - this.sessionStart) / 60_000);
    openRealityCheck(
      this.dialogs,
      { minutes, staked: this.money(this.staked), won: this.money(this.won), net: this.money(this.won - this.staked) },
      () => this.openMenuForced('history'),
    );
  }

  private openMenuForced(tab: 'history'): void {
    const wasBusy = this.busy;
    this.busy = false;
    this.openMenu(tab);
    this.busy = wasBusy;
  }

  /** Replays a round the player paid for but did not see finish. */
  async resume(record: RoundRecord): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hud.setMessage(t('msg.resume'));
    this.refreshHud();
    this.scene.anim.rate = 1;
    this.startReels();
    this.updateSpinButton();
    await this.scene.anim.wait(900);
    await this.presentRound(record);
    void this.service.ack(record.roundId).catch(() => undefined);
    this.finishRound(record);
  }

  // ── Presentation ────────────────────────────────────────────────────────
  private async presentRound(record: RoundRecord): Promise<void> {
    const { scene, hud, sound } = this;
    const steps = record.outcome.steps;
    const coin = record.bet / BET_COINS;
    const base = steps[0];
    const featured = steps.length > 1;
    const totalBets = record.win / record.bet;

    await this.landReels(base);
    await this.revealCrates(base);
    const baseWin = base.coins * coin;
    const bigInBase = !featured && totalBets >= TIERS[0];
    if (baseWin > 0) {
      if (!bigInBase) hud.setWin(this.money(baseWin), baseWin > record.bet);
      await this.presentWins(base, coin, record.bet, 0, bigInBase);
      hud.setWin(this.money(baseWin), baseWin > record.bet);
    }
    if (!featured) return;

    // ── The Vault ──
    scene.anim.fast = false;
    const scatterCells = scene.reels.findSymbol(SCATTER);
    scene.reels.highlight(scatterCells, SYMBOL_TINT[SCATTER], true);
    sound.featureTrigger();
    scene.shake(10);
    hud.setMessage(t('feature.spins', { n: base.spinsAwarded }));
    await scene.anim.wait(1500);
    scene.reels.clearHighlight();

    scene.anim.fast = false;
    sound.doorMove();
    const closing = scene.closeDoors(t('feature.title'), t('feature.spins', { n: base.spinsAwarded }));
    await scene.anim.wait(480);
    sound.doorSlam();
    await closing;
    sound.setMusic('vault');
    scene.setVault(true);
    scene.reels.setStrips(this.game.strips.free, steps[1].stops.map((s, r) => (s + 7) % this.game.strips.free[r].length));
    let running = baseWin;
    scene.setMeter(base.spinsAwarded, 1, this.money(0));
    await scene.anim.wait(1500);
    scene.anim.fast = false;
    sound.doorMove();
    await scene.openDoors();

    let left = base.spinsAwarded;
    let multiplier = 1;
    let vaultWin = 0;
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      scene.anim.fast = false;
      left--;
      scene.setMeter(left, multiplier, this.money(vaultWin));
      hud.setMessage(t('msg.freeSpin', { n: step.index }));
      this.startReels();
      this.updateSpinButton();
      await scene.anim.wait(this.settings.turbo ? 100 : 380);
      await this.landReels(step);

      if (step.wildsLanded > 0) {
        const cells: Array<[number, number]> = [];
        step.grid.forEach((col, r) => col.forEach((s, row) => s === WILD && cells.push([r, row])));
        const to = step.multiplier;
        await scene.bumpMultiplier(cells, () => {
          multiplier = to;
          scene.setMeter(left, multiplier, this.money(vaultWin));
          sound.multiplierUp(to);
        });
      }
      if (step.spinsAwarded > 0) {
        step.grid.forEach((col, r) => col.forEach((s, row) => s === SCATTER && scene.floatText(r, row, t('feature.extra'))));
        sound.extraSpin();
        left = step.spinsRemaining;
        scene.setMeter(left, multiplier, this.money(vaultWin));
        hud.setMessage(t(step.spinsAwarded === 1 ? 'msg.extraSpin' : 'msg.extraSpins', { n: step.spinsAwarded }));
        await scene.anim.wait(500);
      }
      await this.revealCrates(step);
      const stepWin = step.coins * coin;
      if (stepWin > 0) {
        running += stepWin;
        vaultWin += stepWin;
        await this.presentWins(step, coin, record.bet, vaultWin, false);
        scene.setMeter(left, multiplier, this.money(vaultWin));
        hud.setWin(this.money(running), true);
      } else {
        await scene.anim.wait(this.settings.turbo ? 120 : 300);
      }
    }

    // ── Back to the market ──
    scene.anim.fast = false;
    if (record.outcome.capped) hud.setMessage(t('msg.maxWin'));
    await scene.anim.wait(500);
    scene.anim.fast = false;
    sound.doorMove();
    const closing2 = scene.closeDoors(t('feature.total'), '');
    await scene.anim.wait(480);
    sound.doorSlam();
    await closing2;
    sound.featureEnd();
    scene.setDoorAmount(this.money(0));
    await this.countUp(0, vaultWin, Math.min(2600, 700 + (vaultWin / record.bet) * 40), (v) => scene.setDoorAmount(this.money(v)));
    scene.setVault(false);
    sound.setMusic('market');
    scene.reels.setStrips(this.game.strips.base, base.stops);
    await scene.anim.wait(1400);
    scene.anim.fast = false;
    sound.doorMove();
    await scene.openDoors();
    scene.setDoorAmount(null);
    if (totalBets >= TIERS[0]) await this.bigWin(record.win, record.bet);
  }

  private async landReels(step: SpinStep): Promise<void> {
    const { scene, sound } = this;
    const turbo = this.settings.turbo;
    const anticipation = step.kind === 'base' ? (turbo ? 500 : 1300) : 0;
    let scatters = 0;
    await scene.reels.stop({
      stops: step.stops,
      stagger: turbo ? 70 : 250,
      anticipation,
      onReelStop: (r, landed) => {
        sound.reelStop(r);
        if (landed.includes(SCATTER)) sound.scatterLand(++scatters);
        if (step.kind === 'free' && landed.includes(WILD)) sound.wildLand();
      },
      onAnticipation: () => sound.anticipation(anticipation),
    });
    sound.reelsQuiet();
    this.reelsMoving = false;
    // A slam stop ends here; it does not also skip the win presentation.
    scene.anim.fast = false;
    this.updateSpinButton();
  }

  private async revealCrates(step: SpinStep): Promise<void> {
    if (step.reveal < 0) return;
    this.sound.crateRattle();
    const done = this.scene.reels.revealCrates(step.grid, step.reveal);
    await this.scene.anim.wait(380);
    this.sound.crateOpen();
    await done;
  }

  private winCells(step: SpinStep, w: WayWin): Array<[number, number]> {
    const cells: Array<[number, number]> = [];
    for (let r = 0; r < w.reels; r++) {
      for (let row = 0; row < ROWS; row++) {
        const s = step.grid[r][row];
        if (s === w.symbol || s === WILD || (s === CRATE && step.reveal === w.symbol)) cells.push([r, row]);
      }
    }
    return cells;
  }

  private wayMessage(step: SpinStep, w: WayWin, coin: number): string {
    const p = {
      count: w.reels,
      symbol: SYMBOLS[w.symbol].name,
      ways: w.ways,
      waysWord: t(w.ways === 1 ? 'msg.way.one' : 'msg.way.many'),
      amount: this.money(w.coins * step.multiplier * coin),
      base: this.money(w.coins * coin),
      mult: step.multiplier,
    };
    return t(step.multiplier > 1 ? 'msg.wayMult' : 'msg.way', p);
  }

  /** Shows the wins of one landed spin. `vaultTotal` > 0 only inside the feature. */
  private async presentWins(step: SpinStep, coin: number, bet: number, _vaultTotal: number, big: boolean): Promise<void> {
    const { scene, hud, sound } = this;
    const amount = step.coins * coin;
    const all = new Map<string, [number, number]>();
    for (const w of step.wins) for (const c of this.winCells(step, w)) all.set(`${c[0]},${c[1]}`, c);
    if (step.scatterCoins > 0) {
      step.grid.forEach((col, r) => col.forEach((s, row) => s === SCATTER && all.set(`${r},${row}`, [r, row])));
    }
    // A return at or below the stake is shown plainly, without celebration.
    const celebrate = amount > bet;
    scene.reels.highlight([...all.values()], 0xffd977, celebrate);

    if (big) {
      await this.bigWin(amount, bet);
    } else {
      const x = amount / bet;
      if (celebrate) sound.win(x < 3 ? 0 : x < 8 ? 1 : x < 20 ? 2 : 3);
      else sound.smallReturn();
      const emphasis = celebrate ? Math.min(1, 0.55 + x * 0.04) : 0.45;
      const waysTotal = step.wins.reduce((a, w) => a + w.coins, 0) * coin;
      if (step.multiplier > 1 && waysTotal > 0) {
        // Show the multiplier doing its work.
        scene.showWinPopup(`${this.money(waysTotal)} × ${step.multiplier}`, emphasis);
        await scene.popWinPopup();
        await scene.anim.wait(450);
      }
      scene.showWinPopup(this.money(amount), emphasis);
      if (celebrate) {
        await this.countUp(0, amount, Math.min(1200, 350 + x * 60), (v) => scene.showWinPopup(this.money(v), emphasis));
      }
      await scene.popWinPopup();
      await scene.anim.wait(celebrate ? 650 : 450);
    }

    const detailed = !this.settings.turbo && !this.auto;
    if (step.scatterCoins > 0) hud.setMessage(t('msg.scatter', { count: step.scatters, amount: this.money(step.scatterCoins * coin) }));
    if (step.wins.length === 1 || (step.wins.length > 1 && !detailed)) {
      const top = step.wins.reduce((a, b) => (b.coins > a.coins ? b : a));
      hud.setMessage(this.wayMessage(step, top, coin));
    } else if (step.wins.length > 1) {
      scene.hideWinPopup();
      for (const w of [...step.wins].sort((a, b) => b.coins - a.coins)) {
        scene.reels.highlight(this.winCells(step, w), SYMBOL_TINT[w.symbol], celebrate);
        hud.setMessage(this.wayMessage(step, w, coin));
        await scene.anim.wait(850);
      }
    }
    scene.hideWinPopup();
    scene.reels.clearHighlight();
  }

  private countUp(from: number, to: number, ms: number, show: (v: number) => void): Promise<void> {
    const unit = this.bet >= 100 ? 10 : 1;
    return this.scene.anim.run(ms, (k) => {
      const v = from + (to - from) * ease.outQuad(k);
      show(k >= 1 ? to : Math.floor(v / unit) * unit);
      if (k < 1) this.sound.tick(k);
    });
  }

  private async bigWin(amount: number, bet: number): Promise<void> {
    const { scene, sound } = this;
    const x = amount / bet;
    const finalTier = (x >= TIERS[2] ? 3 : x >= TIERS[1] ? 2 : 1) as WinTier;
    scene.anim.fast = false;
    sound.duck(true);
    let tier: WinTier = 1;
    scene.showBigWin(1, this.money(0));
    sound.bigWin(1);
    const ms = [0, 3200, 5200, 7500][finalTier];
    let coinsAt = 0;
    await scene.anim.run(ms, (k) => {
      const v = amount * ease.inOutQuad(k);
      const vx = v / bet;
      const now = (vx >= TIERS[2] ? 3 : vx >= TIERS[1] ? 2 : 1) as WinTier;
      if (now > tier && k < 1) {
        tier = now;
        sound.bigWin(tier);
      }
      scene.setBigWin(k >= 1 ? finalTier : tier, this.money(k >= 1 ? amount : Math.floor(v / 10) * 10));
      if (k < 1) sound.tick(k);
      if (k - coinsAt > 0.12 && k < 1) {
        coinsAt = k;
        scene.coinBurst(10 + tier * 6);
      }
    });
    if (finalTier > tier) sound.bigWin(finalTier);
    sound.coins(16);
    scene.anim.fast = false;
    await scene.anim.wait(1800);
    scene.anim.fast = false;
    await scene.hideBigWin();
    sound.duck(false);
  }
}
