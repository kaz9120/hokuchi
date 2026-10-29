// check.mjs — npm test. Plain assert-based checks, no framework.
//
// (1) 置き場所の名前と x,y を読める。読めないものは止める
// (2) プロンプトに場面と季節の光が入り、空なら止める
// (3) place: 出力は 1280×670 で、モチーフは指定の位置に来る
// (4) place: 紙の色は生成画像の紙に関わらず台紙の色に揃い、枠線は消える。
//     四隅の紙のムラの点に引っぱられず、モチーフは指定の位置に来る。太く長いモチーフは消さない
//     紙を白い地に置いた絵でも、紙の外を切り落として同じように置ける
// (5) sheet: 3 列で並ぶ
// (6) build: eyecatch.json から、要るものだけを作る

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { parsePosition, PAPER, WIDTH, HEIGHT } from '../src/paper.mjs';
import { buildPrompt } from '../src/prompt.mjs';
import { place } from '../src/place.mjs';
import { sheet } from '../src/sheet.mjs';
import { buildOne, readPlan } from '../src/build.mjs';

let passed = 0;
const ok = (name) => { console.log(`  ok  ${name}`); passed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eyecatch-'));

// (1)
assert.deepEqual(parsePosition('upper-left'), [0.28, 0.36]);
assert.deepEqual(parsePosition('0.3,0.7'), [0.3, 0.7]);
assert.throws(() => parsePosition('somewhere'));
assert.throws(() => parsePosition('1.5,0.2'));
ok('置き場所を読む');

// (2)
const p = buildPrompt({ scene: 'A bench under a tree.', light: 'Early summer.' });
assert.match(p, /A bench under a tree\./);
assert.match(p, /Early summer\./);
assert.doesNotMatch(p, /\{SCENE\}|\{LIGHT\}/);
assert.throws(() => buildPrompt({ scene: ' ', light: 'x' }));
ok('プロンプトを組み立てる');

// 生成画像の代わり: 明るめの紙に、枠線と、中央の白い四角と橙の点
async function fakeGenerated(file, paper) {
  const s = 1024;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="100%" height="100%" fill="rgb(${paper.join(',')})"/>
    <rect x="50" y="50" width="${s - 100}" height="${s - 100}" fill="none" stroke="#d8d0c0" stroke-width="3"/>
    <rect x="380" y="400" width="260" height="200" fill="none" stroke="#ebe5d8" stroke-width="6"/>
    <circle cx="512" cy="500" r="30" fill="#f47d3a"/>
    <rect x="330" y="200" width="40" height="600" fill="#7c8590"/><rect x="654" y="200" width="40" height="600" fill="#7c8590"/>
    <g fill="rgb(${paper.map((v) => v + 18).join(',')})">
      <circle cx="90" cy="90" r="6"/><circle cx="930" cy="110" r="6"/><circle cx="100" cy="930" r="6"/><circle cx="920" cy="920" r="6"/>
    </g>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(file);
}

async function rgb(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// (3)(4)
const src = path.join(tmp, 'gen.jpg');
await fakeGenerated(src, [66, 58, 50]);
const dst = path.join(tmp, 'placed.jpg');
await place(src, dst, { at: [0.26, 0.64] });
const img = await rgb(dst);
assert.equal(img.w, WIDTH);
assert.equal(img.h, HEIGHT);

// 橙の点の重心で位置を見る
let sx = 0, sy = 0, n = 0;
for (let y = 0; y < img.h; y++) {
  for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 3;
    if (img.data[i] > 180 && img.data[i + 2] < 120) { sx += x; sy += y; n++; }
  }
}
assert.ok(n > 0, '橙の点が残る');
assert.ok(Math.abs(sx / n / WIDTH - 0.26) < 0.04, `x が 0.26 付近 (${(sx / n / WIDTH).toFixed(3)})`);
assert.ok(Math.abs(sy / n / HEIGHT - 0.64) < 0.04, `y が 0.64 付近 (${(sy / n / HEIGHT).toFixed(3)})`);
ok('モチーフを指定の位置に置く');

// 右上の隅 (モチーフから遠い) は台紙の色で、枠線は残らない
let far = [0, 0, 0], fn = 0, bright = 0;
for (let y = 10; y < 200; y++) {
  for (let x = WIDTH - 400; x < WIDTH - 10; x++) {
    const i = (y * img.w + x) * 3;
    for (let c = 0; c < 3; c++) far[c] += img.data[i + c];
    fn++;
    if (img.data[i] > 120) bright++;
  }
}
far = far.map((v) => v / fn);
far.forEach((v, c) => assert.ok(Math.abs(v - PAPER[c]) < 3, `紙の色が台紙に揃う (${far.map(Math.round)})`));
assert.equal(bright, 0, '枠線が残らない');
// 縦に長い太い柱 (モチーフの一部) は枠線とみなさず残る
let pillar = 0;
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
  const i = (y * img.w + x) * 3;
  if (img.data[i + 2] > img.data[i] + 6 && img.data[i + 2] > 90) pillar++;
}
assert.ok(pillar > 300, `太い柱が残る (${pillar})`);
ok('紙の色を揃え、枠線を消す');

// 紙を白い地に置いた絵: 白い地を紙の色と測らずに置ける
const mat = path.join(tmp, 'mat.jpg');
await sharp(src).extend({ top: 60, bottom: 60, left: 60, right: 60, background: '#fafafa' }).jpeg({ quality: 95 }).toFile(mat);
const matOut = path.join(tmp, 'mat-placed.jpg');
const r = await place(mat, matOut, { at: [0.74, 0.34] });
r.paper.forEach((v) => assert.ok(v < 100, `紙の色を白い地から測らない (${r.paper})`));
assert.ok(Math.abs(r.center[0] - 0.74) < 0.02 && Math.abs(r.center[1] - 0.34) < 0.04, `指定の位置 (${r.center})`);
ok('白い地の上の紙を切り出す');

// (6) build: motif.jpg があれば生成せずに置き、新しければ作り直さない。計画が欠けていれば止める
const dir = path.join(tmp, 'article');
fs.mkdirSync(dir);
fs.copyFileSync(src, path.join(dir, 'motif.jpg'));
fs.writeFileSync(path.join(dir, 'eyecatch.json'), JSON.stringify({ scene: 's', light: 'l', at: 'upper-right' }));
assert.deepEqual(await buildOne(dir), ['placed']);
assert.ok(fs.existsSync(path.join(dir, 'eyecatch.jpg')));
assert.deepEqual(await buildOne(dir), ['fresh']);
fs.writeFileSync(path.join(dir, 'eyecatch.json'), JSON.stringify({ scene: 's', at: 'upper-right' }));
assert.throws(() => readPlan(dir), /light/);
fs.writeFileSync(path.join(dir, 'eyecatch.json'), JSON.stringify({ scene: 's', light: 'l', at: 'middle' }));
assert.throws(() => readPlan(dir), /置き場所/);
ok('eyecatch.json から作る');

// (5)
const out = path.join(tmp, 'sheet.png');
await sheet([dst, dst, dst, dst], out);
const meta = await sharp(out).metadata();
assert.equal(meta.width, 3 * 640 + 4 * 24);
assert.equal(meta.height, 2 * 335 + 3 * 24);
ok('3 列に並べる');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
