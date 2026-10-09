#!/usr/bin/env node
// slides.y-kaz.com を、ローカルの開発サーバでまるごと見る (ADR-0034)。
//
//   bun run dev            サイト全体。トップページと全トークを、本番と同じ URL (/<slug>/) で開ける
//   bun run dev <talk>     トーク 1 本だけ (packages/stage の CLI に渡す)
//
// 制作しながら見るときは、studio (bun run studio) が同じサーバを中に持っている
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { startSite } from './site-server.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const arg = process.argv[2]
if (arg) {
  // トーク 1 本の作業用サーバは、これまでどおり packages/stage の CLI が持つ
  const child = spawn(process.execPath, [join(repoRoot, 'packages/stage/cli.mjs'), 'dev', ...process.argv.slice(2)], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
} else {
  try {
    await startSite()
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
