// サイト全体の開発サーバ (apps/slides/site-server.mjs) と、撮影に使うブラウザ。
// 発表の絵と再生は、このサーバのトークの URL (/<slug>/) から描く (ADR-0035)。
// studio は、リポジトリの talks/ に加えて、置き場の talks/ (非公開の発表。ADR-0041) も読む
import { join } from 'node:path'
import type { ViteDevServer } from 'vite'
import { chromium, type Browser } from 'playwright'
// @ts-expect-error JS のモジュール (型が無い)
import { startSite } from '../../../slides/site-server.mjs'
// @ts-expect-error JS のモジュール (型が無い)
import { loadTalk, waitReady, SITE } from '../../../../packages/stage/node/talk.mjs'
import { PRIVATE, SITE_PORT } from './config.ts'

export type TalkInfo = { slug: string; name: string; title: string; description?: string; date: string | null; tag: string | null; event: { name: string; title?: string } | null; public: boolean; scenes: number }
export type SiteTalk = { dir: string; info: TalkInfo; vite: ViteDevServer; firstScene: string; outside: boolean }
export type Site = {
  url: string
  talks: Map<string, SiteTalk>
  close: () => Promise<void>
  refresh: () => Promise<string[]>
  unmount: (slug: string) => Promise<void>
}

export const PRODUCTION_SITE: string = SITE

let browser: Browser | null = null
let site: Site | null = null

export async function startInfra() {
  browser = await chromium.launch({ channel: 'chrome' })
  try {
    site = (await startSite({ port: SITE_PORT, browser, quiet: true, moreTalkDirs: [join(PRIVATE, 'talks')] })) as Site
  } catch (e) {
    await browser.close()
    throw e
  }
  return site
}

export function theSite(): Site {
  if (!site) throw new Error('サイトの開発サーバがまだ立っていません')
  return site
}
export function theBrowser(): Browser {
  if (!browser) throw new Error('ブラウザがまだ立っていません')
  return browser
}

export async function stopInfra() {
  await site?.close()
  await browser?.close()
}

/** talk.tsx を Node で読む (絵コンテのノートを流し込んだもの) */
export const loadTalkDef = (vite: ViteDevServer): Promise<{ scenes: { id: string; steps: number }[] }> => loadTalk(vite)
export const waitStageReady: (page: import('playwright').Page) => Promise<void> = waitReady
