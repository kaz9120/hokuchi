#!/usr/bin/env node
// cli.mjs — hokuchi presentation CLI: lint / render / shot / serve.
//
//   node cli.mjs lint   <deck.yaml>
//   node cli.mjs render <deck.yaml> -o <outdir>
//   node cli.mjs shot   <outdir>
//   node cli.mjs serve  <outdir> [-p port]

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
  node cli.mjs lint   <deck.yaml>
  node cli.mjs render <deck.yaml> -o <outdir>
  node cli.mjs shot   <outdir>
  node cli.mjs serve  <outdir> [-p port]   # アノテーション付きプレビュー (ADR-0011)
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
function cmdRender(deckPath, outDir) {
  const { deck, theme, deckPath: absDeck, themePath } = loadDeck(deckPath);
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
  const slideCount = Object.keys(pages).filter((n) => n.startsWith('slide-')).length;
  const assetNote = assets.size ? ` + ${assets.size} assets` : '';
  process.stdout.write(`rendered ${slideCount} slides -> ${outDir}/ (index.html + slide-NN.html${assetNote})\n`);
}

// ---------------------------------------------------------------------------
// shot — screenshot each slide-NN.html with installed Chrome (headless)
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
  const files = fs.readdirSync(outDir).filter((f) => /^slide-\d+\.html$/.test(f)).sort();
  if (files.length === 0) throw new Error(`no slide-NN.html found in ${outDir}/. Run render first.`);

  for (const f of files) {
    const htmlPath = path.resolve(outDir, f);
    const pngPath = htmlPath.replace(/\.html$/, '.png');
    execFileSync(chrome, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1280,720',
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ], { stdio: 'ignore' });
    process.stdout.write(`shot ${f} -> ${path.basename(pngPath)}\n`);
  }
  process.stdout.write(`captured ${files.length} PNG -> ${outDir}/\n`);
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
      if (!deckPath || !outDir) usage();
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
