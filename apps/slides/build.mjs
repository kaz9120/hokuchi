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
import { SITE, isTalkDir } from '../../packages/stage/node/talk.mjs'

const here = import.meta.dirname
const repoRoot = resolve(here, '../..')
const dist = join(here, 'dist')
const snaps = join(here, '.snapshots')
const accept = process.argv.includes('--accept')

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

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

function sitemap(entries) {
  const urls = [`${SITE}/`, ...entries.map((e) => `${SITE}/${e.slug}/`)]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #13110e; color: #ebe5d8; font-family: 'LINE Seed JP', system-ui, sans-serif; }
  a { color: inherit; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  header { padding: 64px 0 24px; }
  h1 { font-size: 28px; margin: 0; letter-spacing: 0.02em; }
  header p { color: #a8a094; margin: 8px 0 0; }
  h2 { font-size: 15px; color: #a8a094; margin: 40px 0 16px; font-weight: 700; letter-spacing: 0.08em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 28px; }
  .talk { text-decoration: none; display: grid; gap: 8px; }
  .talk img { width: 100%; aspect-ratio: 1200 / 630; object-fit: cover; border-radius: 10px; background: #1a1814; border: 1px solid #26221c; transition: border-color .3s; }
  .talk:hover img { border-color: #f47d3a; }
  .meta { font-size: 13px; color: #a8a094; display: flex; gap: 8px; align-items: center; }
  .tag { border: 1px solid #3a342b; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
  .title { font-size: 17px; font-weight: 700; line-height: 1.5; }
  footer { color: #7d7468; font-size: 13px; padding: 64px 0 48px; }
`

function indexHtml(entries) {
  const byYear = new Map()
  for (const e of entries) {
    const y = (e.date ?? '').slice(0, 4) || '—'
    byYear.set(y, [...(byYear.get(y) ?? []), e])
  }
  const sections = [...byYear]
    .map(
      ([y, list]) => `<h2>${esc(y)}</h2>
      <div class="grid">
        ${list
          .map(
            (e) => `<a class="talk" href="./${esc(e.slug)}/">
          <img src="./${esc(e.slug)}/og.png" alt="" loading="lazy" />
          <div class="meta"><span>${esc(e.date)}</span>${e.tag ? `<span class="tag">#${esc(e.tag)}</span>` : ''}${e.event?.name ? `<span>${esc(e.event.name)}</span>` : ''}</div>
          <div class="title">${esc(e.title)}</div>
        </a>`,
          )
          .join('\n        ')}
      </div>`,
    )
    .join('\n      ')
  const desc = '焚き火を愛するエンジニア 山本一将の発表資料です。'
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>slides.y-kaz.com</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${SITE}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="slides.y-kaz.com" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${SITE}/" />
    ${entries[0] ? `<meta property="og:image" content="${SITE}/${esc(entries[0].slug)}/og.png" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&display=swap" rel="stylesheet" />
    <style>${PAGE_STYLE}</style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>slides.y-kaz.com</h1>
        <p>${desc}</p>
      </header>
      ${sections || '<p>まだ公開しているトークはありません。</p>'}
      <footer>© 山本一将</footer>
    </div>
  </body>
</html>
`
}

function notFoundHtml() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>見つかりません ・ slides.y-kaz.com</title><style>${PAGE_STYLE}</style></head>
<body><div class="wrap"><header><h1>見つかりません</h1><p>このページはありません。<a href="/">トップページ</a>から探してみてください。</p></header></div></body></html>
`
}

await main()
