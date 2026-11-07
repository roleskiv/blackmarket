import { IconGear, IconInfo, IconSound } from './Icons';

export function Logo() {
  return (
    <div className="logo" aria-label="Black Market">
      <span className="logo-black">BLACK</span>
      <span className="logo-market">MARKET</span>
      <span className="logo-tag">the underground market for forbidden goods</span>
    </div>
  );
}

export function TopBar(props: { sound: boolean; onSound: () => void; onSettings: () => void; onInfo: () => void; demo: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn" onClick={props.onInfo} aria-label="Paytable and rules"><IconInfo /></button>
      </div>
      <Logo />
      <div className="topbar-right">
        <button className="icon-btn" onClick={props.onSound} aria-label={props.sound ? 'Mute sound' : 'Unmute sound'}><IconSound on={props.sound} /></button>
        <button className="icon-btn" onClick={props.onSettings} aria-label="Settings"><IconGear /></button>
      </div>
      {props.demo && <div className="demo-ribbon">DEMO CREDITS · NO REAL MONEY</div>}
    </header>
  );
}
