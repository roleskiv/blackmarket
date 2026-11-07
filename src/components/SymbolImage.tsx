import { memo, useState } from 'react';
import { SYMBOLS, type SymbolId } from '../config/symbols';

const base = import.meta.env.BASE_URL;
export const symbolSrc = (id: SymbolId) => `${base}${SYMBOLS[id].image}`;
/** Pre-blurred copy used while a reel is moving (falls back to the sharp art if missing). */
export const symbolBlurSrc = (id: SymbolId) => `${base}${SYMBOLS[id].image.replace(/([^/]+)$/, 'blur/$1')}`;

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
export function symbolElement(id: SymbolId, motion = false): HTMLElement {
  const cell = document.createElement('div');
  cell.className = motion ? 'strip-cell is-motion' : 'strip-cell';
  const img = document.createElement('img');
  img.src = motion ? symbolBlurSrc(id) : symbolSrc(id);
  img.alt = '';
  img.draggable = false;
  img.className = 'sym-img';
  img.onerror = () => {
    if (motion && img.src !== new URL(symbolSrc(id), location.href).href) {
      img.src = symbolSrc(id);
      return;
    }
    cell.innerHTML = `<div class="sym-placeholder" style="border-color:${SYMBOLS[id].glow};color:${SYMBOLS[id].glow}"><span class="sym-placeholder-name">${SYMBOLS[id].name}</span><span class="sym-placeholder-tag">PLACEHOLDER</span></div>`;
  };
  cell.appendChild(img);
  return cell;
}

/** Load every symbol (sharp + motion copies). Resolves with progress callbacks; never rejects. */
export function preloadSymbols(onProgress?: (done: number, total: number) => void): Promise<void> {
  const urls = (Object.keys(SYMBOLS) as SymbolId[]).flatMap((id) => [symbolSrc(id), symbolBlurSrc(id)]);
  let done = 0;
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((resolve) => {
          const i = new Image();
          i.onload = i.onerror = () => {
            done++;
            onProgress?.(done, urls.length);
            resolve();
          };
          i.src = u;
        }),
    ),
  ).then(() => undefined);
}
