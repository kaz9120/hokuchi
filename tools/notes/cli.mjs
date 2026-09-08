#!/usr/bin/env node
// cli.mjs — hokuchi note importer: sync / build / verify / index
//
//   hokuchi-note sync    [--user <urlname>] [--only <key>]  note から取り込む
//   hokuchi-note build   [<記事ディレクトリ>...]             source.json から index.md を作り直す
//   hokuchi-note verify  [<記事ディレクトリ>...]             取り込みの忠実さを検査する
//   hokuchi-note index                                      articles/note/README.md を作り直す
//   hokuchi-note lint    [<原稿.md>...]                      原稿の文体を検査する
//   hokuchi-note paste   <原稿.md> [--stdout]                原稿を note に貼れる形でクリップボードへ
//   hokuchi-note serve   <原稿dir|index.md> [--port <n>]     原稿をブラウザで見せ、フィードバックを受ける
//
// npm link (tools/notes で一度実行) で hokuchi-note コマンドとして使う。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listNotes, fetchNote, freezeNote } from './src/api.mjs';
import { downloadImage, downloadEyecatch } from './src/assets.mjs';
import { buildArticle, articleIndex, listArticleDirs, readSource, SOURCE, INDEX } from './src/build.mjs';
import { lintDraft, draftStats } from './src/lint.mjs';
import { verifyArticle } from './src/verify.mjs';
import { toPasteText } from './src/paste.mjs';
import { serve, resolveDraft, FEEDBACK } from './src/serve.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_ROOT = path.join(REPO_ROOT, 'articles/note');
const DEFAULT_USER = 'kyamamoto9120';
const SLUGS = 'slugs.json';

const out = (s) => process.stdout.write(`${s}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function usage(code = 1) {
  process.stderr.write(`hokuchi-note — note.com の記事を原本 + Markdown でアーカイブする

usage:
  hokuchi-note sync   [--user <urlname>] [--only <key>] [--root <dir>]
  hokuchi-note build  [<記事ディレクトリ>...]
  hokuchi-note verify [<記事ディレクトリ>...]
  hokuchi-note lint   [<原稿.md>...]        note の原稿を文体で検査する
  hokuchi-note paste  <原稿.md> [--stdout]  原稿を note に貼れる形でクリップボードに入れる
  hokuchi-note serve  <原稿dir|index.md> [--port <n>]  原稿をブラウザで見せ、コメントを feedback.md に受ける
  hokuchi-note index  [--root <dir>]
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { root: DEFAULT_ROOT, user: DEFAULT_USER, only: null, stdout: false, port: 4647, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = path.resolve(argv[++i]);
    else if (a === '--user') opts.user = argv[++i];
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--stdout') opts.stdout = true;
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a.startsWith('-')) usage();
    else opts.rest.push(a);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// ディレクトリ名 — slugs.json が唯一の真実
// ---------------------------------------------------------------------------
// note の slug (slug-n939ade...) は人が読めないので、ディレクトリ名は
// <公開日>-<手で付けた slug> にする。対応は slugs.json に持ち、記事の同一性は
// 常に note key で追う。slug を書き換えれば sync がディレクトリを引っ越す。
const loadSlugs = (root) => {
  const p = path.join(root, SLUGS);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
};

const dirNameFor = (key, publishAt, slugs) =>
  `${publishAt.slice(0, 10)}-${slugs[key] ?? key}`;

/** 既存の記事ディレクトリを key で引けるようにする。 */
function existingDirs(root) {
  const byKey = new Map();
  for (const dir of listArticleDirs(root)) byKey.set(readSource(dir).key, dir);
  return byKey;
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------
async function cmdSync(opts) {
  fs.mkdirSync(opts.root, { recursive: true });
  const slugs = loadSlugs(opts.root);
  const known = existingDirs(opts.root);

  out(`note から一覧を取得中 (@${opts.user})…`);
  let items = await listNotes(opts.user);
  if (opts.only) items = items.filter((i) => i.key === opts.only);
  out(`公開記事 ${items.length} 本`);

  const missingSlugs = [];
  for (const item of items) {
    const dir = path.join(opts.root, dirNameFor(item.key, item.publishAt, slugs));
    if (!slugs[item.key]) missingSlugs.push(item);

    // slug を変えた・新規に付けた場合はディレクトリごと引っ越す
    const prev = known.get(item.key);
    if (prev && path.resolve(prev) !== path.resolve(dir)) {
      fs.renameSync(prev, dir);
      out(`  移動 ${path.basename(prev)} → ${path.basename(dir)}`);
    }
    fs.mkdirSync(dir, { recursive: true });

    await sleep(800); // 個人のアーカイブ用途なので note に負荷をかけない速度で回す
    const raw = await fetchNote(item.key);
    const frozen = freezeNote(raw);

    // 内容が変わっていなければ書き換えない (取得時刻だけの差分を出さない)
    const sourcePath = path.join(dir, SOURCE);
    if (fs.existsSync(sourcePath)) {
      const before = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
      const same = JSON.stringify({ ...before, _fetched_at: null }) ===
        JSON.stringify({ ...frozen, _fetched_at: null });
      if (same) frozen._fetched_at = before._fetched_at;
    }
    fs.writeFileSync(sourcePath, `${JSON.stringify(frozen, null, 2)}\n`);

    // 画像を落とす
    const assetsDir = path.join(dir, 'assets');
    let images = 0;
    if (frozen.eyecatch) {
      await downloadEyecatch(frozen.eyecatch, assetsDir);
      images++;
    }
    for (const m of frozen.body.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)) {
      await downloadImage(m[1].replace(/&amp;/g, '&'), assetsDir);
      images++;
    }
    out(`  ${path.basename(dir)}  画像 ${images}`);
  }

  if (missingSlugs.length) {
    out(`\nslug 未設定が ${missingSlugs.length} 本あります。${SLUGS} に追記して sync し直すと引っ越します:`);
    for (const i of missingSlugs) out(`  "${i.key}": "",   // ${i.name}`);
  }

  out('\nindex.md を生成中…');
  cmdBuild({ ...opts, rest: [] });
  out('検査中…');
  const ok = cmdVerify({ ...opts, rest: [] });
  cmdIndex(opts);
  return ok;
}

// ---------------------------------------------------------------------------
// build / verify / index
// ---------------------------------------------------------------------------
const targetDirs = (opts) =>
  opts.rest.length ? opts.rest.map((p) => path.resolve(p)) : listArticleDirs(opts.root);

function cmdBuild(opts) {
  const index = articleIndex(opts.root);
  const dirs = targetDirs(opts);
  for (const dir of dirs) buildArticle(dir, index);
  out(`build: ${dirs.length} 本の index.md を生成`);
}

function cmdVerify(opts) {
  const dirs = targetDirs(opts);
  let errors = 0;
  let warnings = 0;
  for (const dir of dirs) {
    const r = verifyArticle(dir);
    if (r.errors.length === 0 && r.warnings.length === 0) continue;
    out(`${path.basename(dir)}`);
    for (const e of r.errors) out(`  [ERROR] ${e}`);
    for (const w of r.warnings) out(`  [WARN ] ${w}`);
    errors += r.errors.length;
    warnings += r.warnings.length;
  }
  out(`verify: ${dirs.length} 本 · error ${errors} · warn ${warnings}`);
  return errors === 0;
}

// 原稿の文体検査。公開済み記事に回すと、閾値が自分の水準に合っているかを
// 確かめられる (校正用)。
function cmdLint(opts) {
  const files = opts.rest.length
    ? opts.rest.map((p) => path.resolve(p))
    : listArticleDirs(opts.root).map((d) => path.join(d, INDEX));
  const SEV_ORDER = { error: 0, warn: 1, info: 2 };
  const SEV_LABEL = { error: 'ERROR', warn: 'WARN ', info: 'INFO ' };
  const total = { error: 0, warn: 0, info: 0 };

  for (const file of files) {
    const md = fs.readFileSync(file, 'utf8');
    const findings = lintDraft(md).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    for (const f of findings) total[f.severity]++;
    if (findings.length === 0) {
      if (files.length === 1) out(`lint ${path.basename(file)}: 指摘なし`);
      continue;
    }
    const s = draftStats(md);
    out(`${files.length === 1 ? file : path.basename(path.dirname(file))}  (${s.chars}字 / ${s.paragraphs}段落 / 文の中央値 ${s.medianSentence}字)`);
    for (const f of findings) out(`  [${SEV_LABEL[f.severity]}] ${f.id.padEnd(20)} ${f.message}`);
  }
  out(`lint: ${files.length} 本 · error ${total.error} · warn ${total.warn} · info ${total.info}`);
  return total.error === 0;
}

// 原稿を note のエディタに貼れる形にしてクリップボードへ。画像は note 側で
// 入れるしかないので、番号付きの一覧を出し、assets/ を Finder で開く。
function cmdPaste(opts) {
  if (opts.rest.length !== 1) usage();
  const file = path.resolve(opts.rest[0]);
  const { text, images, eyecatch } = toPasteText(fs.readFileSync(file, 'utf8'));

  if (opts.stdout) {
    process.stdout.write(text);
    return true;
  }
  const copied = spawnSync('pbcopy', { input: text }).status === 0;
  out(copied ? `paste: ${path.basename(path.dirname(file))} の本文をクリップボードに入れました` :
    'paste: pbcopy が使えません。--stdout で出力してください');

  if (eyecatch) out(`  見出し画像: ${eyecatch}`);
  for (const img of images) {
    const extra = [img.caption && `キャプション: ${img.caption}`, img.link && `リンク: ${img.link}`].filter(Boolean);
    out(`  画像 ${img.n}/${images.length}: ${img.file}${extra.length ? `  (${extra.join(' / ')})` : ''}`);
  }
  if (images.length || eyecatch) {
    const assetsDir = path.join(path.dirname(file), 'assets');
    if (fs.existsSync(assetsDir) && process.platform === 'darwin') spawnSync('open', [assetsDir]);
    out('  本文の「（画像 n/N: …）」の行を消して、その位置に画像を入れてください');
  }
  return copied;
}

// 原稿をブラウザで見せ、文を選んだコメントを feedback.md に受ける (ADR-0022)。
// Claude は feedback.md を読んで原稿を直し、反映した節を消す。
async function cmdServe(opts) {
  if (opts.rest.length !== 1) usage();
  const draft = resolveDraft(opts.rest[0]);
  await serve(draft, opts.port);
  out(
    `serving ${path.relative(process.cwd(), draft)} -> http://localhost:${opts.port}/\n` +
    `  文を選ぶと入力欄が出る。Enter で ${path.join(path.dirname(draft), FEEDBACK)} に追記\n` +
    `  「ターミナルに貼る」で未反映のフィードバックがクリップボードに入る。原稿を書き換えると画面が追従する\n` +
    `  止めるときは Ctrl-C (このプロセスが生きている間だけ画面が動く)`
  );
  if (process.platform === 'darwin') spawnSync('open', [`http://localhost:${opts.port}/`]);
}

function cmdIndex(opts) {
  const dirs = listArticleDirs(opts.root).reverse(); // 新しい順
  const rows = dirs.map((dir) => {
    const src = readSource(dir);
    return `| ${src.publish_at.slice(0, 10)} | [${src.name}](${path.basename(dir)}/) | [note](${src.note_url}) |`;
  });
  const md = `# note の記事アーカイブ

[note.com/${opts.user}](https://note.com/${opts.user}) で公開した記事を、原本 (\`source.json\`) と
読む用の Markdown (\`index.md\`) の 2 層でアーカイブしています。取り込みと検査は
\`tools/notes\` の \`hokuchi-note\` が行います。詳しくは [ADR-0019](../../docs/adr/0019-note-archive-two-layer.md)。

全 ${dirs.length} 本。

| 公開日 | タイトル | 原文 |
|---|---|---|
${rows.join('\n')}
`;
  fs.writeFileSync(path.join(opts.root, 'README.md'), md);
  out(`index: ${dirs.length} 本の索引を生成`);
}

// ---------------------------------------------------------------------------
const [cmd, ...argv] = process.argv.slice(2);
const opts = parseArgs(argv);
switch (cmd) {
  case 'sync': process.exit((await cmdSync(opts)) ? 0 : 1); break;
  case 'build': cmdBuild(opts); break;
  case 'verify': process.exit(cmdVerify(opts) ? 0 : 1); break;
  case 'lint': process.exit(cmdLint(opts) ? 0 : 1); break;
  case 'paste': process.exit(cmdPaste(opts) ? 0 : 1); break;
  case 'serve': await cmdServe(opts); break;
  case 'index': cmdIndex(opts); break;
  default: usage();
}
