/**
 * Client entry point.
 *
 * Launch parameters (query string)
 *   rgs=<url>        talk to a Remote Game Server instead of the in-browser demo
 *   player=<id>      demo player id for the reference RGS
 *   token=<token>    operator launch token (passed to the RGS untouched)
 *   rtp=96|94|92     demo only: which math variant to load
 *   jur=intl|uk|de   demo only: which jurisdiction profile to apply
 *   seed=<n>         demo only: deterministic RNG for QA
 */
// Lets the renderer run under a strict Content-Security-Policy (no eval).
import 'pixi.js/unsafe-eval';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './ui/styles.css';
import { GameError, type GameService } from '../rgs/types';
import { Sound } from './audio/sound';
import { Game } from './game';
import { loadTextures } from './gfx/assets';
import { Scene } from './gfx/scene';
import { LocalService } from './services/local';
import { RemoteService } from './services/remote';
import { Dialogs } from './ui/dialogs';
import { Hud } from './ui/hud';
import { t } from './ui/i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const app = $('app');
  const fill = $('loading-fill');
  const bar = fill.parentElement!;
  const note = $('loading-note');
  const enter = $<HTMLButtonElement>('enter');
  const progress = (f: number) => {
    fill.style.width = `${Math.round(f * 100)}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  };
  enter.textContent = t('loading.enter');

  const rgs = params.get('rgs');
  const demo = !rgs;
  const service: GameService = rgs
    ? new RemoteService(rgs.replace(/\/$/, ''), {
        playerId: params.get('player') ?? undefined,
        token: params.get('token') ?? undefined,
      })
    : new LocalService({
        model: params.has('rtp') ? `bm2-${params.get('rtp')}` : undefined,
        jurisdiction: params.get('jur') ?? undefined,
        seed: params.has('seed') ? Number(params.get('seed')) : undefined,
      });
  if (demo) note.textContent = t('loading.note');

  const fonts = Promise.all(
    ['900 40px Cinzel', '700 20px Cinzel', '600 16px Inter', '700 16px Inter'].map((f) => document.fonts.load(f)),
  ).catch(() => undefined);
  const [textures, session] = await Promise.all([loadTextures((f) => progress(f * 0.9)), service.open(), fonts]);

  const sound = new Sound();
  const scene = new Scene(textures);
  await scene.init($('stage'));
  const dialogs = new Dialogs($('dialogs'), () => sound.click());
  // The HUD is created before the controller; handlers bind late.
  let game!: Game;
  const hud = new Hud(app, {
    spin: () => game.onSpinButton(),
    betStep: (d) => game.betStep(d),
    openMenu: () => game.openMenu(),
    openAuto: () => game.openAutoDialog(),
    openBuy: () => game.openBuyDialog(),
    toggleTurbo: () => game.toggleTurbo(),
    toggleSound: () => {
      sound.unlock();
      game.toggleSound();
    },
  });
  game = new Game(scene, hud, dialogs, sound, service, session, { demo, buyRtpLabel: session.game.buyRtpLabel });

  const layout = () => {
    const { top, bottom } = hud.insets();
    scene.layout(app.clientWidth, app.clientHeight, top, bottom);
  };
  new ResizeObserver(layout).observe(app);
  new ResizeObserver(layout).observe(hud.root);
  layout();

  progress(1);
  bar.hidden = true;
  enter.hidden = false;
  enter.focus();
  enter.addEventListener(
    'click',
    () => {
      sound.unlock();
      sound.setMusic('market');
      const loading = $('loading');
      loading.classList.add('loading--out');
      window.setTimeout(() => loading.remove(), 500);
      if (session.pendingRound) void game.resume(session.pendingRound);
    },
    { once: true },
  );

  if (demo) {
    // QA console: __bm.force([stop1..stop5, reveal]) scripts the next round's RNG draws.
    (window as unknown as { __bm: unknown }).__bm = {
      force: (draws: number[]) => (service as LocalService).forceNext(draws),
      game,
      scene,
      session,
    };
  }
}

boot().catch((e) => {
  console.error(e);
  const note = document.getElementById('loading-note');
  const code = e instanceof GameError ? e.code : 'NETWORK';
  if (note) note.textContent = code === 'NETWORK' ? t('error.NETWORK') : t('error.INTERNAL');
});
