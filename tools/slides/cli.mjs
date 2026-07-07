#!/usr/bin/env node
// cli.mjs — hokuchi presentation CLI: lint / render / shot / serve.
//
//   hokuchi lint   <deck.yaml>
//   hokuchi render <deck.yaml> [-o <outdir>]   # 省略時は deck と同じ場所の out/
//   hokuchi shot   <outdir>
//   hokuchi serve  <outdir> [-p port]
//
// npm link (tools/slides で一度実行) で hokuchi コマンドとして使う。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadDeck } from './src/load.mjs';
import { lint, hasError } from './src/lint.mjs';
import { renderDeck } from './src/render.mjs';

const SEV_ORDER = { error: 0, warn: 1, info: 2 };
const SEV_LABEL = { error: 'ERROR', warn: 'WARN ', info: 'INFO ' };

function usage(code = 1) {
  process.stderr.write(`hokuchi — intent-declared slide toolkit

usage:
  hokuchi lint   <deck.yaml>
  hokuchi render <deck.yaml> [-o <outdir>]   # 省略時は deck と同じ場所の out/
  hokuchi shot   <outdir>
  hokuchi serve  <outdir> [-p port]          # アノテーション付きプレビュー (ADR-0011)
`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// lint
// ---------------------------------------------------------------------------
function cmdLint(deckPath) {
  const { deck, theme } = loadDeck(deckPath);
  const findings = lint(deck, theme).sort(
    (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.id.localeCompare(b.id)
  );

  if (findings.length === 0) {
    process.stdout.write(`lint ${deckPath}: 指摘なし (0 件)\n`);
    return;
  }

  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  process.stdout.write(`lint ${deckPath}\n`);
  for (const f of findings) {
    process.stdout.write(`  [${SEV_LABEL[f.severity]}] ${f.id.padEnd(18)} ${f.slideId}: ${f.message}\n`);
  }
  process.stdout.write(`\n  error ${counts.error} · warn ${counts.warn} · info ${counts.info}\n`);

  if (hasError(findings)) process.exit(1);
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
function cmdRender(deckPath, outDirArg) {
  const { deck, theme, deckPath: absDeck, themePath } = loadDeck(deckPath);
  const outDir = outDirArg ?? path.join(path.dirname(absDeck), 'out');
  const { pages, assets } = renderDeck(deck, theme, {
    deckDir: path.dirname(absDeck),
    themeDir: path.dirname(themePath),
  });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, html] of Object.entries(pages)) {
    fs.writeFileSync(path.join(outDir, name), html);
  }
  for (const [absFrom, rel] of assets) {
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(absFrom, dest);
  }
  const slideCount = deck.slides.length;
  // Prune per-page HTML from the pre-SPA format (ADR-0012) and stale shots
  // left over from a previous, longer render.
  let pruned = 0;
  for (const f of fs.readdirSync(outDir)) {
    const m = f.match(/^slide-(\d+)\.(html|png)$/);
    if (m && (m[2] === 'html' || Number(m[1]) > slideCount)) {
      fs.unlinkSync(path.join(outDir, f));
      pruned++;
    }
  }
  const assetNote = assets.size ? ` + ${assets.size} assets` : '';
  const pruneNote = pruned ? `, pruned ${pruned} stale` : '';
  process.stdout.write(`rendered ${slideCount} slides -> ${outDir}/index.html (single-file SPA${assetNote}${pruneNote})\n`);
}

// ---------------------------------------------------------------------------
// shot — screenshot each slide via index.html#pNN with installed Chrome
// (headless). :target selection is pure CSS, so no script timing is involved.
// ---------------------------------------------------------------------------
function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Chrome not found. Set CHROME=/path/to/chrome to override.');
}

function cmdShot(outDir) {
  const chrome = findChrome();
  const indexPath = path.resolve(outDir, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`${outDir}/ に index.html がありません。先に render を実行してください。`);
  const m = fs.readFileSync(indexPath, 'utf8').match(/data-slides="(\d+)"/);
  if (!m) throw new Error('index.html に data-slides がありません (旧形式?)。render し直してください。');
  const total = Number(m[1]);

  for (let i = 1; i <= total; i++) {
    const nn = String(i).padStart(2, '0');
    const pngPath = path.resolve(outDir, `slide-${nn}.png`);
    execFileSync(chrome, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1280,720',
      // Webfont が届く前に撮るとフォント切替中の不整合な描画 (SVG text の
      // アンカーずれ) を写してしまう。仮想時間でネットワーク静止まで待つ。
      // 10000 では Google Fonts の遅い回で取りこぼしたため 20000 (2026-07-08)。
      '--virtual-time-budget=20000',
      `--screenshot=${pngPath}`,
      `file://${indexPath}#p${nn}`,
    ], { stdio: 'ignore' });
    process.stdout.write(`shot #p${nn} -> slide-${nn}.png\n`);
  }
  process.stdout.write(`captured ${total} PNG -> ${outDir}/\n`);
}

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------
async function main(argv) {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === 'lint') {
      if (!rest[0]) usage();
      cmdLint(rest[0]);
    } else if (cmd === 'render') {
      const { deckPath, outDir } = parseRenderArgs(rest);
      if (!deckPath) usage();
      cmdRender(deckPath, outDir);
    } else if (cmd === 'shot') {
      if (!rest[0]) usage();
      cmdShot(rest[0]);
    } else if (cmd === 'serve') {
      const { outDir, port } = parseServeArgs(rest);
      if (!outDir) usage();
      const { serve } = await import('./src/serve.mjs');
      await serve(outDir, port);
    } else {
      usage();
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}

/** Parse `<outdir> [-p port]`. */
function parseServeArgs(rest) {
  let outDir = null, port = 4646;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '-p' || a === '--port') port = Number(rest[++i]);
    else if (!a.startsWith('-')) outDir = a;
  }
  return { outDir, port };
}

/** Parse `<deck.yaml> -o <outdir>` in any order. */
function parseRenderArgs(rest) {
  let deckPath = null, outDir = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '-o' || a === '--out') outDir = rest[++i];
    else if (!a.startsWith('-')) deckPath = a;
  }
  return { deckPath, outDir };
}

main(process.argv.slice(2));
