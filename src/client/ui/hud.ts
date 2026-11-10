/**
 * The control bar and status displays. Plain DOM over the canvas: real
 * buttons with labels, focus rings and screen-reader announcements.
 */
import { t } from './i18n';

const ICON = {
  spin: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8a16 16 0 1 0 15.5 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M25 1l9 7.5-9 7.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="13" y="13" width="22" height="22" rx="4" fill="currentColor"/></svg>',
  skip: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 11l14 13-14 13zM25 11l14 13-14 13z" fill="currentColor"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l4 4-4 4M21 7H8a5 5 0 0 0-5 5M7 21l-4-4 4-4M3 17h13a5 5 0 0 0 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  turbo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11.5 11.5L21 21M17 17l3-3M14 14l2.5-2.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

export type SpinButtonMode = 'spin' | 'stop' | 'skip' | 'auto' | 'disabled';

export interface HudHandlers {
  spin(): void;
  betStep(dir: -1 | 1): void;
  openMenu(): void;
  openAuto(): void;
  openBuy(): void;
  toggleTurbo(): void;
  toggleSound(): void;
}

export class Hud {
  readonly root: HTMLElement;
  readonly top: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private spinMode: SpinButtonMode = 'spin';

  constructor(parent: HTMLElement, h: HudHandlers) {
    this.top = document.createElement('header');
    this.top.className = 'topbar';
    this.top.innerHTML = `
      <div class="topbar__left"><span class="topbar__name">${t('app.title')}</span><span class="badge" data-id="demo" hidden>${t('app.demo')}</span></div>
      <div class="topbar__right">
        <span class="topbar__item" data-id="netWrap" hidden>${t('hud.net')} <b data-id="net"></b></span>
        <span class="topbar__item" data-id="sessionWrap" hidden>${t('hud.session')} <b data-id="session">00:00</b></span>
        <span class="topbar__item"><b data-id="clock"></b></span>
      </div>`;

    this.root = document.createElement('footer');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud__message" data-id="message" role="status" aria-live="polite"></div>
      <div class="hud__bar">
        <div class="hud__group hud__group--left">
          <button class="btn btn--icon" data-id="menu" aria-label="${t('hud.menu')}">${ICON.menu}</button>
          <button class="btn btn--icon" data-id="sound" aria-label="${t('hud.sound')}" aria-pressed="true">${ICON.soundOn}</button>
        </div>
        <div class="hud__stats">
          <div class="stat"><span class="stat__label">${t('hud.balance')}</span><span class="stat__value" data-id="balance"></span></div>
          <div class="stat stat--bet">
            <span class="stat__label">${t('hud.bet')}</span>
            <div class="stat__bet">
              <button class="btn btn--round" data-id="betDown" aria-label="${t('hud.betDown')}">${ICON.minus}</button>
              <span class="stat__value" data-id="bet"></span>
              <button class="btn btn--round" data-id="betUp" aria-label="${t('hud.betUp')}">${ICON.plus}</button>
            </div>
          </div>
          <div class="stat stat--win"><span class="stat__label">${t('hud.win')}</span><span class="stat__value" data-id="win"></span></div>
        </div>
        <div class="hud__group hud__group--right">
          <button class="btn btn--pill btn--buy" data-id="buy">${ICON.key}<span>${t('hud.buy')}</span></button>
          <button class="btn btn--icon" data-id="turbo" aria-label="${t('hud.turbo')}" aria-pressed="false">${ICON.turbo}</button>
          <button class="btn btn--icon" data-id="auto" aria-label="${t('hud.auto')}">${ICON.auto}</button>
        </div>
        <button class="spin" data-id="spin" aria-label="${t('hud.spin')}"><span class="spin__icon" data-id="spinIcon">${ICON.spin}</span><span class="spin__count" data-id="spinCount"></span></button>
      </div>`;
    parent.append(this.top, this.root);
    for (const node of [...this.top.querySelectorAll<HTMLElement>('[data-id]'), ...this.root.querySelectorAll<HTMLElement>('[data-id]')]) {
      this.el[node.dataset.id!] = node;
    }
    this.el.spin.addEventListener('click', () => h.spin());
    this.el.betDown.addEventListener('click', () => h.betStep(-1));
    this.el.betUp.addEventListener('click', () => h.betStep(1));
    this.el.menu.addEventListener('click', () => h.openMenu());
    this.el.auto.addEventListener('click', () => h.openAuto());
    this.el.buy.addEventListener('click', () => h.openBuy());
    this.el.turbo.addEventListener('click', () => h.toggleTurbo());
    this.el.sound.addEventListener('click', () => h.toggleSound());
  }

  setBalance(text: string): void {
    this.el.balance.textContent = text;
  }

  setBet(text: string, canLower: boolean, canRaise: boolean): void {
    this.el.bet.textContent = text;
    (this.el.betDown as HTMLButtonElement).disabled = !canLower;
    (this.el.betUp as HTMLButtonElement).disabled = !canRaise;
  }

  setWin(text: string, highlight = false): void {
    this.el.win.textContent = text;
    this.el.win.parentElement!.classList.toggle('stat--lit', highlight);
  }

  /** Centre of the win readout in viewport pixels. */
  winPoint(): { x: number; y: number } {
    const r = this.el.win.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Short kick on the win readout as winnings arrive. */
  bumpWin(): void {
    const box = this.el.win.parentElement!;
    box.classList.remove('stat--bump');
    void box.offsetWidth;
    box.classList.add('stat--bump');
  }

  setMessage(text: string): void {
    if (this.el.message.textContent !== text) this.el.message.textContent = text;
  }

  setSpinMode(mode: SpinButtonMode, autoLeft?: number): void {
    this.spinMode = mode;
    const b = this.el.spin as HTMLButtonElement;
    b.disabled = mode === 'disabled';
    b.dataset.mode = mode;
    const icon = mode === 'stop' || mode === 'auto' ? ICON.stop : mode === 'skip' ? ICON.skip : ICON.spin;
    if (this.el.spinIcon.dataset.icon !== icon) {
      this.el.spinIcon.innerHTML = icon;
      this.el.spinIcon.dataset.icon = icon;
    }
    this.el.spinCount.textContent = mode === 'auto' && autoLeft !== undefined ? String(autoLeft) : '';
    b.setAttribute(
      'aria-label',
      mode === 'auto' ? t('hud.autoStop') : mode === 'stop' ? t('hud.stop') : mode === 'skip' ? t('hud.skip') : t('hud.spin'),
    );
  }

  get currentSpinMode(): SpinButtonMode {
    return this.spinMode;
  }

  /** Enables or disables everything except the spin button (used during a round). */
  setControlsEnabled(on: boolean): void {
    for (const id of ['betDown', 'betUp', 'auto', 'buy', 'menu']) {
      const b = this.el[id] as HTMLButtonElement;
      if (!on) b.disabled = true;
      else if (id !== 'betDown' && id !== 'betUp') b.disabled = false;
    }
  }

  setFeatureAvailability(o: { buy: boolean; auto: boolean; turbo: boolean }): void {
    this.el.buy.hidden = !o.buy;
    this.el.auto.hidden = !o.auto;
    this.el.turbo.hidden = !o.turbo;
  }

  setTurbo(on: boolean): void {
    this.el.turbo.setAttribute('aria-pressed', String(on));
  }

  setSound(on: boolean): void {
    this.el.sound.setAttribute('aria-pressed', String(on));
    this.el.sound.innerHTML = on ? ICON.soundOn : ICON.soundOff;
  }

  setDemo(on: boolean): void {
    this.el.demo.hidden = !on;
  }

  setClock(text: string): void {
    this.el.clock.textContent = text;
  }

  setSession(text: string | null): void {
    this.el.sessionWrap.hidden = text === null;
    if (text !== null) this.el.session.textContent = text;
  }

  setNet(text: string | null): void {
    this.el.netWrap.hidden = text === null;
    if (text !== null) this.el.net.textContent = text;
  }

  /** Heights of the DOM bars, so the canvas scene can lay out between them. */
  insets(): { top: number; bottom: number } {
    return { top: this.top.offsetHeight, bottom: this.root.offsetHeight };
  }
}
