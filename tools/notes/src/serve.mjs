// serve.mjs — 原稿のフィードバックループ (ADR-0022)。
//
// 原稿 (drafts/<slug>/index.md) を note 風に描画してブラウザで見せる。読み手は
// 文を選んでコメントを付け、送ると <原稿dir>/feedback.md に追記される。Claude は
// それを読んで原稿を直し、反映した節を消す。ファイルが変われば画面も追従する。
// 依存はゼロ。描画は render.mjs、検査は lint.mjs、貼り付け用の本文は paste.mjs。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitFrontMatter, lintDraft, draftStats } from './lint.mjs';
import { renderBody } from './render.mjs';
import { toPasteText } from './paste.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FEEDBACK = 'feedback.md';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------------------
// feedback.md — 往復の受け渡し口。記録ではないので、反映したら節を消してよい
// ---------------------------------------------------------------------------
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** コメント 1 件を feedback.md に追記する。 */
export function appendFeedback(file, { quote = '', block = null, heading = '', comment = '' }) {
  const text = comment.trim();
  if (!text) throw new Error('コメントが空');
  const where = [
    block !== null && block !== undefined && block !== '' ? `段落 ${block}` : '全体',
    heading ? `見出し「${heading}」` : '',
  ].filter(Boolean).join(' / ');
  const q = quote.trim() ? `${quote.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n\n` : '';
  fs.appendFileSync(file, `## ${stamp()} — ${where}\n\n${q}${text}\n\n`);
}

/** feedback.md を節ごとに読む。 */
export function readFeedback(file) {
  if (!fs.existsSync(file)) return [];
  const md = fs.readFileSync(file, 'utf8');
  return md.split(/^(?=## )/m).filter((s) => s.trim()).map((section) => {
    const [head, ...rest] = section.split('\n');
    const m = head.match(/^## (.+?) — (.+)$/);
    const body = rest.join('\n').trim();
    const quoteLines = body.split('\n').filter((l) => l.startsWith('> '));
    const quote = quoteLines.map((l) => l.slice(2)).join('\n');
    const comment = body.split('\n').filter((l) => !l.startsWith('> ')).join('\n').trim();
    return { stamp: m?.[1] ?? '', where: m?.[2] ?? '', quote, comment };
  });
}

// ---------------------------------------------------------------------------
// 画面に渡す状態
// ---------------------------------------------------------------------------
/** 原稿 1 本の、画面が必要とするものをまとめて返す。 */
export function draftState(draftPath) {
  const md = fs.readFileSync(draftPath, 'utf8');
  const { fm, body } = splitFrontMatter(md);
  const title = fm?.match(/^title: (.+)$/m)?.[1]?.replace(/^"(.*)"$/, '$1') ?? path.basename(path.dirname(draftPath));
  const tags = fm ? [...fm.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) : [];
  const { html, blocks } = renderBody(body);
  const { images, eyecatch } = toPasteText(md);
  return {
    title,
    tags,
    path: (() => { const rel = path.relative(process.cwd(), draftPath); return rel.startsWith('..') ? draftPath : rel; })(),
    eyecatch,
    html,
    blocks,
    stats: draftStats(md),
    lint: lintDraft(md),
    images,
    feedback: readFeedback(path.join(path.dirname(draftPath), FEEDBACK)),
    mtime: fs.statSync(draftPath).mtimeMs,
  };
}

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

/** 引数 (ディレクトリか index.md) から原稿のパスを決める。 */
export function resolveDraft(target) {
  const abs = path.resolve(target);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return path.join(abs, 'index.md');
  return abs;
}

/**
 * 原稿のフィードバックサーバを立てる。
 * @returns {Promise<http.Server>} listening server (呼び出し側がプロセスを生かす)
 */
export async function serve(target, port = 4647) {
  const draftPath = resolveDraft(target);
  if (!fs.existsSync(draftPath)) throw new Error(`原稿がありません: ${draftPath}`);
  const draftDir = path.dirname(draftPath);
  const feedbackPath = path.join(draftDir, FEEDBACK);
  const pagePath = path.join(here, 'serve.html');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(fs.readFileSync(pagePath));
      }
      if (url.pathname === '/__draft') return json(res, 200, draftState(draftPath));
      if (url.pathname === '/__paste') {
        const { text } = toPasteText(fs.readFileSync(draftPath, 'utf8'));
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(text);
      }
      if (req.method === 'POST' && url.pathname === '/__feedback') {
        const data = JSON.parse((await readBody(req)) || '{}');
        appendFeedback(feedbackPath, data);
        process.stdout.write(`feedback: ${data.block != null && data.block !== '' ? `段落 ${data.block}` : '全体'} -> ${feedbackPath}\n`);
        return json(res, 200, { ok: true, count: readFeedback(feedbackPath).length });
      }
      if (req.method === 'POST' && url.pathname === '/__clear') {
        fs.writeFileSync(feedbackPath, '');
        process.stdout.write(`feedback: 空にしました -> ${feedbackPath}\n`);
        return json(res, 200, { ok: true, count: 0 });
      }
      if (req.method === 'POST' && url.pathname === '/__open') {
        const assets = path.join(draftDir, 'assets');
        const dir = fs.existsSync(assets) ? assets : draftDir;
        if (process.platform === 'darwin') spawnSync('open', [dir]);
        return json(res, 200, { ok: true, dir });
      }
      // 原稿ディレクトリの画像 (assets/…)
      const rel = decodeURIComponent(url.pathname);
      const abs = path.resolve(draftDir, `.${rel}`);
      const ext = path.extname(abs).toLowerCase();
      if (abs.startsWith(draftDir + path.sep) && MIME[ext] && fs.existsSync(abs)) {
        res.writeHead(200, { 'content-type': MIME[ext] });
        return res.end(fs.readFileSync(abs));
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      json(res, 400, { error: String(e.message ?? e) });
    }
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, resolve);
  });
  return server;
}
