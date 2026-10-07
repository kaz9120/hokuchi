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
  const shots = []
  for (const el of await page.$$('[data-frame]')) {
    const name = (await el.getAttribute('data-frame')).replace('/', '-')
    shots.push({ name, png: await el.screenshot() })
  }
  return shots
}
