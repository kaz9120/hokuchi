#!/usr/bin/env node
// hokuchi stage の CLI。トーク 1 本を扱う (サイト全体の組み立ては apps/slides)
//
//   bun run dev <talk>              作業用のサーバ。保存すると即座に反映される
//   bun run check <talk> [--motion] 全状態の静止画と、はみ出し・重なり・小さい文字の検査、絵コンテとの照合 (out/check.md)
//                                 --motion で遷移のコマ撮りも出す (out/motion/)
//   bun run build <talk>          公開用の静的ファイルを out/build/ に出す (OGP 画像・同梱フォントつき)
//
// <talk> はトークのディレクトリ (talk.tsx を持つ)。リポジトリの外にあってもよい。talks/ の中なら名前の先頭だけでもよい
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { check } from './node/check.mjs'
import { buildTalk } from './node/build.mjs'
import { isTalkDir, startServer } from './node/talk.mjs'

const [cmd, arg, ...flags] = process.argv.slice(2)

// トークのディレクトリ。パスのほか、talks/ の中のディレクトリ名の先頭 (例: 2026_09_29) でも指定できる
function talkDirOf(a) {
  if (!a) fail('トークを指定してください (例: talks/2026_09_29_DevsGarden_… か、先頭の 2026_09_29)')
  const dir = resolve(process.cwd(), a)
  if (existsSync(dir)) {
    if (!isTalkDir(dir)) fail(`${dir}/talk.tsx がありません`)
    return dir
  }
  const talks = join(import.meta.dirname, '../../talks')
  const hits = readdirSync(talks).filter((n) => n.startsWith(a) && isTalkDir(join(talks, n)))
  if (hits.length !== 1) fail(hits.length ? `「${a}」に当たるトークが複数あります: ${hits.join(', ')}` : `「${a}」に当たるトークがありません`)
  return join(talks, hits[0])
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

switch (cmd) {
  case 'dev': {
    const dir = talkDirOf(arg)
    const { url } = await startServer(dir, 5280)
    console.log(`\n  ${basename(dir)}\n`)
    console.log(`  ライブ         ${url}`)
    console.log(`  発表者ビュー   ${url}?presenter  (ライブで p キーでも開く)`)
    console.log(`  全状態の静止画 ${url}?shot=all`)
    console.log(`  OGP カード     ${url}?og`)
    console.log(`  テーマの比較   ${url}?theme=hokuchi-light\n`)
    break
  }
  case 'check': {
    const r = await check(talkDirOf(arg), { motion: [arg, ...flags].includes('--motion') })
    if (r.errors.length) process.exitCode = 1
    break
  }
  case 'build': {
    const dir = talkDirOf(arg)
    await buildTalk(dir, join(dir, 'out', 'build'))
    break
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n').replace(/^\/\/ ?/gm, ''))
}
