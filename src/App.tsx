import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BET_LEVELS, FEATURE_CONFIG, STARTING_BALANCE } from './config/game';
import { TIMING } from './config/visual';
import { SYMBOLS, symbolsOfRarity, type SymbolId } from './config/symbols';
import { SlotEngine, type ForceOptions, type SpinOutcome } from './engine/game';
import { gridFromRows } from './engine/reels';
import type { BonusState, BonusSummary } from './engine/bonus';
import type { FeatureStep, Grid } from './engine/types';
import { generateGrid } from './engine/reels';
import { createRng } from './engine/rng';
import { audio } from './audio/AudioManager';
import { useSettings } from './hooks/useSettings';
import { skipper } from './animations/skip';
import { fx, centerOf } from './animations/fx';
import { celebrateCells, countUp } from './animations/winEffects';
import { playCrate } from './animations/crateAnimation';
import { playDealerHand } from './animations/dealerAnimation';
import { playVault } from './animations/vaultAnimation';
import { Backdrop } from './components/Backdrop';
import { TopBar } from './components/TopBar';
import { Dealer, type DealerHandle } from './components/Dealer';
import { ReelGrid, cellKey, type CellState, type ReelGridHandle } from './components/ReelGrid';
import { Controls } from './components/Controls';
import { CrateOverlay, DealerHandOverlay, VaultOverlay, type CrateReveal } from './components/Overlays';
import { ArtifactToast, BonusHud, BonusSummaryModal, artifactDef } from './components/Bonus';
import { WinBanner, type BannerTier } from './components/WinBanner';
import { InfoModal, SettingsPanel } from './components/Panels';
import { SymbolImage, preloadSymbols } from './components/SymbolImage';
import { formatCredits } from './components/format';
import type { ArtifactDrop } from './engine/types';

const urlSeed = (() => {
  try {
    const s = new URLSearchParams(window.location.search).get('seed');
    return s ? Number(s) >>> 0 : undefined;
  } catch {
    return undefined;
  }
})();

const part = (root: HTMLElement | null, name: string) => root?.querySelector(`[data-part="${name}"]`) as HTMLElement;

function crateRevealFor(step: Extract<FeatureStep, { type: 'crate' }>): CrateReveal {
  const cfg = FEATURE_CONFIG.crateEffects.find((e) => e.kind === step.effect)!;
  const base = { title: cfg.title, description: cfg.description };
  switch (step.effect) {
    case 'add_wilds':
      return { ...base, detail: `${step.changes.length} Wilds slip onto the reels.` };
    case 'multiplier':
      return { ...base, multiplier: step.multiplier, detail: `All line wins this spin ×${step.multiplier}.` };
    case 'expanding_wild':
      return { ...base, detail: `Reel ${step.reel! + 1} turns fully Wild.` };
    case 'transform_low':
    case 'upgrade_premium':
      return { ...base, from: step.from, to: step.to, detail: `Every ${SYMBOLS[step.from!].name} becomes a ${SYMBOLS[step.to!].name}.` };
  }
}

export default function App() {
  const engineRef = useRef<SlotEngine>();
  if (!engineRef.current) engineRef.current = new SlotEngine({ seed: urlSeed });
  const engine = engineRef.current;

  const [settings, updateSettings] = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const initialGrid = useMemo<Grid>(() => generateGrid(createRng(7)).map((c) => c.map((s) => (s === 'scatter' ? 'heart' : s))), []);
  const [balance, setBalance] = useState(engine.balance);
  const [betIndex, setBetIndex] = useState(engine.betIndex);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [win, setWin] = useState(0);
  const [cellStates, setCellStates] = useState<Record<string, CellState>>({});
  const [lines, setLines] = useState<number[]>([]);
  const [cycle, setCycle] = useState<{ line: number; cells: string[] }[]>([]);
  const [crateReveal, setCrateReveal] = useState<CrateReveal | null>(null);
  const [handSymbol, setHandSymbol] = useState<SymbolId | null>(null);
  const [vaultSpins, setVaultSpins] = useState(0);
  const [bonus, setBonus] = useState<BonusState | null>(null);
  const [bonusWin, setBonusWin] = useState(0);
  const [banner, setBanner] = useState<{ tier: BannerTier; amount: number } | null>(null);
  const [toast, setToast] = useState<ArtifactDrop | null>(null);
  const [summary, setSummary] = useState<BonusSummary | null>(null);
  const summaryResolve = useRef<(() => void) | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [autoRemaining, setAutoRemaining] = useState<number | null>(null);
  const autoRef = useRef<number | null>(null);
  autoRef.current = autoRemaining;
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const forceRef = useRef<ForceOptions | null>(null);

  const reels = useRef<ReelGridHandle>(null);
  const dealer = useRef<DealerHandle>(null);
  const crateRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const vaultRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fxHost = useRef<HTMLDivElement>(null);

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    preloadSymbols();
    if (fxHost.current) fx.mount(fxHost.current);
    audio.playMusic('ambience');
  }, []);

  useEffect(() => {
    audio.setEnabled(settings.sound);
    audio.setMusicVolume(settings.musicVolume);
    audio.setSfxVolume(settings.sfxVolume);
    fx.setEnabled(!settings.reducedMotion);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  }, [settings.sound, settings.musicVolume, settings.sfxVolume, settings.reducedMotion]);

  // Idle win-line cycling (purely cosmetic).
  useEffect(() => {
    if (cycle.length < 2) return;
    let i = 0;
    const id = setInterval(() => {
      const c = cycle[i % cycle.length];
      const states: Record<string, CellState> = {};
      for (let r = 0; r < 5; r++) for (let w = 0; w < 4; w++) states[cellKey(r, w)] = 'dim';
      c.cells.forEach((k) => (states[k] = 'win'));
      setCellStates(states);
      setLines([c.line]);
      i++;
    }, TIMING.winLinePause * 1000);
    return () => clearInterval(id);
  }, [cycle]);

  const clearHighlights = () => {
    setCycle([]);
    setCellStates({});
    setLines([]);
    setMultiplier(1);
  };

  // ── Feature presentation ────────────────────────────────────────────────
  const playStep = async (step: FeatureStep) => {
    const s = settingsRef.current;
    const g = reels.current!;
    if (step.type === 'crate') {
      setCrateReveal(crateRevealFor(step));
      audio.play('dealer', { volume: 0.6 });
      dealer.current?.lean();
      await playCrate(
        { overlay: crateRef.current!, crate: part(crateRef.current, 'crate'), lid: part(crateRef.current, 'lid'), light: part(crateRef.current, 'light'), card: part(crateRef.current, 'card') },
        { reducedMotion: s.reducedMotion, turbo: s.turbo, color: '#7dff6a' },
      );
      dealer.current?.settle();
      if (step.effect === 'multiplier') {
        setMultiplier(step.multiplier);
        audio.play('magic');
      } else {
        if (step.effect === 'expanding_wild') audio.play('wild_land');
        else audio.play('magic', { volume: 0.7 });
        await g.applyChanges(step.changes, step.effect === 'add_wilds' || step.effect === 'expanding_wild' ? 'wild' : 'magic');
      }
    } else if (step.type === 'dealer_hand') {
      setHandSymbol(step.symbol);
      await new Promise((r) => requestAnimationFrame(r));
      const finish = await playDealerHand(
        dealer.current,
        { hand: part(handRef.current, 'hand'), card: part(handRef.current, 'card'), dim: part(handRef.current, 'dim'), reel: g.reelEl(step.reel)! },
        { reducedMotion: s.reducedMotion, turbo: s.turbo },
      );
      audio.play('magic');
      await g.applyChanges(step.changes, 'smoke');
      await finish();
    } else if (step.type === 'eye_sigil') {
      audio.play('magic', { volume: 0.6 });
      await g.applyChanges(step.changes, 'magic');
    } else if (step.type === 'raven_feather') {
      await g.applyChanges(step.changes, 'wild');
    }
  };

  const presentWins = async (o: SpinOutcome, startWin: number) => {
    const r = o.result;
    const g = reels.current!;
    const s = settingsRef.current;
    if (r.lineWins.length === 0 && r.scatter.win === 0) return;
    const states: Record<string, CellState> = {};
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) states[cellKey(x, y)] = 'dim';
    r.lineWins.forEach((w) => w.cells.forEach((c) => (states[cellKey(c.reel, c.row)] = 'win')));
    if (r.scatter.win > 0) r.scatter.cells.forEach((c) => (states[cellKey(c.reel, c.row)] = 'scatter'));
    setCellStates(states);
    setLines(r.lineWins.map((w) => w.line));
    celebrateCells(
      r.lineWins.flatMap((w) => w.cells.map((c) => ({ el: g.cellEl(c.reel, c.row), symbol: w.symbol }))),
      s.reducedMotion ? 0 : 1,
    );
    const x = r.totalWin / r.bet;
    const tier: BannerTier | null = x >= TIMING.epicWinThresholdX ? 'epic' : x >= TIMING.megaWinThresholdX ? 'mega' : x >= TIMING.bigWinThresholdX ? 'big' : null;
    if (tier) {
      audio.play('win_big');
      dealer.current?.react('big');
      const c = centerOf(g.windowEl());
      fx.fountain(c.x, c.y + 120, ['#f1d58a', '#c9a24a', '#fff2c4'], 120);
      setBanner({ tier, amount: 0 });
      await countUp(0, r.totalWin, s.turbo ? 1.5 : tier === 'epic' ? 5 : tier === 'mega' ? 4 : 3, (v) => {
        setBanner({ tier, amount: v });
        setWin(startWin + v);
      });
      await skipper.wait(1.2);
      setBanner(null);
    } else {
      audio.play('win_small', { volume: x >= 3 ? 1 : 0.6 });
      if (x >= 5) dealer.current?.react('win');
      await countUp(0, r.totalWin, s.turbo ? 0.3 : Math.min(1.6, 0.4 + x * 0.12), (v) => setWin(startWin + v));
    }
    setCycle(r.lineWins.map((w) => ({ line: w.line, cells: w.cells.map((c) => cellKey(c.reel, c.row)) })));
  };

  const flyArtifact = async (a: ArtifactDrop) => {
    audio.play('artifact');
    setToast(a);
    const slot = document.querySelector(`[data-artifact="${a.kind}"]`);
    if (slot) {
      const c = centerOf(slot);
      fx.burst(c.x, c.y, [artifactDef(a.kind).color, '#ffffff'], 30, 0.6);
    }
    await skipper.wait(settingsRef.current.turbo ? 0.6 : 1.4);
    setToast(null);
  };

  // ── Spin orchestration ──────────────────────────────────────────────────
  const runSpin = useCallback(async () => {
    if (busyRef.current) {
      skipper.skip();
      return;
    }
    audio.init();
    if (!engine.canSpin()) {
      setAutoRemaining(null);
      setMessage('Not enough demo credits for this bet. Lower the bet or reset the demo balance in Settings.');
      return;
    }
    setMessage(null);
    busyRef.current = true;
    setBusy(true);
    skipper.reset();
    clearHighlights();
    const s = settingsRef.current;
    const wasBonus = engine.phase === 'bonus';

    // 1. Resolve AND settle the spin in the engine before anything animates.
    const o = engine.spin(forceRef.current ?? {});
    forceRef.current = null;
    const r = o.result;
    if (!wasBonus) {
      setBalance(o.balanceBefore - r.bet);
      setWin(0);
    }
    const winBefore = wasBonus ? bonusWin : 0;
    if (wasBonus && o.bonus) setBonus({ ...o.bonus, collected: bonus?.collected ?? [], spinsRemaining: o.bonus.spinsRemaining });

    // 2. Reels. Anticipation if two scatters land before the last reels.
    let seen = 0;
    let anticipationFrom: number | undefined;
    for (let i = 0; i < 4; i++) {
      if (r.initialGrid[i].includes('scatter')) seen++;
      if (seen >= 2) {
        anticipationFrom = i + 1;
        break;
      }
    }
    audio.play('reel_spin', { volume: 0.5 });
    await reels.current!.spin(r.initialGrid, {
      turbo: s.turbo,
      reducedMotion: s.reducedMotion,
      anticipationFrom,
      onReelStop: (i, col) => {
        audio.play('reel_stop', { rate: 0.95 + i * 0.03 });
        if (col.includes('scatter')) audio.play('scatter_land', { volume: 0.7 });
        else if (col.includes('wild')) audio.play('wild_land', { volume: 0.4 });
        if (i === 4) audio.stop('reel_spin');
      },
    });
    audio.stop('reel_spin');

    // 3. Features, in the exact order the engine applied them.
    for (const step of r.steps) await playStep(step);

    // 4. Payout is already settled — reflect the real balance now.
    setBalance(o.balanceAfter);
    if (wasBonus) setBonusWin(winBefore + r.totalWin);
    await presentWins(o, winBefore);
    setWin(winBefore + r.totalWin);

    // 5. Bonus extras.
    if (o.bonus && wasBonus) setBonus(o.bonus);
    if (r.artifact) await flyArtifact(r.artifact);
    if (wasBonus && r.freeSpinsAwarded > 0) {
      audio.play('scatter_land');
      setMessage(`+${r.freeSpinsAwarded} free spins!`);
      await skipper.wait(1.2);
      setMessage(null);
    }

    if (o.bonusTriggered) {
      const st: Record<string, CellState> = {};
      r.scatter.cells.forEach((c) => (st[cellKey(c.reel, c.row)] = 'scatter'));
      setCellStates(st);
      setCycle([]);
      audio.play('scatter_land');
      dealer.current?.react('big');
      await skipper.wait(1.0);
      skipper.reset();
      setVaultSpins(o.bonusTriggered.spins);
      await playVault(
        {
          overlay: vaultRef.current!,
          stage: stageRef.current!,
          vault: part(vaultRef.current, 'vault'),
          keys: Array.from(vaultRef.current!.querySelectorAll('[data-part="key"]')) as HTMLElement[],
          lock: part(vaultRef.current, 'lock'),
          doorL: part(vaultRef.current, 'doorL'),
          doorR: part(vaultRef.current, 'doorR'),
          light: part(vaultRef.current, 'light'),
          title: part(vaultRef.current, 'title'),
        },
        { reducedMotion: s.reducedMotion },
      );
      clearHighlights();
      setBonus(o.bonus!);
      setBonusWin(0);
      setWin(0);
      audio.playMusic('bonus_music');
    }

    if (o.bonusEnded) {
      await skipper.wait(0.8);
      skipper.reset();
      setSummary(o.bonusEnded);
      audio.play('win_big', { volume: 0.7 });
      const c = centerOf(document.body);
      fx.fountain(c.x, c.y + 200, ['#f1d58a', '#c9a24a', '#b45cff'], 120);
      await new Promise<void>((resolve) => {
        summaryResolve.current = resolve;
        if (autoRef.current !== null) setTimeout(resolve, 5000);
      });
      setSummary(null);
      setBonus(null);
      setWin(o.bonusEnded.totalWin);
      audio.play('transition');
      audio.playMusic('ambience');
    }

    setHistoryTick((t) => t + 1);
    busyRef.current = false;
    setBusy(false);

    // 6. Continue: free spins auto-play; auto-spin counts down in base game.
    const pause = (s.turbo ? 0.15 : TIMING.autoSpinPause) * 1000;
    if (engine.phase === 'bonus') {
      setTimeout(() => runSpinRef.current(), o.bonusTriggered ? 400 : pause + 250);
    } else if (autoRef.current !== null) {
      const next = autoRef.current === Infinity ? Infinity : autoRef.current - (wasBonus ? 0 : 1);
      if (next <= 0 || !engine.canSpin()) setAutoRemaining(null);
      else {
        setAutoRemaining(next);
        setTimeout(() => {
          if (autoRef.current !== null) runSpinRef.current();
        }, pause);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, bonus, bonusWin]);

  const runSpinRef = useRef(runSpin);
  // Developer / QA hook: window.blackMarketDebug.forceNext({ forceCrate: 'add_wilds' }) — forces the
  // NEXT engine resolution only. Outcomes are still produced and settled by the engine.
  useEffect(() => {
    (window as unknown as { blackMarketDebug: unknown }).blackMarketDebug = {
      forceNext: (f: ForceOptions) => (forceRef.current = f),
      forceVault: () =>
        (forceRef.current = {
          forceGrid: gridFromRows([
            ['scatter', 'spade', 'scatter', 'heart', 'scatter'],
            ['heart', 'pocket_watch', 'club', 'diamond', 'spade'],
            ['club', 'candle_skull', 'heart', 'spade', 'diamond'],
            ['diamond', 'plague_mask', 'spade', 'club', 'heart'],
          ]),
        }),
      engine,
    };
  }, [engine]);
  runSpinRef.current = runSpin;

  // Keyboard: Space = spin / skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || showSettings || showInfo) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON')) return;
      e.preventDefault();
      if (summary) summaryResolve.current?.();
      else runSpinRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings, showInfo, summary]);

  const changeBet = (d: number) => {
    audio.init();
    audio.play('click');
    engine.setBetIndex(engine.betIndex + d);
    setBetIndex(engine.betIndex);
  };

  const startAuto = (n: number) => {
    audio.init();
    setAutoRemaining(n);
    autoRef.current = n;
    if (!busyRef.current) runSpinRef.current();
  };

  const resetBalance = () => {
    engine.resetBalance(STARTING_BALANCE);
    setBalance(engine.balance);
    setWin(0);
    setBonus(null);
    setMessage(null);
    setAutoRemaining(null);
    setHistoryTick((t) => t + 1);
    audio.play('coin');
  };

  const inBonus = !!bonus;
  const premium = symbolsOfRarity('premium');

  return (
    <div className={`app ${inBonus ? 'in-bonus' : ''} ${settings.reducedMotion ? 'is-reduced' : ''}`}>
      <Backdrop bonus={inBonus} />
      <div ref={fxHost} />
      <div className="stage" ref={stageRef}>
        <TopBar
          sound={settings.sound}
          onSound={() => {
            audio.init();
            updateSettings({ sound: !settings.sound });
          }}
          onSettings={() => setShowSettings(true)}
          onInfo={() => setShowInfo(true)}
          demo
        />
        <main className="main">
          <aside className="dealer-area">
            <div className="dealer-spot" />
            <Dealer ref={dealer} reducedMotion={settings.reducedMotion} />
            <div className="dealer-counter" />
          </aside>

          <section className="reels-area">
            {inBonus && (
              <div className="bonus-ribbon">
                <span>THE DEALER’S VAULT</span>
                <b>{bonus.spinsRemaining} free spins left</b>
              </div>
            )}
            <div className="reels-wrap">
              <ReelGrid ref={reels} initial={initialGrid} cellStates={cellStates} lines={lines} spinning={busy} bonus={inBonus} />
              {multiplier > 1 && <div className="mult-badge">×{multiplier}</div>}
              {message && <div className="reel-message">{message}</div>}
            </div>
            {inBonus && (
              <div className="bonus-hud-mobile">
                <BonusHud bonus={bonus} bonusWin={bonusWin} />
              </div>
            )}
          </section>

          <aside className="side-area">
            {inBonus ? (
              <BonusHud bonus={bonus} bonusWin={bonusWin} />
            ) : (
              <div className="market-board">
                <div className="market-board-title">Tonight’s contraband</div>
                {premium.map((id) => (
                  <div key={id} className="market-row" style={{ ['--glow' as string]: SYMBOLS[id].glow }}>
                    <SymbolImage id={id} />
                    <span>{SYMBOLS[id].name}</span>
                    <b>{formatCredits((SYMBOLS[id].pays[5] * BET_LEVELS[betIndex]) / 25)}</b>
                  </div>
                ))}
                <div className="market-board-foot">
                  <span>3+ <SymbolImage id="scatter" /> open the Vault</span>
                </div>
              </div>
            )}
          </aside>
        </main>
        <Controls
          balance={balance}
          betIndex={betIndex}
          win={win}
          winLabel={inBonus ? 'Bonus win' : 'Win'}
          busy={busy}
          canSpin={inBonus || balance >= BET_LEVELS[betIndex]}
          inBonus={inBonus}
          autoRemaining={autoRemaining}
          turbo={settings.turbo}
          onBet={changeBet}
          onSpin={() => runSpinRef.current()}
          onAuto={startAuto}
          onStopAuto={() => setAutoRemaining(null)}
          onTurbo={() => updateSettings({ turbo: !settings.turbo })}
        />
      </div>

      <DealerHandOverlay ref={handRef} symbol={handSymbol} />
      <CrateOverlay ref={crateRef} reveal={crateReveal} />
      <VaultOverlay ref={vaultRef} spins={vaultSpins} />
      {banner && <WinBanner tier={banner.tier} amount={banner.amount} onSkip={() => skipper.skip()} />}
      {toast && (
        <div className="toast-wrap">
          <ArtifactToast kind={toast.kind} detail={toast.kind === 'eye_sigil' && toast.from && toast.to ? `Every ${SYMBOLS[toast.from].name} now lands as a ${SYMBOLS[toast.to].name}.` : undefined} />
        </div>
      )}
      {(busy || banner) && <button className="skip-btn" onClick={() => skipper.skip()}>Skip ▸▸</button>}
      {summary && <BonusSummaryModal summary={summary} onClose={() => summaryResolve.current?.()} />}
      {showSettings && (
        <SettingsPanel
          key={historyTick}
          settings={settings}
          update={updateSettings}
          onClose={() => setShowSettings(false)}
          onReset={resetBalance}
          history={engine.history}
          resetDisabled={busy || inBonus}
        />
      )}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} betIndex={betIndex} />}
    </div>
  );
}
