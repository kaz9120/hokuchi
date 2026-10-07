// 検査。全状態の静止画、文字の重なり・はみ出し・小さい文字、絵コンテとの照合、遷移のコマ撮り
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseStoryboard } from './storyboard.mjs'
import { launch, loadTalk, shootStates, startServer } from './talk.mjs'

// 静止画モードのページで、文字の箱どうしの重なり・ステージからのはみ出し・小さすぎる文字を探す (ブラウザで実行する)
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

/** 絵コンテとシーンの食い違い。絵コンテが無ければ null */
export function compareBoard(talkDir, talk) {
  const file = join(talkDir, 'storyboard.md')
  if (!existsSync(file)) return null
  const board = parseStoryboard(readFileSync(file, 'utf8'))
  const out = []
  const ids = talk.scenes.map((s) => s.id)
  const boardIds = board.scenes.map((s) => s.id)
  for (const id of boardIds) if (!ids.includes(id)) out.push(`${id}: 絵コンテにあるが、シーンが無い`)
  for (const s of talk.scenes) {
    const b = board.scenes.find((x) => x.id === s.id)
    if (!b) {
      out.push(`${s.id}: シーンはあるが、絵コンテに無い`)
      continue
    }
    if (b.states.length !== s.steps) out.push(`${s.id}: 状態の数が違う (絵コンテ ${b.states.length}、シーン ${s.steps})`)
    const empty = (s.notes ?? []).map((n, i) => (n ? null : i + 1)).filter(Boolean)
    if (empty.length) out.push(`${s.id}: 話すことが空の状態がある (${empty.join(', ')})`)
  }
  const order = ids.filter((id) => boardIds.includes(id))
  const boardOrder = boardIds.filter((id) => ids.includes(id))
  if (order.join() !== boardOrder.join()) out.push(`シーンの順序が絵コンテと違う (シーン: ${order.join(' → ')})`)
  return out
}

/** 遷移ごとに 0〜1400ms を 6 コマで切り、1 枚の一覧にする */
export async function motionSheets(browser, url, dir) {
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

/** 検査を回して out/check.md に書く。戻り値は { errors, issues, boardIssues, frames } */
export async function check(talkDir, { motion = false, quiet = false } = {}) {
  const outDir = join(talkDir, 'out')
  mkdirSync(join(outDir, 'states'), { recursive: true })
  const { server, url } = await startServer(talkDir)
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  const shots = await shootStates(page, url)
  for (const s of shots) writeFileSync(join(outDir, 'states', `${s.name}.png`), s.png)
  const issues = await page.evaluate(inspect)
  const talk = await loadTalk(server)
  const boardIssues = compareBoard(talkDir, talk)

  if (motion) await motionSheets(browser, url, join(outDir, 'motion'))
  await browser.close()
  await server.close()

  const lines = [`# check: ${basename(talkDir)}`, '', `状態 ${shots.length} 枚を out/states/ に出しました。`, '']
  if (errors.length) lines.push('## 実行時のエラー', '', ...errors.map((e) => `- ${e}`), '')
  if (boardIssues) lines.push('## 絵コンテとの照合', '', ...(boardIssues.length ? boardIssues.map((x) => `- ${x}`) : ['食い違いはありません。']), '')
  lines.push('## 検査', '')
  if (!issues.length) lines.push('指摘はありません。')
  for (const x of issues) lines.push(`- ${x.frame} ${x.kind}: ${x.text}`)
  writeFileSync(join(outDir, 'check.md'), lines.join('\n') + '\n')
  if (!quiet) console.log(lines.join('\n'))
  return { errors, issues, boardIssues, frames: shots.map((s) => s.name) }
}
