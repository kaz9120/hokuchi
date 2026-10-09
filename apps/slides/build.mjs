#!/usr/bin/env node
// slides.y-kaz.com を組み立てる (ADR-0029)。
//
//   node apps/slides/build.mjs            talks/ の公開トークを最新のフレームワークでビルドし、dist/ に組み立てる
//   node apps/slides/build.mjs --accept   見た目の差分を確認したうえで受け入れる
//
// 凍結はしない。公開のたびに全トークをビルドし直すので、フレームワークの改善が過去のトークにも届く。
// 代わりに、全トークの全状態の静止画を前回 (.snapshots/) と比べる。見た目が変わった状態があれば、
// 前後の画像を .snapshots/_diff/ に並べて止める。意図した変化なら --accept で受け入れる。
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildTalk } from '../../packages/stage/node/build.mjs'
import { isTalkDir } from '../../packages/stage/node/talk.mjs'
import { indexHtml, notFoundHtml, sitemap } from './pages.mjs'

const here = import.meta.dirname
const repoRoot = resolve(here, '../..')
const dist = join(here, 'dist')
const snaps = join(here, '.snapshots')
const accept = process.argv.includes('--accept')


async function main() {
  rmSync(dist, { recursive: true, force: true })
  mkdirSync(join(dist, '.tmp'), { recursive: true })

  // talks/ の直下で、talk.tsx を持つもの。_ で始まるディレクトリ (共有物など) は対象外
  const talksDir = join(repoRoot, 'talks')
  const dirs = readdirSync(talksDir)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .map((n) => join(talksDir, n))
    .filter(isTalkDir)
    .sort()

  const entries = []
  const changed = []
  for (const dir of dirs) {
    const tmp = join(dist, '.tmp', String(dirs.indexOf(dir)))
    const { info, states } = await buildTalk(dir, tmp, { states: true })
    if (!info.public) {
      console.log(`    public でないので載せません`)
      continue
    }
    if (entries.some((e) => e.slug === info.slug)) throw new Error(`/${info.slug}/ が重複しています。talk.tsx の slug で区別してください`)
    renameSync(tmp, join(dist, info.slug))
    entries.push(info)
    changed.push(...diffStates(info.slug, states))
  }
  rmSync(join(dist, '.tmp'), { recursive: true, force: true })

  entries.sort((a, b) => (a.date < b.date ? 1 : -1))
  writeFileSync(join(dist, 'index.html'), indexHtml(entries))
  writeFileSync(join(dist, '404.html'), notFoundHtml())
  writeFileSync(join(dist, 'sitemap.xml'), sitemap(entries))
  console.log(`\n${dist} に ${entries.length} 本のトークを組み立てました`)

  if (changed.length) {
    console.log(`\n前回から見た目が変わった状態が ${changed.length} 件あります。前後の画像は ${join(snaps, '_diff')} にあります。`)
    for (const c of changed) console.log(`  ${c}`)
    if (!accept) {
      console.log('\n意図した変化なら --accept を付けて、もう一度組み立ててください。')
      process.exit(2)
    }
  }
  commitSnapshots()
}

/** 全状態の静止画を前回と比べる。変わった状態の名前を返し、新しい静止画は .snapshots/_next に置く */
function diffStates(slug, states) {
  const base = join(snaps, slug)
  const next = join(snaps, '_next', slug)
  const diff = join(snaps, '_diff', slug)
  mkdirSync(next, { recursive: true })
  const out = []
  const names = new Set(states.map((s) => s.name))
  for (const s of states) {
    writeFileSync(join(next, `${s.name}.png`), s.png)
    const prev = join(base, `${s.name}.png`)
    if (!existsSync(base)) continue // 初めて載るトークは比べない
    if (!existsSync(prev)) {
      out.push(`${slug} ${s.name} (新しい状態)`)
      continue
    }
    if (!readFileSync(prev).equals(s.png)) {
      mkdirSync(diff, { recursive: true })
      cpSync(prev, join(diff, `${s.name}.before.png`))
      writeFileSync(join(diff, `${s.name}.after.png`), s.png)
      out.push(`${slug} ${s.name}`)
    }
  }
  if (existsSync(base)) for (const f of readdirSync(base)) if (!names.has(f.replace(/\.png$/, ''))) out.push(`${slug} ${f} (無くなった状態)`)
  return out
}

/** 今回の静止画を、次回の比較の基準にする */
function commitSnapshots() {
  const next = join(snaps, '_next')
  if (!existsSync(next)) return
  for (const slug of readdirSync(next)) {
    rmSync(join(snaps, slug), { recursive: true, force: true })
    renameSync(join(next, slug), join(snaps, slug))
  }
  rmSync(next, { recursive: true, force: true })
  rmSync(join(snaps, '_diff'), { recursive: true, force: true })
}

await main()
