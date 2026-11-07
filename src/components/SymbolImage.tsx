import { memo, useState } from 'react';
import { SYMBOLS, type SymbolId } from '../config/symbols';

const base = import.meta.env.BASE_URL;
export const symbolSrc = (id: SymbolId) => `${base}${SYMBOLS[id].image}`;

/**
 * Renders a symbol's PNG. If the file is missing, shows a clearly labelled
 * temporary placeholder instead of broken imagery.
 */
export const SymbolImage = memo(function SymbolImage({ id, className = '' }: { id: SymbolId; className?: string }) {
  const [broken, setBroken] = useState(false);
  const def = SYMBOLS[id];
  if (broken) {
    return (
      <div className={`sym-placeholder ${className}`} style={{ borderColor: def.glow, color: def.glow }} title="Temporary placeholder — artwork missing">
        <span className="sym-placeholder-name">{def.name}</span>
        <span className="sym-placeholder-tag">PLACEHOLDER</span>
      </div>
    );
  }
  return <img src={symbolSrc(id)} alt={def.name} draggable={false} className={`sym-img ${className}`} onError={() => setBroken(true)} />;
});

/** Imperative (non-React) version used to build spinning strips quickly. */
export function symbolElement(id: SymbolId): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'strip-cell';
  const img = document.createElement('img');
  img.src = symbolSrc(id);
  img.alt = '';
  img.draggable = false;
  img.className = 'sym-img';
  img.onerror = () => {
    cell.innerHTML = `<div class="sym-placeholder" style="border-color:${SYMBOLS[id].glow};color:${SYMBOLS[id].glow}"><span class="sym-placeholder-name">${SYMBOLS[id].name}</span><span class="sym-placeholder-tag">PLACEHOLDER</span></div>`;
  };
  cell.appendChild(img);
  return cell;
}

/** Warm the browser cache so reels never show half-loaded art. */
export function preloadSymbols() {
  for (const id of Object.keys(SYMBOLS) as SymbolId[]) {
    const i = new Image();
    i.src = symbolSrc(id);
  }
}
