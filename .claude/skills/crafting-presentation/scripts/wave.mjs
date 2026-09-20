#!/usr/bin/env node
// wave.mjs — デッキの粗密の波を 1 枚 1 行で並べる (references/somitsu.md 手順 5)。
//
//   node .claude/skills/crafting-presentation/scripts/wave.mjs <deck.yaml>
//
// 見るのは lint が見ないもの。1 枚ごとの合否ではなく、並びが平らかどうか。
// 秒数は notes の【N秒】から読む。可視文字数は概算で、slideument lint の
// 厳密な数え方とは一致しない (波の形が分かれば足りる)。

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const loadPath = path.resolve(here, '../../../../tools/slides/src/load.mjs');
const { loadDeck } = await import(pathToFileURL(loadPath).href);

const deckPath = process.argv[2];
if (!deckPath) {
  process.stderr.write('usage: wave.mjs <deck.yaml>\n');
  process.exit(1);
}

const len = (s) => (typeof s === 'string' ? [...s.replace(/\s/g, '')].length : 0);

function visible(slide) {
  if (slide.layout === 'profile-stage') return 0; // 参照情報。波には数えない
  let n = 0;
  for (const el of slide.elements ?? []) {
    if (el.kind === 'code') continue;
    n += len(el.text) + len(el.value) + len(el.label) + len(el.title);
    for (const it of el.items ?? []) n += len(it);
    for (const nd of el.nodes ?? []) n += len(nd.label) + len(nd.detail);
    for (const a of el.annotations ?? []) n += len(a.annotate);
    for (const side of el.sides ?? []) {
      n += len(side.label);
      for (const it of side.items ?? []) n += len(it);
    }
    for (const row of el.rows ?? []) for (const c of row) n += len(c);
  }
  return n;
}

// 実物 = 聴衆が「見る」もの。密の山の核になりうる要素。
const ARTIFACT = new Set(['image', 'code', 'post', 'chart', 'diagram', 'quote', 'table', 'video', 'link']);

const { deck } = loadDeck(deckPath);
const rows = deck.slides.map((s, i) => {
  const notes = s.notes ?? '';
  const m = notes.match(/【\s*(\d+)\s*秒】/);
  const kinds = (s.elements ?? []).map((e) => e.kind);
  const lead = kinds.filter((k) => k !== 'statement' && k !== 'bullets');
  return {
    n: i + 1,
    id: s.id,
    role: s.role,
    sec: m ? Number(m[1]) : null,
    vis: visible(s),
    notes: len(notes.replace(/【[^】]*】/g, '')),
    artifact: lead.some((k) => ARTIFACT.has(k)) && s.layout !== 'profile-stage',
    hasSupport: (s.elements ?? []).some((e) => e.slot === 'support'),
    kinds: [...new Set(kinds)].join('+'),
  };
});

const hasSec = rows.some((r) => r.sec != null);
const bar = (r) => '█'.repeat(Math.max(1, Math.round((hasSec ? r.sec ?? 0 : r.notes / 6) / 5)));

process.stdout.write(`wave ${deckPath}\n\n`);
process.stdout.write('  #  sec  vis notes  実物 support  id\n');
for (const r of rows) {
  process.stdout.write(
    `${String(r.n).padStart(3)} ${String(r.sec ?? '-').padStart(4)} ${String(r.vis).padStart(4)} ${String(r.notes).padStart(5)}   ${r.artifact ? '●' : ' '}     ${r.hasSupport ? '+' : ' '}     ${r.id.padEnd(24)} ${bar(r)}\n`
  );
}

const body = rows.filter((r) => r.role === 'content');
process.stdout.write('\n');
if (hasSec) {
  const secs = body.map((r) => r.sec).filter((x) => x != null);
  const total = rows.reduce((a, r) => a + (r.sec ?? 0), 0);
  const so = secs.filter((x) => x <= 10).length;
  const mid = secs.filter((x) => x >= 20 && x <= 40).length;
  // 山 = 1 枚で 60 秒以上、または実物スライドが連続して合計 45 秒以上
  // (同じ実物を 2〜3 枚かけて見せる形。見せる → 見る場所を指す → 意味を言う)。
  // 連なりの途中に挟まる 10 秒以下の粗 (「ここを見てください」の 1 語) は山を切らない。
  const peaks = [];
  let run = [];
  let bridge = [];
  const flush = () => {
    const sum = run.reduce((a, r) => a + (r.sec ?? 0), 0);
    if (run.filter((r) => r.artifact).length >= 2 && sum >= 45) peaks.push({ ids: run.map((r) => r.id), sec: sum, artifact: true });
    run = [];
    bridge = [];
  };
  for (const r of rows) {
    if (r.artifact) {
      run.push(...bridge, r);
      bridge = [];
    } else if (run.length && r.role === 'content' && (r.sec ?? 99) <= 10) bridge.push(r); // transition は章の切れ目なので山も切る
    else flush();
  }
  flush();
  const inRun = new Set(peaks.flatMap((p) => p.ids));
  for (const r of body) if ((r.sec ?? 0) >= 60 && !inRun.has(r.id)) peaks.push({ ids: [r.id], sec: r.sec, artifact: r.artifact });

  process.stdout.write(`  合計 ${total} 秒 (${(total / 60).toFixed(1)} 分) / content ${body.length} 枚\n`);
  process.stdout.write(`  粗 (10 秒以下) ${so} 枚 · 中間 (20〜40 秒) ${mid} 枚 · 山 ${peaks.length} つ\n`);
  for (const p of peaks) process.stdout.write(`  山: ${p.ids.join(' → ')} (${p.sec} 秒)\n`);
  if (peaks.length === 0) process.stdout.write('  → 山がない。どこにも留まっていない\n');
  if (secs.length && mid / secs.length > 0.6) process.stdout.write(`  → content の 6 割超が中間帯。平らである${peaks.length ? ' (山はあっても谷がないので、山に見えない)' : ''}\n`);
  for (const p of peaks) if (!p.artifact) process.stdout.write(`  → ${p.ids[0]}: 60 秒以上話すのに実物がない。聴衆の目が行く先を置く\n`);
} else {
  process.stdout.write('  notes に【N秒】がない。秒数を振ってから見直す (somitsu.md 手順 2)\n');
}
const withSupport = body.filter((r) => r.hasSupport).length;
if (body.length && withSupport / body.length > 0.5) {
  process.stdout.write(`  → support つきが ${withSupport}/${body.length} 枚。粗の 1 語スライドに support を付けていないか\n`);
}
