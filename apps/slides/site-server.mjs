// slides.y-kaz.com を、ローカルの開発サーバでまるごと見る (ADR-0034)。bun run dev と studio の両方が使う。
//
// トークごとに Vite を立て、/<slug>/ の下にぶら下げる。保存すると即座に反映され、agentation も使える。
// 一覧のサムネイル (og.png) は、表紙をその場で撮る。非公開のトークも、印を付けて一覧に出す。
// studio は、公開リポジトリの外のトーク (社内向けの発表) の置き場も足して立てる (ADR-0041)
import { createServer as createHttp } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
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
 * 戻り値の talks は slug → { dir, info, vite, firstScene, og, outside }。refresh で置き場を読み直し、unmount で 1 本を外す。browser を渡すと、表紙の撮影に使い回す。
 * moreTalkDirs は、talks/ のほかに読むトークの置き場。そこのトークは outside の印を持ち、talk.tsx に関わらず非公開として扱う
 */
export async function startSite({ port = PORT, browser: shared = null, quiet = false, moreTalkDirs = [] } = {}) {
  const http = createHttp()
  const scan = () => {
    const roots = [{ dir: join(repoRoot, 'talks'), outside: false }, ...moreTalkDirs.filter((d) => existsSync(d)).map((dir) => ({ dir, outside: true }))]
    return roots.flatMap(({ dir, outside }) =>
      readdirSync(dir)
        .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
        .map((n) => ({ dir: join(dir, n), outside }))
        .filter((t) => isTalkDir(t.dir))
        .sort((a, b) => (a.dir < b.dir ? -1 : 1)),
    )
  }

  /** slug → { info, vite, og } */
  const talks = new Map()
  for (const { dir, outside } of scan()) {
    const t = await mountTalk(dir, http, outside)
    if (talks.has(t.info.slug)) throw new Error(`/${t.info.slug}/ が重複しています。talk.tsx の slug で区別してください`)
    talks.set(t.info.slug, t)
  }

  /** トークを外す。ディレクトリを動かす前に呼ぶ (studio が下書きをごみ箱に移すとき) */
  const unmount = async (slug) => {
    const t = talks.get(slug)
    if (!t) return
    talks.delete(slug)
    await t.vite.close()
  }
  /**
   * 置き場を読み直し、増えたトークを立て、消えたトークを外す。立て直さずにトークを足せるようにする (studio が使う)。
   * 立てられなかったトークは飛ばし、その理由を返す
   */
  let refreshing = null
  const rescan = async () => {
    const errors = []
    const found = scan()
    for (const [slug, t] of [...talks]) if (!found.some((f) => f.dir === t.dir)) await unmount(slug)
    for (const { dir, outside } of found) {
      if ([...talks.values()].some((t) => t.dir === dir)) continue
      try {
        const t = await mountTalk(dir, http, outside)
        if (talks.has(t.info.slug)) {
          await t.vite.close()
          throw new Error(`/${t.info.slug}/ が重複しています`)
        }
        talks.set(t.info.slug, t)
      } catch (e) {
        errors.push(`${dir}: ${e.message ?? e}`)
      }
    }
    return errors
  }
  // 同時に呼ばれたら、走っている読み直しを待つ。終わったら次の呼び出しでまた読み直す
  const refresh = () => {
    refreshing ??= rescan().finally(() => (refreshing = null))
    return refreshing
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
  return { talks, url, close, refresh, unmount }
}

/**
 * トーク 1 本の Vite を、/<slug>/ の下で動かす。slug は talk.tsx の指定を優先する。
 * リポジトリの外のトークは、サイトの組み立て (build.mjs) に載らないので、public: true と書いてあっても非公開にする
 */
async function mountTalk(dir, http, outside) {
  const infoOf = (talk) => ({ ...publicInfo(dir, talk), ...(outside && { public: false }) })
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
  let info = infoOf(talk)
  if (info.slug !== slug) {
    await vite.close()
    slug = info.slug
    vite = await make(slug)
    talk = await loadTalk(vite)
  }
  const t = { dir, info, vite, firstScene: talk.scenes[0].id, og: null, outside }
  // トークのファイルが変わったら、表紙を撮り直す。一覧の名前や日付も読み直す
  vite.watcher.on('change', async () => {
    t.og = null
    try {
      const fresh = await loadTalk(vite)
      t.info = infoOf(fresh)
      t.firstScene = fresh.scenes[0].id
    } catch {}
  })
  return t
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}
