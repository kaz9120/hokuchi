// build.mjs — spike の before/after を out/ に並べて出力する。
//   node build.mjs
//   → out/before/index.html  現行 render.mjs の出力
//   → out/after/index.html   engine.mjs (measure/compose 試作) の出力
// 撮影はそれぞれ `node ../../cli.mjs shot out/before` / `shot out/after`。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDeck } from '../../src/load.mjs';
import { renderDeck } from '../../src/render.mjs';
import { renderAfter } from './engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { deck, theme, themePath } = loadDeck(path.join(here, 'deck.yaml'));
const themeDir = path.dirname(themePath);

function emit(dir, html, assets) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  for (const [absFrom, rel] of assets) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(absFrom, dest);
  }
}

// before — 現行レンダラ
const before = renderDeck(deck, theme, { deckDir: here, themeDir });
emit(path.join(here, 'out/before'), before.pages['index.html'], before.assets);

// after — measure/compose 試作。ブランドアセットは同じものを流用する
const afterAssets = new Map();
const b = theme.theme.brand;
if (b?.backgrounds?.content) {
  afterAssets.set(path.resolve(themeDir, b.backgrounds.content.src),
    `theme-assets/${path.basename(b.backgrounds.content.src)}`);
}
if (b?.logo) {
  afterAssets.set(path.resolve(themeDir, b.logo.src), `theme-assets/${path.basename(b.logo.src)}`);
}
emit(path.join(here, 'out/after'), renderAfter(deck, theme), afterAssets);

process.stdout.write('built out/before/index.html and out/after/index.html\n');
