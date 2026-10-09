// slides.y-kaz.com を、ローカルの開発サーバでまるごと見る (ADR-0034)。bun run dev と studio の両方が使う。
//
// トークごとに Vite を立て、/<slug>/ の下にぶら下げる。保存すると即座に反映され、agentation も使える。
// 一覧のサムネイル (og.png) は、表紙をその場で撮る。非公開のトークも、印を付けて一覧に出す
import { createServer as createHttp } from 'node:http'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { stageConfig, stageDir } from '../../packages/stage/node/vite.mjs'
import { publicInfo } from '../../packages/stage/node/build.mjs'
import { isTalkDir, launch, loadTalk, talkInfo, waitReady } from '../../packages/stage/node/talk.mjs'
import { indexHtml, notFoundHtml } from './pages.mjs'

const here = import.meta.dirname
const repoRoot = resolve(here, '../..')
export const PORT = 5280

/**
 * サイト全体の開発サーバを立てる。studio も同じものを、同じプロセスの中で立てる (ADR-0035)。
 * 戻り値の talks は slug → { dir, info, vite, firstScene, og }。browser を渡すと、表紙の撮影に使い回す
 */
export async function startSite({ port = PORT, browser: shared = null, quiet = false } = {}) {
  const http = createHttp()
  const talksDir = join(repoRoot, 'talks')
  const dirs = readdirSync(talksDir)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .map((n) => join(talksDir, n))
    .filter(isTalkDir)
    .sort()

  /** slug → { info, vite, og } */
  const talks = new Map()
  for (const dir of dirs) {
    const t = await mountTalk(dir, http)
    if (talks.has(t.info.slug)) throw new Error(`/${t.info.slug}/ が重複しています。talk.tsx の slug で区別してください`)
    talks.set(t.info.slug, t)
  }

  // トップページと 404 ページは、サイト用の Vite に通して agentation を差し込む。
  // HTML はリクエストのたびに作り直すので、HMR は要らない (トークの HMR と WebSocket を取り合わないよう切る)
  const site = await createServer({
    configFile: false,
    root: here,
    logLevel: 'warn',
    appType: 'custom',
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { middlewareMode: true, hmr: false, fs: { allow: [repoRoot] } },
    // 初めて開いたときに依存を見つけ直すと、React が 2 つ読まれて落ちる。先に最適化しておく
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'agentation'] },
  })
  const toolbar = resolve(stageDir, 'src/runtime/feedback-toolbar.tsx')
  const page = (url, html) =>
    site.transformIndexHtml(
      url,
      html.replace('</body>', `<script type="module">import { mountFeedback } from '/@fs${toolbar}'; mountFeedback('slides.y-kaz.com')</script></body>`),
    )

  let browser = shared
  const shootCover = async (t) => {
    browser ??= await launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    try {
      await page.goto(`http://localhost:${port}/${t.info.slug}/?shot=${encodeURIComponent(t.firstScene)}/0`)
      await waitReady(page)
      return await (await page.$('[data-frame]')).screenshot()
    } finally {
      await page.close()
    }
  }

  http.on('request', async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (path === '/' || path === '/index.html') {
      const entries = [...talks.values()].map((t) => t.info).sort((a, b) => (a.date < b.date ? 1 : -1))
      return send(res, 200, 'text/html; charset=utf-8', await page(req.url, indexHtml(entries)))
    }
    const slug = path.split('/')[1]
    const t = talks.get(slug)
    if (!t) {
      // サイト用の Vite が配るもの (/@vite/client、/@fs/… の部品など)
      if (path.startsWith('/@') || path.startsWith('/node_modules/')) return site.middlewares(req, res)
      return send(res, 404, 'text/html; charset=utf-8', await page(req.url, notFoundHtml()))
    }
    if (path === `/${slug}`) {
      res.writeHead(301, { location: `/${slug}/` })
      return res.end()
    }
    if (path === `/${slug}/og.png`) {
      try {
        t.og ??= shootCover(t)
        return send(res, 200, 'image/png', await t.og)
      } catch (e) {
        t.og = null
        return send(res, 500, 'text/plain; charset=utf-8', String(e))
      }
    }
    t.vite.middlewares(req, res)
  })

  await new Promise((ok, ng) => {
    http.once('error', (e) => ng(e.code === 'EADDRINUSE' ? new Error(`ポート ${port} が使われています。bun run dev か studio がもう動いていないか確かめてください`) : e))
    http.listen(port, ok)
  })
  const url = `http://localhost:${port}`
  if (!quiet) {
    console.log(`\n  slides.y-kaz.com (開発サーバ)\n`)
    console.log(`  トップページ   ${url}/`)
    for (const t of talks.values()) console.log(`  ${t.info.public ? '' : '(非公開) '}${t.info.name}\n                 ${url}/${t.info.slug}/`)
    console.log('')
  }
  const close = async () => {
    for (const t of talks.values()) await t.vite.close()
    await site.close()
    if (browser && browser !== shared) await browser.close()
    http.close()
  }
  return { talks, url, close }
}

/** トーク 1 本の Vite を、/<slug>/ の下で動かす。slug は talk.tsx の指定を優先する */
async function mountTalk(dir, http) {
  const make = (slug) => {
    const cfg = stageConfig(dir)
    return createServer({
      ...cfg,
      base: `/${slug}/`,
      appType: 'spa',
      // HMR の WebSocket は、サイトの http サーバに相乗りする。トークごとに base で道を分ける
      server: { ...cfg.server, middlewareMode: true, hmr: { server: http } },
    })
  }
  let slug = talkInfo(dir).slug ?? 'talk'
  let vite = await make(slug)
  let talk = await loadTalk(vite)
  let info = publicInfo(dir, talk)
  if (info.slug !== slug) {
    await vite.close()
    slug = info.slug
    vite = await make(slug)
    talk = await loadTalk(vite)
  }
  const t = { dir, info, vite, firstScene: talk.scenes[0].id, og: null }
  // トークのファイルが変わったら、表紙を撮り直す。一覧の名前や日付も読み直す
  vite.watcher.on('change', async () => {
    t.og = null
    try {
      const fresh = await loadTalk(vite)
      t.info = publicInfo(dir, fresh)
      t.firstScene = fresh.scenes[0].id
    } catch {}
  })
  return t
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}
