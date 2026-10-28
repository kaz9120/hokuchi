// generate.mjs — Antigravity CLI (agy) の image-generator で 1 枚生成する
//
// agy は保存先の指定を聞かず、~/.gemini/antigravity-cli/brain/<会話 ID>/ に画像を置く。
// 応答に出たパスを拾い、拾えなければ起動後に増えた画像の中で最も新しいものを取る。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BRAIN = path.join(os.homedir(), '.gemini/antigravity-cli/brain');
const IMAGE = /\.(jpe?g|png|webp)$/i;

function newestSince(dir, since) {
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(dir, d.name))) {
      if (!IMAGE.test(f)) continue;
      const p = path.join(dir, d.name, f);
      const t = fs.statSync(p).mtimeMs;
      if (t >= since && (!best || t > best.t)) best = { p, t };
    }
  }
  return best?.p ?? null;
}

export function generate(prompt, output, { timeout = 300 } = {}) {
  const since = Date.now();
  const message = [
    'Use the image-generator subagent to generate exactly one square 1:1 image.',
    'Pass the prompt between the markers to it verbatim.',
    'Do not run any shell commands. Reply with only the absolute path of the saved image.',
    '<<<PROMPT',
    prompt,
    'PROMPT>>>',
  ].join('\n');
  const r = spawnSync('agy', ['-p', message, '--mode', 'accept-edits', '--print-timeout', `${timeout}s`], {
    encoding: 'utf8',
    timeout: (timeout + 60) * 1000,
  });
  if (r.error) throw new Error(`agy を起動できない: ${r.error.message}`);
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  if (/RESOURCE_EXHAUSTED|\b429\b/.test(text)) throw new Error('生成の上限に当たった (429 RESOURCE_EXHAUSTED)。時間をおいて試す');
  const said = [...text.matchAll(/(\/[^\s)\]`'"]+\.(?:jpe?g|png|webp))/gi)].map((m) => m[1]).find((p) => fs.existsSync(p));
  const found = said ?? newestSince(BRAIN, since);
  if (!found) throw new Error(`画像が保存されなかった。agy の応答:\n${text.trim().slice(-800)}`);
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.copyFileSync(found, output);
  return found;
}
