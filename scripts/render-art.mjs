/**
 * Renders the vector art sources in art/src/*.svg to the bitmaps the game
 * loads (public/assets/**). Run with `npm run art` after editing a source.
 * Each SVG carries its own output path and size in a header comment:
 *   <!-- out: public/assets/symbols/crate.png size: 256x256 -->
 * Opaque outputs ending in .jpg are written as JPEG, everything else as PNG
 * with transparency.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'art/src');
const only = process.argv.slice(2);

const font = (w) =>
  readFileSync(join(root, `node_modules/@fontsource/cinzel/files/cinzel-latin-${w}-normal.woff2`)).toString('base64');
const fontCss = [700, 900]
  .map((w) => `@font-face{font-family:Cinzel;font-weight:${w};src:url(data:font/woff2;base64,${font(w)}) format('woff2');}`)
  .join('');

const browser = await chromium.launch();
for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.svg')).sort()) {
  if (only.length && !only.some((o) => file.includes(o))) continue;
  const svg = readFileSync(join(srcDir, file), 'utf8');
  const m = /out:\s*(\S+)\s+size:\s*(\d+)x(\d+)/.exec(svg);
  if (!m) throw new Error(`${file}: missing "out: <path> size: WxH" header`);
  const [, out, w, h] = m;
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>${fontCss}html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`,
  );
  await page.evaluate(() => document.fonts.ready);
  const jpg = out.endsWith('.jpg');
  await page.screenshot({
    path: join(root, out),
    omitBackground: !jpg,
    type: jpg ? 'jpeg' : 'png',
    ...(jpg ? { quality: 86 } : {}),
  });
  await page.close();
  console.log(`${file} -> ${out}`);
}
await browser.close();
