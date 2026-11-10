/**
 * Modal dialogs: game info (paytable, rules, settings, history), autoplay
 * set-up, feature-buy confirmation, reality check and notices.
 */
import { BET_COINS } from '../../engine/model';
import { CRATE, PAY_SYMBOLS, SCATTER, SYMBOLS, WILD } from '../../engine/symbols';
import type { PublicGameInfo, RoundRecord } from '../../rgs/types';
import { symbolUrl } from '../gfx/assets';
import { rulesList, t } from './i18n';

type Money = (minor: number) => string;

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  el.append(...children);
  return el;
};

export interface DialogAction {
  label: string;
  primary?: boolean;
  /** Return false to keep the dialog open. */
  onClick?: () => boolean | void;
}

export interface DialogHandle {
  close(): void;
  closed: Promise<void>;
  body: HTMLElement;
}

export class Dialogs {
  private stack: Array<{ el: HTMLElement; close: () => void }> = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly onClick: () => void,
  ) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.stack.length) {
        const top = this.stack[this.stack.length - 1];
        if (top.el.dataset.dismissible === 'true') top.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  open(o: { title: string; body: Node; actions?: DialogAction[]; dismissible?: boolean; wide?: boolean }): DialogHandle {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dismissible = o.dismissible !== false;
    let resolve!: () => void;
    const closed = new Promise<void>((r) => (resolve = r));
    const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
    const body = h('div', { class: 'dialog__body' }, o.body);
    const panel = h('div', { class: `dialog${o.wide ? ' dialog--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' });
    const header = h('div', { class: 'dialog__header' }, h('h2', { id: titleId }, o.title));
    const backdrop = h('div', { class: 'backdrop' }, panel);
    backdrop.dataset.dismissible = String(dismissible);
    const close = () => {
      const i = this.stack.findIndex((s) => s.el === backdrop);
      if (i < 0) return;
      this.stack.splice(i, 1);
      backdrop.remove();
      previouslyFocused?.focus?.();
      resolve();
    };
    if (dismissible) {
      const x = h('button', { class: 'btn btn--icon dialog__close', 'aria-label': t('common.close') }, '×');
      x.addEventListener('click', () => {
        this.onClick();
        close();
      });
      header.append(x);
      backdrop.addEventListener('pointerdown', (e) => {
        if (e.target === backdrop) close();
      });
    }
    panel.append(header, body);
    if (o.actions?.length) {
      const bar = h('div', { class: 'dialog__actions' });
      for (const a of o.actions) {
        const b = h('button', { class: `btn btn--pill${a.primary ? ' btn--primary' : ''}` }, a.label);
        b.addEventListener('click', () => {
          this.onClick();
          if (a.onClick?.() !== false) close();
        });
        bar.append(b);
      }
      panel.append(bar);
    }
    // Keep keyboard focus inside the dialog.
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    this.root.append(backdrop);
    this.stack.push({ el: backdrop, close });
    panel.focus();
    return { close, closed, body };
  }

  notice(message: string, title = t('error.title')): DialogHandle {
    return this.open({ title, body: h('p', {}, message), actions: [{ label: t('common.ok'), primary: true }] });
  }
}

// ── Game info ───────────────────────────────────────────────────────────────
export interface InfoContext {
  game: PublicGameInfo;
  bet: number;
  money: Money;
  buyRtpLabel: string;
  history: () => Promise<RoundRecord[]>;
  settings: {
    sfx: boolean;
    music: boolean;
    turbo: boolean;
    reducedMotion: boolean;
    leftHand: boolean;
  };
  onSetting: (key: keyof InfoContext['settings'], value: boolean) => void;
  resetDemo?: () => Promise<void>;
}

function payCard(sym: number, lines: string[]): HTMLElement {
  const img = h('img', { src: symbolUrl(sym), alt: '', loading: 'lazy', width: '72', height: '72' });
  const rows = h('div', { class: 'pay__rows' }, ...lines.map((l) => h('div', {}, l)));
  return h('div', { class: 'pay__card' }, img, h('div', {}, h('div', { class: 'pay__name' }, SYMBOLS[sym].name), rows));
}

function paytableTab(c: InfoContext): HTMLElement {
  const { game, money, bet } = c;
  const coin = bet / BET_COINS;
  const wrap = h('div', { class: 'tab' });
  wrap.append(h('h3', {}, t('pay.ways.title')), h('p', {}, t('pay.ways.body')), h('p', { class: 'muted' }, t('pay.perWay')));
  const grid = h('div', { class: 'pay__grid' });
  for (let s = PAY_SYMBOLS - 1; s >= 0; s--) {
    grid.append(payCard(s, [5, 4, 3].map((n) => `${n}  ${money(game.pays[s][n - 3] * coin)}`)));
  }
  wrap.append(grid);
  const special = (sym: number, title: string, body: string) =>
    h('div', { class: 'pay__special' }, h('img', { src: symbolUrl(sym), alt: '', width: '84', height: '84' }), h('div', {}, h('h3', {}, title), h('p', {}, body)));
  wrap.append(
    special(WILD, t('pay.wild.title'), t('pay.wild.body')),
    special(
      SCATTER,
      t('pay.scatter.title'),
      t('pay.scatter.body', {
        p3: money(game.scatterPays[0] * coin),
        p4: money(game.scatterPays[1] * coin),
        p5: money(game.scatterPays[2] * coin),
        s3: game.freeSpinsAward[0],
        s4: game.freeSpinsAward[1],
        s5: game.freeSpinsAward[2],
      }),
    ),
    special(CRATE, t('pay.crate.title'), t('pay.crate.body')),
    h('h3', {}, t('pay.vault.title')),
    h('p', {}, t('pay.vault.body', { maxMult: game.maxMultiplier, maxSpins: game.maxFreeSpins })),
  );
  if (game.jurisdiction.featureBuy) {
    wrap.append(h('h3', {}, t('pay.buy.title')), h('p', {}, t('pay.buy.body', { mult: game.buyPriceBets })));
  }
  return wrap;
}

function rulesTab(c: InfoContext): HTMLElement {
  const { game } = c;
  const wrap = h('div', { class: 'tab' });
  wrap.append(h('h3', {}, t('rules.title')), h('p', {}, t('rules.rtp', { rtp: game.rtpLabel })));
  if (game.jurisdiction.featureBuy) wrap.append(h('p', {}, t('rules.rtpBuy', { rtp: c.buyRtpLabel })));
  wrap.append(h('p', {}, t('rules.maxWin', { max: game.maxWinBets.toLocaleString() })));
  wrap.append(h('ul', {}, ...rulesList().map((r) => h('li', {}, r))));
  wrap.append(h('p', { class: 'muted' }, t('rules.version', { game: game.gameId, version: game.gameVersion, model: game.modelId })));
  return wrap;
}

function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'toggle' }, h('span', {}, label), input);
}

function settingsTab(c: InfoContext): HTMLElement {
  const wrap = h('div', { class: 'tab' });
  const s = c.settings;
  wrap.append(
    toggle(t('settings.sound'), s.sfx, (v) => c.onSetting('sfx', v)),
    toggle(t('settings.music'), s.music, (v) => c.onSetting('music', v)),
  );
  if (c.game.jurisdiction.turbo) wrap.append(toggle(t('settings.turbo'), s.turbo, (v) => c.onSetting('turbo', v)));
  wrap.append(
    toggle(t('settings.reducedMotion'), s.reducedMotion, (v) => c.onSetting('reducedMotion', v)),
    toggle(t('settings.leftHand'), s.leftHand, (v) => c.onSetting('leftHand', v)),
  );
  if (c.resetDemo) {
    const b = h('button', { class: 'btn btn--pill' }, t('settings.resetDemo'));
    const note = h('span', { class: 'muted', role: 'status' });
    b.addEventListener('click', () => {
      void c.resetDemo!().then(() => (note.textContent = ` ${t('settings.resetDone')}`));
    });
    wrap.append(h('div', { class: 'tab__row' }, b, note));
  }
  return wrap;
}

function miniGrid(grid: number[][], reveal: number): HTMLElement {
  const g = h('div', { class: 'mini' });
  for (let row = 0; row < grid[0].length; row++) {
    for (let r = 0; r < grid.length; r++) {
      const sym = grid[r][row];
      const shown = sym === CRATE && reveal >= 0 ? reveal : sym;
      const img = h('img', { src: symbolUrl(shown), alt: SYMBOLS[shown].name, width: '34', height: '34' });
      if (sym === CRATE) img.classList.add('mini__crate');
      g.append(img);
    }
  }
  return g;
}

function roundDetail(r: RoundRecord, money: Money): HTMLElement {
  const coin = r.bet / BET_COINS;
  const wrap = h('div', { class: 'round' });
  for (const step of r.outcome.steps) {
    const title =
      step.kind === 'base' ? t('history.base') : t('history.free', { n: step.index, m: step.multiplier });
    const bits = [money(step.coins * coin)];
    if (step.reveal >= 0) bits.push(t('history.reveal', { symbol: SYMBOLS[step.reveal].name }));
    wrap.append(
      h('div', { class: 'round__step' }, miniGrid(step.grid, step.reveal), h('div', {}, h('b', {}, title), h('div', { class: 'muted' }, bits.join(' · ')))),
    );
  }
  return wrap;
}

function historyTab(c: InfoContext): HTMLElement {
  const wrap = h('div', { class: 'tab' });
  const list = h('div', { class: 'history' }, h('p', { class: 'muted' }, '…'));
  wrap.append(list);
  void c.history().then((rounds) => {
    list.textContent = '';
    if (!rounds.length) {
      list.append(h('p', { class: 'muted' }, t('history.empty')));
      return;
    }
    for (const r of rounds) {
      const time = new Date(r.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
      const summary = h(
        'summary',
        {},
        h('span', {}, time),
        h('span', {}, t(r.mode === 'buy' ? 'history.type.buy' : 'history.type.spin')),
        h('span', {}, c.money(r.stake)),
        h('span', { class: r.win > 0 ? 'pos' : '' }, c.money(r.win)),
      );
      const details = h('details', { class: 'history__row' }, summary);
      details.addEventListener('toggle', () => {
        if (details.open && details.childElementCount === 1) {
          details.append(h('div', { class: 'muted round__id' }, t('history.detail', { id: r.roundId })), roundDetail(r, c.money));
        }
      });
      list.append(details);
    }
  });
  return wrap;
}

export function openInfo(dialogs: Dialogs, c: InfoContext, initial: 'paytable' | 'rules' | 'settings' | 'history' = 'paytable'): DialogHandle {
  const tabs: Array<[string, string, () => HTMLElement]> = [
    ['paytable', t('menu.paytable'), () => paytableTab(c)],
    ['rules', t('menu.rules'), () => rulesTab(c)],
    ['settings', t('menu.settings'), () => settingsTab(c)],
    ['history', t('menu.history'), () => historyTab(c)],
  ];
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const content = h('div', { class: 'tabs__content' });
  const buttons: HTMLButtonElement[] = [];
  const show = (id: string) => {
    tabs.forEach(([tid, , build], i) => {
      const on = tid === id;
      buttons[i].setAttribute('aria-selected', String(on));
      if (on) content.replaceChildren(build());
    });
    content.scrollTop = 0;
  };
  for (const [id, label] of tabs) {
    const b = h('button', { class: 'tabs__tab', role: 'tab' }, label);
    b.addEventListener('click', () => show(id));
    buttons.push(b);
    bar.append(b);
  }
  const body = h('div', { class: 'info' }, bar, content);
  const handle = dialogs.open({ title: t('app.title'), body, wide: true });
  show(initial);
  return handle;
}

// ── Autoplay ────────────────────────────────────────────────────────────────
export interface AutoConfig {
  spins: number;
  /** Stop when the balance has fallen by this much (minor units). */
  lossLimit: number;
  /** Stop when a single round wins at least this much (0 = off). */
  winLimit: number;
  stopOnFeature: boolean;
}

function chips<T>(options: Array<[T, string]>, initial: T | null, onPick: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'chips', role: 'radiogroup' });
  const buttons: HTMLButtonElement[] = [];
  options.forEach(([value, label]) => {
    const b = h('button', { class: 'chip', role: 'radio', 'aria-checked': String(value === initial) }, label);
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      onPick(value);
    });
    buttons.push(b);
    wrap.append(b);
  });
  return wrap;
}

export function openAuto(dialogs: Dialogs, game: PublicGameInfo, bet: number, money: Money, start: (c: AutoConfig) => void): void {
  const rule = game.jurisdiction.autoplay;
  const cfg: AutoConfig = { spins: rule.options[0] ?? 10, lossLimit: 0, winLimit: 0, stopOnFeature: true };
  const error = h('p', { class: 'error', role: 'alert' });
  const lossOptions: Array<[number, string]> = [10, 25, 50, 100, 250].map((m) => [m * bet, money(m * bet)]);
  if (!rule.requireLossLimit) lossOptions.unshift([0, t('auto.noLimit')]);
  const winOptions: Array<[number, string]> = [[0, t('auto.noLimit')], ...[20, 50, 100, 500].map((m): [number, string] => [m * bet, money(m * bet)])];
  const body = h(
    'div',
    { class: 'tab' },
    h('h3', {}, t('auto.spins')),
    chips(rule.options.map((n): [number, string] => [n, String(n)]), cfg.spins, (v) => (cfg.spins = v)),
    h('h3', {}, t('auto.lossLimit')),
    chips(lossOptions, rule.requireLossLimit ? null : 0, (v) => {
      cfg.lossLimit = v;
      error.textContent = '';
    }),
    h('h3', {}, t('auto.winLimit')),
    chips(winOptions, 0, (v) => (cfg.winLimit = v)),
    toggle(t('auto.stopOnFeature'), cfg.stopOnFeature, (v) => (cfg.stopOnFeature = v)),
    h('p', { class: 'muted' }, t('auto.note')),
    error,
  );
  dialogs.open({
    title: t('auto.title'),
    body,
    actions: [
      { label: t('common.cancel') },
      {
        label: t('auto.start'),
        primary: true,
        onClick: () => {
          if (rule.requireLossLimit && cfg.lossLimit <= 0) {
            error.textContent = t('auto.lossLimitRequired');
            return false;
          }
          start(cfg);
          return true;
        },
      },
    ],
  });
}

export function openBuy(dialogs: Dialogs, game: PublicGameInfo, bet: number, money: Money, rtp: string, confirm: () => void): void {
  const price = money(bet * game.buyPriceBets);
  const body = h(
    'div',
    { class: 'tab buy' },
    h('img', { src: symbolUrl(SCATTER), alt: '', width: '110', height: '110' }),
    h('p', {}, t('buy.body', { price, mult: game.buyPriceBets, bet: money(bet) })),
    h('p', { class: 'muted' }, t('buy.rtp', { rtp })),
  );
  dialogs.open({
    title: t('buy.title'),
    body,
    actions: [{ label: t('common.cancel') }, { label: t('buy.confirm', { price }), primary: true, onClick: confirm }],
  });
}

export function openRealityCheck(
  dialogs: Dialogs,
  info: { minutes: number; staked: string; won: string; net: string },
  onHistory: () => void,
): DialogHandle {
  return dialogs.open({
    title: t('rc.title'),
    body: h('p', {}, t('rc.body', info)),
    dismissible: false,
    actions: [
      { label: t('rc.history'), onClick: () => (onHistory(), false) },
      { label: t('common.continue'), primary: true },
    ],
  });
}
