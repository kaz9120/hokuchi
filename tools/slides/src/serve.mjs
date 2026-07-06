// serve.mjs — annotation feedback loop (ADR-0011).
//
// Serves a rendered outdir over HTTP, injecting two things at delivery time
// (the files on disk are never modified):
//   (a) the agentation annotation overlay (React + agentation, pre-bundled
//       once at startup with esbuild);
//   (b) nothing else — keyboard navigation is already baked into the pages.
//
// Annotations submitted from the browser land on POST /__annotations and are
// appended to <outdir>/annotations.md, where Claude (or anyone) can read them.
// The agentation dependency is isolated to the bundle entry below so the
// overlay can be swapped out without touching the server (ADR-0011 撤退ライン).

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const toolRoot = path.join(here, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

// The only file that knows agentation exists. Everything else is plain http.
const OVERLAY_ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Agentation } from 'agentation';

// SPA (ADR-0012): the deck is one document, so the slide context lives in the
// URL hash. Resolve it at send time, not load time.
function pageRef() {
  return (location.pathname.split('/').pop() || 'index.html') + location.hash;
}
function send(kind, output, annotations) {
  return fetch('/__annotations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page: pageRef(), kind, output, annotations }),
  });
}

const host = document.createElement('div');
host.id = '__agentation-host';
document.body.appendChild(host);
createRoot(host).render(React.createElement(Agentation, {
  onSubmit: (output, annotations) => { send('submit', output, annotations); },
  onCopy: (md) => { send('copy', md, null); },
}));
`;

async function buildOverlay() {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    throw new Error(
      'serve の依存が見つかりません。tools/slides で `npm install` を実行してください ' +
      '(esbuild / react / react-dom / agentation は devDependencies)。'
    );
  }
  const result = await esbuild.build({
    stdin: { contents: OVERLAY_ENTRY, resolveDir: toolRoot, loader: 'js' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

function handleAnnotationPost(req, res, annotationsPath) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      const stamp = new Date().toISOString();
      const count = Array.isArray(data.annotations) ? data.annotations.length : null;
      const head = `\n---\n\n## ${data.page || '(unknown page)'} — ${stamp}${count != null ? ` (${count} 件)` : ''}\n\n`;
      fs.appendFileSync(annotationsPath, head + (data.output || '') + '\n');
      process.stdout.write(`annotation: ${data.page}${count != null ? ` ${count} 件` : ''} -> ${annotationsPath}\n`);
      res.writeHead(204);
      res.end();
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end(String(e));
    }
  });
}

/**
 * Start the annotation server for a rendered outdir.
 * @returns {Promise<http.Server>} listening server (caller keeps the process alive)
 */
export async function serve(outDir, port = 4646) {
  const absOut = path.resolve(outDir);
  if (!fs.existsSync(path.join(absOut, 'index.html'))) {
    throw new Error(`${outDir}/ に index.html がありません。先に render を実行してください。`);
  }
  const overlay = await buildOverlay();
  const annotationsPath = path.join(absOut, 'annotations.md');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/__annotations') {
      return handleAnnotationPost(req, res, annotationsPath);
    }
    if (url.pathname === '/__agentation.js') {
      res.writeHead(200, { 'content-type': MIME['.js'] });
      return res.end(overlay);
    }

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const abs = path.resolve(absOut, '.' + rel);
    if (!abs.startsWith(absOut + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }

    const ext = path.extname(abs).toLowerCase();
    let data = fs.readFileSync(abs);
    if (ext === '.html') {
      // Inject at delivery time only — files on disk stay presentation-clean.
      data = data.toString('utf8').replace('</body>', '<script src="/__agentation.js" defer></script></body>');
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, resolve);
  });

  process.stdout.write(
    `serving ${outDir}/ -> http://localhost:${port}/\n` +
    `  ページ送り: ← → (Home/End で先頭/末尾)、g で一覧モード切替 (全スライドまとめて注釈できる)\n` +
    `  アノテーション: 右下のツールバーで要素をクリックしてメモ → Send で ${annotationsPath} に追記\n`
  );
  return server;
}
