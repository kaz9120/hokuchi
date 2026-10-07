#!/usr/bin/env node
// hokuchi stage の CLI (ADR-0026, ADR-0027)
//
//   stage dev <talk>              作業用のサーバ。保存すると即座に反映される
//   stage check <talk> [--motion] 全状態の静止画と、はみ出し・重なり・小さい文字の検査 (out/check.md)
//                                 --motion で遷移のコマ撮りも出す (out/motion/)
//   stage build <talk>            公開用の静的ファイルを out/build/ に出す (OGP 画像つき)
//   stage freeze <talk>           発表後の凍結。final/ に出す (コミットする)
//   stage site                    talks/*/final を集めて、サイトを tools/stage/out/site/ に組み立てる
//
// <talk> は talks/<slug> のディレクトリ。talk.tsx を持つ
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { build as viteBuild, createServer } from 'vite'
import { chromium } from 'playwright'
import { repoRoot, stageConfig, stageDir } from './vite.mjs'

export const SITE = 'https://slides.y-kaz.com'

const [cmd, arg, ...flags] = process.argv.slice(2)

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function talkDirOf(a) {
  if (!a) fail('トークのディレクトリを指定してください (例: talks/2026-10-example)')
  const dir = resolve(process.cwd(), a)
  if (!existsSync(join(dir, 'talk.tsx'))) fail(`${dir}/talk.tsx がありません`)
  return dir
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

async function startServer(talkDir, port = 0) {
  const server = await createServer(stageConfig(talkDir, { port }))
  await server.listen()
  return { server, url: server.resolvedUrls.local[0] }
}

const launch = () => chromium.launch({ channel: 'chrome' })

async function waitReady(page) {
  await page.waitForFunction(() => window.__STAGE_READY__ === true, null, { timeout: 30000 })
}

// ---------------------------------------------------------------- dev
async function dev(talkDir) {
  const { url } = await startServer(talkDir, 5280)
  console.log(`\n  ${basename(talkDir)}\n`)
  console.log(`  ライブ         ${url}`)
  console.log(`  発表者ビュー   ${url}?presenter  (ライブで p キーでも開く)`)
  console.log(`  全状態の静止画 ${url}?shot=all`)
  console.log(`  OGP カード     ${url}?og\n`)
}

// ---------------------------------------------------------------- check
// 静止画モードのページで、文字の箱どうしの重なり・ステージからのはみ出し・小さすぎる文字を探す
function inspect() {
  const out = []
  for (const shot of document.querySelectorAll('[data-frame]')) {
    const frame = shot.dataset.frame
    const stage = shot.querySelector('.stage').getBoundingClientRect()
    const boxes = []
    const walker = document.createTreeWalker(shot, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      const text = n.textContent.trim()
      if (!text) continue
      const el = n.parentElement
      let op = 1
      for (let e = el; e && e !== shot; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity)
      if (op < 0.05) continue
      const inFrame = !!el.closest('.frame')
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const g of range.getClientRects()) {
        if (g.width < 1 || g.height < 1) continue
        // 画面の外へ退場したもの (ステージと交わらない) は見えないので対象外
        const inside = g.right > stage.left && g.left < stage.right && g.bottom > stage.top && g.top < stage.bottom
        if (!inside) continue
        if (g.left < stage.left - 1 || g.right > stage.right + 1 || g.top < stage.top - 1 || g.bottom > stage.bottom + 1)
          out.push({ frame, kind: 'はみ出し', text })
        // 文字の箱はフォントの上下の余白を含むので、上下 15% ずつ削って字面に近づける
        const pad = g.height * 0.15
        boxes.push({ r: { left: g.left, right: g.right, top: g.top + pad, bottom: g.bottom - pad }, text, n })
      }
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (!inFrame && fs < 18) out.push({ frame, kind: '小さい文字', text: `${text} (${fs}px)` })
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.n === b.n) continue
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
        if (w > 3 && h > 3) out.push({ frame, kind: '重なり', text: `「${a.text}」と「${b.text}」` })
      }
  }
  const seen = new Set()
  return out.filter((x) => {
    const k = `${x.frame}|${x.kind}|${x.text}`
    return seen.has(k) ? false : seen.add(k)
  })
}

async function check(talkDir, motion) {
  const outDir = join(talkDir, 'out')
  mkdirSync(join(outDir, 'states'), { recursive: true })
  const { server, url } = await startServer(talkDir)
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(`${url}?shot=all`)
  await waitReady(page)
  const frames = []
  for (const el of await page.$$('[data-frame]')) {
    const name = (await el.getAttribute('data-frame')).replace('/', '-')
    await el.screenshot({ path: join(outDir, 'states', `${name}.png`) })
    frames.push(name)
  }
  const issues = await page.evaluate(inspect)

  if (motion) await motionSheets(browser, url, join(outDir, 'motion'))
  await browser.close()
  await server.close()

  const lines = [`# check: ${basename(talkDir)}`, '', `状態 ${frames.length} 枚を out/states/ に出しました。`, '']
  if (errors.length) lines.push('## 実行時のエラー', '', ...errors.map((e) => `- ${e}`), '')
  lines.push('## 検査', '')
  if (!issues.length) lines.push('指摘はありません。')
  for (const x of issues) lines.push(`- ${x.frame} ${x.kind}: ${x.text}`)
  writeFileSync(join(outDir, 'check.md'), lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  if (errors.length) process.exitCode = 1
}

// 遷移ごとに 0〜1400ms を 6 コマで切り、1 枚の一覧にする
async function motionSheets(browser, url, dir) {
  mkdirSync(dir, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const times = [0, 150, 300, 500, 800, 1400]
  await page.goto(url)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1000)
  for (let n = 0; n < 200; n++) {
    const from = await page.evaluate(() => location.hash)
    await page.keyboard.press('ArrowRight')
    const shots = []
    let last = 0
    for (const ms of times) {
      await page.waitForTimeout(ms - last)
      last = ms
      shots.push((await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'))
    }
    const to = await page.evaluate(() => location.hash)
    if (from === to) break
    const sheet = await browser.newPage({ viewport: { width: 1920, height: 760 } })
    await sheet.setContent(
      `<body style="margin:0;background:#222;color:#eee;font:16px sans-serif"><div style="padding:6px 10px">${from} → ${to}（${times.join(' / ')} ms）</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px">${shots.map((s) => `<img style="width:100%" src="data:image/jpeg;base64,${s}">`).join('')}</div></body>`,
    )
    await sheet.screenshot({ path: join(dir, `${String(n).padStart(2, '0')}.png`), fullPage: true })
    await sheet.close()
    await page.waitForTimeout(300)
  }
  await page.close()
}

// ---------------------------------------------------------------- build / freeze
function metaTags(talk, slug) {
  const url = `${SITE}/${slug}/`
  const title = esc(talk.title)
  const desc = esc(talk.description)
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="slides.y-kaz.com" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${url}og.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="ja_JP" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${url}og.png" />`,
  ].join('\n    ')
}

async function build(talkDir, outDir) {
  const slug = basename(talkDir)
  const { server, url } = await startServer(talkDir)
  const talk = (await server.ssrLoadModule(join(talkDir, 'talk.tsx'))).default
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.goto(`${url}?og`)
  await waitReady(page)
  const og = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
  await browser.close()
  await server.close()

  await viteBuild(stageConfig(talkDir, { outDir, meta: metaTags(talk, slug) }))
  writeFileSync(join(outDir, 'og.png'), og)
  const info = {
    slug,
    title: talk.title,
    description: talk.description,
    date: talk.date,
    event: talk.event ?? null,
    speaker: talk.speaker,
    theme: talk.theme.name,
    scenes: talk.scenes.length,
    builtAt: new Date().toISOString(),
  }
  writeFileSync(join(outDir, 'stage.json'), JSON.stringify(info, null, 2) + '\n')
  console.log(`${outDir} に出しました (${SITE}/${slug}/)`)
}

// ---------------------------------------------------------------- site
function legacyInfo(dir, slug) {
  const yaml = existsSync(join(dir, 'deck.yaml')) ? readFileSync(join(dir, 'deck.yaml'), 'utf8') : ''
  const title = yaml.match(/^deck:\s*\n(?:.*\n)*?\s+title:\s*"?(.+?)"?\s*$/m)?.[1] ?? slug
  return { slug, title: title.replace(/\\n/g, ' '), date: slug.slice(0, 7), description: '', legacy: true }
}

function site() {
  const out = join(stageDir, 'out', 'site')
  mkdirSync(out, { recursive: true })
  const talksDir = join(repoRoot, 'talks')
  const entries = []
  for (const slug of readdirSync(talksDir).sort().reverse()) {
    const final = join(talksDir, slug, 'final')
    if (!existsSync(final)) continue
    const files = readdirSync(final)
    let info
    if (files.includes('stage.json')) {
      const j = JSON.parse(readFileSync(join(final, 'stage.json'), 'utf8'))
      info = { ...j, href: `${slug}/`, image: `${slug}/og.png` }
    } else if (files.includes('index.html')) {
      info = { ...legacyInfo(join(talksDir, slug), slug), href: `${slug}/`, image: files.includes('slide-01.png') ? `${slug}/slide-01.png` : null }
    } else if (files.some((f) => f.endsWith('.pdf'))) {
      const pdf = files.find((f) => f.endsWith('.pdf'))
      info = { ...legacyInfo(join(talksDir, slug), slug), href: `${slug}/${pdf}`, image: files.includes('slide-01.png') ? `${slug}/slide-01.png` : null }
    } else continue
    cpSync(final, join(out, slug), { recursive: true })
    entries.push(info)
  }
  writeFileSync(join(out, 'index.html'), indexHtml(entries))
  console.log(`${out} に ${entries.length} 本のトークを組み立てました`)
}

function indexHtml(entries) {
  const cards = entries
    .map(
      (e) => `<a class="talk" href="${esc(e.href)}">
        ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" />` : '<div class="noimg"></div>'}
        <div class="meta">${esc(e.date)}${e.event?.name ? ` ・ ${esc(e.event.name)}` : ''}</div>
        <div class="title">${esc(e.title)}</div>
      </a>`,
    )
    .join('\n      ')
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>slides.y-kaz.com ・ 山本一将の発表資料</title>
    <meta name="description" content="焚き火を愛するエンジニア 山本一将の発表資料置き場です。" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="slides.y-kaz.com" />
    <meta property="og:description" content="焚き火を愛するエンジニア 山本一将の発表資料置き場です。" />
    <meta property="og:url" content="${SITE}/" />
    ${entries[0]?.image ? `<meta property="og:image" content="${SITE}/${esc(entries[0].image)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&display=swap" rel="stylesheet" />
    <style>
      body { margin: 0; background: #13110e; color: #ebe5d8; font-family: 'LINE Seed JP', sans-serif; }
      header { max-width: 1120px; margin: 0 auto; padding: 56px 24px 24px; }
      h1 { font-size: 28px; margin: 0; }
      header p { color: #a8a094; margin: 8px 0 0; }
      main { max-width: 1120px; margin: 0 auto; padding: 16px 24px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 28px; }
      .talk { color: inherit; text-decoration: none; display: grid; gap: 8px; }
      .talk img, .noimg { width: 100%; aspect-ratio: 1200 / 630; object-fit: cover; border-radius: 10px; background: #1a1814; border: 1px solid #26221c; }
      .talk:hover img { border-color: #f47d3a; }
      .meta { font-size: 13px; color: #a8a094; }
      .title { font-size: 17px; font-weight: 700; line-height: 1.5; }
    </style>
  </head>
  <body>
    <header>
      <h1>slides.y-kaz.com</h1>
      <p>焚き火を愛するエンジニア 山本一将の発表資料です。</p>
    </header>
    <main>
      ${cards}
    </main>
  </body>
</html>
`
}

// ----------------------------------------------------------------
switch (cmd) {
  case 'dev':
    await dev(talkDirOf(arg))
    break
  case 'check':
    await check(talkDirOf(arg), [arg, ...flags].includes('--motion'))
    break
  case 'build': {
    const dir = talkDirOf(arg)
    await build(dir, join(dir, 'out', 'build'))
    break
  }
  case 'freeze': {
    const dir = talkDirOf(arg)
    await build(dir, join(dir, 'final'))
    break
  }
  case 'site':
    site()
    break
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 11).join('\n').replace(/^\/\/ ?/gm, ''))
}
