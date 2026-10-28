#!/usr/bin/env node
// cli.mjs — note の見出し画像の下地を作る: prompt / generate / place / sheet
//
//   hokuchi-eyecatch prompt   --scene <場面> --light <季節の光>              プロンプトを出す
//   hokuchi-eyecatch generate --scene <場面> --light <季節の光> --out <画像>  agy の nano banana で生成する
//   hokuchi-eyecatch place    <生成画像> <出力> --at <置き場所> [--ink <量>]  モチーフを台紙に置き直す
//   hokuchi-eyecatch sheet    <出力> <画像>...                               3 列に並べた見本を作る
//
// ルートの package.json から bun run eyecatch <サブコマンド> で使う。モチーフの選び方は
// .claude/skills/writing-note/references/eyecatch.md にある (ADR-0051)。

import { buildPrompt } from './src/prompt.mjs';
import { generate } from './src/generate.mjs';
import { place } from './src/place.mjs';
import { sheet } from './src/sheet.mjs';
import { POSITIONS, INK, parsePosition } from './src/paper.mjs';

const out = (s) => process.stdout.write(`${s}\n`);

function usage(code = 1) {
  process.stderr.write(`hokuchi-eyecatch — note の見出し画像の下地を作る

usage:
  hokuchi-eyecatch prompt   --scene <場面> --light <季節の光>
  hokuchi-eyecatch generate --scene <場面> --light <季節の光> --out <画像>
  hokuchi-eyecatch place    <生成画像> <出力> --at <置き場所> [--ink <量>]
  hokuchi-eyecatch sheet    <出力.png> <画像>...

  置き場所: ${Object.keys(POSITIONS).join(' / ')}、または x,y (左上 0、右下 1)
  量: モチーフのインクの量。画面の面積に対する割合 (既定 ${INK})
  出力は 1280×670。拡張子が .png なら PNG、それ以外は JPEG
`);
  process.exit(code);
}

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) usage();
      flags[a.slice(2)] = v;
      i++;
    } else rest.push(a);
  }
  return { flags, rest };
}

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  switch (cmd) {
    case 'prompt':
      out(buildPrompt(flags));
      break;
    case 'generate': {
      if (!flags.out) usage();
      const from = generate(buildPrompt(flags), flags.out);
      out(`${flags.out} (元: ${from})`);
      break;
    }
    case 'place': {
      if (rest.length !== 2 || !flags.at) usage();
      const r = await place(rest[0], rest[1], { at: parsePosition(flags.at), ink: flags.ink ? Number(flags.ink) : INK });
      out(`${rest[1]} 中心 ${r.center.map((v) => v.toFixed(2)).join(',')} 大きさ ${r.size.join('×')}`);
      break;
    }
    case 'sheet':
      if (rest.length < 2) usage();
      await sheet(rest.slice(1), rest[0]);
      out(rest[0]);
      break;
    default:
      usage(cmd === undefined || cmd === '--help' || cmd === '-h' ? 0 : 1);
  }
}

main().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
