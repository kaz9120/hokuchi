// 書き出しと検証。
//   node scripts/export.mjs pdf     → out/deck.pdf (各シーンの print の状態。ベクター・文字選択可)
//   node scripts/export.mjs states  → out/states/*.png (全シーンの全状態)
//   node scripts/export.mjs motion  → out/motion/*.png (遷移を時間で切ったコマ撮りの一覧)
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'out')
const mode = process.argv[2] ?? 'pdf'

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

async function printPage(query) {
  await page.goto(`${base}?${query}`)
  await page.waitForFunction(() => window.__READY__ === true)
}

if (mode === 'pdf') {
  mkdirSync(out, { recursive: true })
  await printPage('print')
  await page.pdf({ path: resolve(out, 'deck.pdf'), width: '1280px', height: '720px', printBackground: true })
  console.log('wrote out/deck.pdf')
}

if (mode === 'states') {
  mkdirSync(resolve(out, 'states'), { recursive: true })
  await printPage('print&all')
  for (const el of await page.$$('[data-frame]')) {
    const name = await el.getAttribute('data-frame')
    await el.screenshot({ path: resolve(out, 'states', `${name}.png`) })
  }
  console.log('wrote out/states/')
}

if (mode === 'motion') {
  // 各遷移を 0〜1400ms の 6 コマで切り、1 枚の一覧にする
  mkdirSync(resolve(out, 'motion'), { recursive: true })
  const times = [0, 150, 300, 500, 800, 1400]
  await page.goto(`${base}#/title/0`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1200)
  for (let n = 0; n < 15; n++) {
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
      `<body style="margin:0;background:#222;color:#eee;font:16px sans-serif">
        <div style="padding:6px 10px">${from} → ${to}（${times.join(' / ')} ms）</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px">
          ${shots.map((s) => `<img style="width:100%" src="data:image/jpeg;base64,${s}">`).join('')}
        </div></body>`,
    )
    await sheet.screenshot({ path: resolve(out, 'motion', `${String(n).padStart(2, '0')}.png`), fullPage: true })
    await sheet.close()
    await page.waitForTimeout(400)
  }
  console.log('wrote out/motion/')
}

await browser.close()
await server.close()
