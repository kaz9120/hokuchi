// build.mjs — 記事ごとのディレクトリの eyecatch.json から、下地をまとめて作る
//
//   <dir>/eyecatch.json  場面・季節の光・置き場所 (人か Claude が書く)
//   <dir>/motif.jpg      生成した画像。無ければ generate で作る
//   <dir>/eyecatch.jpg   1280×670 の下地。motif.jpg か eyecatch.json より古ければ作り直す
//
// 作り直したいモチーフは motif.jpg を消してから回す。

import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt } from './prompt.mjs';
import { generate } from './generate.mjs';
import { place } from './place.mjs';
import { parsePosition, INK } from './paper.mjs';

export class QuotaError extends Error {}

const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);

export function readPlan(dir) {
  const file = path.join(dir, 'eyecatch.json');
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of ['scene', 'light', 'at']) {
    if (!plan[k]) throw new Error(`${file}: ${k} が無い`);
  }
  parsePosition(plan.at);
  return plan;
}

/** 1 つのディレクトリを作る。したことを 'generated' / 'placed' / 'fresh' で返す */
export async function buildOne(dir, log = () => {}) {
  const plan = readPlan(dir);
  const motif = path.join(dir, 'motif.jpg');
  const out = path.join(dir, 'eyecatch.jpg');
  const did = [];
  if (!fs.existsSync(motif)) {
    try {
      generate(buildPrompt(plan), motif);
    } catch (e) {
      if (/上限/.test(e.message)) throw new QuotaError(e.message);
      throw e;
    }
    did.push('generated');
    log(`生成した: ${motif}`);
  }
  if (mtime(out) < Math.max(mtime(motif), mtime(path.join(dir, 'eyecatch.json')))) {
    await place(motif, out, { at: parsePosition(plan.at), ink: plan.ink ?? INK });
    did.push('placed');
    log(`置いた: ${out} (${plan.at})`);
  }
  return did.length ? did : ['fresh'];
}
