// トーク 1 本を Node から扱うための共通処理
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { stageConfig } from './vite.mjs'

export const SITE = 'https://slides.y-kaz.com'
export { talkInfo } from './naming.mjs'

export function isTalkDir(dir) {
  return existsSync(join(dir, 'talk.tsx'))
}

export async function startServer(talkDir, port = 0) {
  const server = await createServer(stageConfig(talkDir, { port }))
  await server.listen()
  return { server, url: server.resolvedUrls.local[0] }
}

/** talk.tsx を Node で読む (絵コンテのノートを流し込んだもの) */
export async function loadTalk(server) {
  return (await server.ssrLoadModule('virtual:talk')).default
}

export const launch = () => chromium.launch({ channel: 'chrome' })

export async function waitReady(page) {
  await page.waitForFunction(() => window.__STAGE_READY__ === true, null, { timeout: 30000 })
}

/** 全状態の静止画を撮る。戻り値は [{ name: 'scene-step', png: Buffer }] */
export async function shootStates(page, url) {
  await page.goto(`${url}?shot=all`)
  await waitReady(page)
  // トークの CSS が @import で足したフォントは、準備完了の合図より遅れて届く。font-display: block の文字は
  // 届くまで描かれないので、待たないと撮るたびに一部の文字が欠ける (欠ける状態が回ごとに変わる)
  // @import の CSS 自体が遅れると、fonts.ready はフォントを宣言する前に解決してしまうので、先に通信が落ち着くのを待つ
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  const shots = []
  for (const el of await page.$$('[data-frame]')) {
    const name = (await el.getAttribute('data-frame')).replace('/', '-')
    // 全状態を縦に並べたページでは、画面から遠い状態のぼかしや合成の層がまだ描かれていないことがある。
    // 画面に入れて 2 コマ待ってから撮る (待たないと、撮るたびに欠ける要素が変わる)
    await el.scrollIntoViewIfNeeded()
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    shots.push({ name, png: await el.screenshot() })
  }
  return shots
}
