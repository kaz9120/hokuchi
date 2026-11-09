// 発表の縮小画像を撮る。全状態を 1 枚ずつ JPEG にし、メモリに持つ。作品を開いているあいだだけ動かす
import type { Page } from 'playwright'
import { theBrowser, waitStageReady } from './site.ts'

export type Shooter = {
  shoot: () => Promise<{ version: number; errors: string[] }>
  /** scene と コマ (1 始まり) の絵 */
  get: (scene: string, n: number) => Buffer | undefined
  version: () => number
  close: () => Promise<void>
}

export function createShooter(stageUrl: () => string): Shooter {
  const thumbs = new Map<string, Buffer>()
  let version = 0
  let page: Page | null = null
  let running: Promise<{ version: number; errors: string[] }> | null = null
  let closed = false
  const errors: string[] = []
  const shoot = () =>
    (running ??= (async () => {
      errors.length = 0
      try {
        if (!page) {
          page = await theBrowser().newPage({ viewport: { width: 1280, height: 720 } })
          page.on('pageerror', (e) => errors.push(String(e)))
        }
        await page.goto(`${stageUrl()}?shot=all`)
        await waitStageReady(page)
        thumbs.clear()
        for (const el of await page.$$('[data-frame]')) {
          // data-frame は "<scene>/<状態 0 始まり>"。画面とコードは 1 始まりにそろえる
          const [scene, step] = String(await el.getAttribute('data-frame')).split('/')
          thumbs.set(`${scene}/${Number(step) + 1}`, await el.screenshot({ type: 'jpeg', quality: 80 }))
        }
        version++
      } catch (e) {
        if (!closed) errors.push(String((e as Error).message ?? e))
      } finally {
        running = null
      }
      return { version, errors: [...errors] }
    })())
  return {
    shoot,
    get: (scene, n) => thumbs.get(`${scene}/${n}`),
    version: () => version,
    close: async () => {
      closed = true
      await page?.close().catch(() => {})
      page = null
    },
  }
}
