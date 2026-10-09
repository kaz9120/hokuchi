#!/usr/bin/env node
// hokuchi studio。発信の準備をまとめて扱う、ローカルの制作アプリ (ADR-0030, ADR-0035)
//
//   bun run studio           ホーム (http://localhost:5300/)。一覧から、発表資料の編集画面に移る
//   bun run studio <talk>    同じものを立て、そのトークの編集画面の URL を出す
//
// 同じプロセスの中で、サイト全体の開発サーバ (http://localhost:5280/) も立てる。プレビューはそこから描く。
// 長く動くので、別ターミナルで立てる。
import { createServer as createHttpServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer as createViteServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium } from 'playwright'
import { parseStoryboard, replaceNotes } from '../../packages/stage/node/storyboard.mjs'
import { loadTalk, waitReady } from '../../packages/stage/node/talk.mjs'
import { startSite } from '../slides/site-server.mjs'
import { ClaudeSession } from './claude.mjs'
import { PRIVATE, createWork, listSeeds, listWorks, readWork, saveSeed, saveWork } from './store.mjs'
import { listNotes, noteAsset, readNote } from './notes.mjs'
import { TASKS, ask } from './ai.mjs'

const here = import.meta.dirname
const repoRoot = resolve(here, '../..')
// ポートは環境変数で変えられる。別の studio が動いているときに、試しに立てるため
const PORT = Number(process.env.HOKUCHI_STUDIO_PORT ?? 5300)
const SITE_PORT = Number(process.env.HOKUCHI_SITE_PORT ?? 5280)

const browser = await chromium.launch({ channel: 'chrome' })
let site
try {
  site = await startSite({ port: SITE_PORT, browser, quiet: true })
} catch (e) {
  console.error(e.message)
  await browser.close()
  process.exit(1)
}

// ---------------------------------------------------------------- 画面への通知 (Server-Sent Events)
// 接続ごとに、見ている画面 (ホームか、どのトークか) を持つ
const clients = new Set() // { res, slug }
function broadcast(slug, type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) if (c.slug === slug) c.res.write(msg)
}

// ---------------------------------------------------------------- トークの作業場
// 撮影・ファイルの監視・Claude の会話は、編集画面を開いたときに初めて立てる
class Workspace {
  constructor(slug, entry) {
    this.slug = slug
    this.entry = entry // サイトの開発サーバが持つトーク (dir・vite・info)
    this.dir = entry.dir
    this.boardFile = join(this.dir, 'storyboard.md')
    this.stageUrl = `${site.url}/${slug}/`
    this.thumbs = new Map() // 'scene-step' → JPEG
    this.thumbsVersion = 0
    this.shooting = null
    this.checking = false
    this.page = null
    this.pageErrors = []
    this.claude = new ClaudeSession({ repoRoot, talkDir: this.dir, onEvent: (ev) => broadcast(slug, 'chat', ev) })
    let timer = null
    this.watcher = watch(this.dir, { recursive: true }, (_, file) => {
      if (!file || file.startsWith('out')) return
      clearTimeout(timer)
      timer = setTimeout(async () => {
        // モジュールのキャッシュを捨ててから読み直す
        this.entry.vite.moduleGraph.invalidateAll()
        broadcast(slug, 'board', await this.state())
        this.shoot()
      }, 900)
    })
    this.shoot()
  }

  async state() {
    const md = existsSync(this.boardFile) ? readFileSync(this.boardFile, 'utf8') : ''
    let scenes = []
    let loadError = null
    try {
      const talk = await loadTalk(this.entry.vite)
      scenes = talk.scenes.map((s) => ({ id: s.id, steps: s.steps }))
    } catch (e) {
      loadError = String(e.message ?? e)
    }
    const { name, date, tag, title } = this.entry.info
    return { talk: { slug: this.slug, name, date, tag, title }, board: parseStoryboard(md), scenes, loadError, thumbsVersion: this.thumbsVersion, stageUrl: this.stageUrl }
  }

  shoot() {
    if (this.shooting) return this.shooting
    this.shooting = (async () => {
      this.pageErrors.length = 0
      try {
        if (!this.page) {
          this.page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
          this.page.on('pageerror', (e) => this.pageErrors.push(String(e)))
        }
        await this.page.goto(`${this.stageUrl}?shot=all`)
        await waitReady(this.page)
        this.thumbs.clear()
        for (const el of await this.page.$$('[data-frame]')) {
          const name = (await el.getAttribute('data-frame')).replace('/', '-')
          this.thumbs.set(name, await el.screenshot({ type: 'jpeg', quality: 80 }))
        }
        this.thumbsVersion++
        broadcast(this.slug, 'thumbs', { version: this.thumbsVersion, errors: this.pageErrors })
      } catch (e) {
        broadcast(this.slug, 'thumbs', { version: this.thumbsVersion, errors: [...this.pageErrors, String(e.message ?? e)] })
      } finally {
        this.shooting = null
      }
    })()
    return this.shooting
  }

  check() {
    if (this.checking) return
    this.checking = true
    broadcast(this.slug, 'check', { running: true })
    const p = spawn('node', [join(repoRoot, 'packages/stage/cli.mjs'), 'check', this.dir], { cwd: repoRoot })
    p.on('close', () => {
      this.checking = false
      const report = join(this.dir, 'out', 'check.md')
      broadcast(this.slug, 'check', { running: false, report: existsSync(report) ? readFileSync(report, 'utf8') : '' })
    })
  }

  saveNotes(scene, state, text) {
    writeFileSync(this.boardFile, replaceNotes(readFileSync(this.boardFile, 'utf8'), scene, state, text))
  }

  async close() {
    this.watcher.close()
    this.claude.stop()
    await this.page?.close()
  }
}

const workspaces = new Map()
function workspace(slug) {
  if (!workspaces.has(slug)) {
    const entry = site.talks.get(slug)
    if (!entry) return null
    workspaces.set(slug, new Workspace(slug, entry))
  }
  return workspaces.get(slug)
}

// ---------------------------------------------------------------- ホームの一覧
function home() {
  const talks = [...site.talks.entries()]
    .map(([slug, t]) => {
      const md = existsSync(join(t.dir, 'storyboard.md')) ? readFileSync(join(t.dir, 'storyboard.md'), 'utf8') : ''
      const board = md ? parseStoryboard(md) : null
      return {
        slug,
        name: t.info.name,
        title: t.info.title,
        date: t.info.date,
        tag: t.info.tag,
        event: t.info.event?.name ?? null,
        public: t.info.public,
        scenes: board?.scenes.length ?? 0,
        states: board?.scenes.reduce((n, s) => n + s.states.length, 0) ?? 0,
        open: workspaces.has(slug),
        siteUrl: `${site.url}/${slug}/`,
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const tasks = Object.fromEntries(Object.entries(TASKS).map(([k, t]) => [k, t.label]))
  return { talks, notes: listNotes(repoRoot), works: listWorks(), seeds: listSeeds(), tasks, siteUrl: `${site.url}/`, privateDir: PRIVATE }
}

// ---------------------------------------------------------------- UI と API
const server = createHttpServer()
// 画面の HMR は、studio の http サーバに相乗りする
const ui = await createViteServer({
  configFile: false,
  root: join(here, 'ui'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': join(here, 'ui') } },
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: { server } },
  appType: 'spa',
})

const json = (res, data, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}
const body = (req) =>
  new Promise((ok) => {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => ok(s ? JSON.parse(s) : {}))
  })

server.on('request', async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/api/home') return json(res, home())
    if (url.pathname === '/api/events') {
      const slug = url.searchParams.get('talk')
      const ws = slug ? workspace(slug) : null
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      if (ws) res.write(`event: chat-history\ndata: ${JSON.stringify(ws.claude.transcript)}\n\n`)
      const c = { res, slug }
      clients.add(c)
      req.on('close', () => clients.delete(c))
      return
    }
    // 作品 (企画シート) とネタ。置き場はリポジトリの外 (store.mjs)
    if (url.pathname === '/api/works' && req.method === 'POST') {
      const { kind, seedId } = await body(req)
      return json(res, createWork(kind === 'talk' ? 'talk' : 'note', seedId))
    }
    const w = url.pathname.match(/^\/api\/works\/([^/]+)(?:\/(ask))?$/)
    if (w) {
      const id = decodeURIComponent(w[1])
      const brief = readWork(id)
      if (!brief) return json(res, { error: `作品 ${id} がありません` }, 404)
      if (!w[2] && req.method === 'GET') return json(res, brief)
      if (!w[2] && req.method === 'PUT') return json(res, saveWork(id, await body(req)))
      if (w[2] === 'ask' && req.method === 'POST') {
        const { task } = await body(req)
        const items = await ask(brief, task, { cwd: repoRoot })
        // 出した候補は企画シートに残す。あとで見返せるように
        const latest = readWork(id)
        saveWork(id, { candidates: { ...(latest.candidates ?? {}), [task]: { at: new Date().toISOString(), items } } })
        return json(res, { items })
      }
    }
    if (url.pathname === '/api/seeds' && req.method === 'POST') return json(res, saveSeed(await body(req)))
    // 公開済みの note の記事。/api/notes/<dir> が本文、/api/notes/<dir>/assets/… が画像
    const n = url.pathname.match(/^\/api\/notes\/([^/]+)(?:\/(.+))?$/)
    if (n) {
      const dir = decodeURIComponent(n[1])
      if (!n[2]) {
        const note = readNote(repoRoot, dir)
        return note ? json(res, note) : json(res, { error: 'not found' }, 404)
      }
      const file = noteAsset(repoRoot, dir, decodeURIComponent(n[2]))
      if (!file) return json(res, { error: 'not found' }, 404)
      const ext = n[2].split('.').pop().toLowerCase()
      res.writeHead(200, { 'content-type': { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] ?? 'application/octet-stream' })
      return res.end(file)
    }
    // /api/talks/<slug>/<操作>
    const m = url.pathname.match(/^\/api\/talks\/([^/]+)\/(.+)$/)
    if (m) {
      const ws = workspace(decodeURIComponent(m[1]))
      if (!ws) return json(res, { error: `トーク「${m[1]}」がありません` }, 404)
      const op = m[2]
      if (op === 'state') return json(res, await ws.state())
      if (op.startsWith('thumb/')) {
        const img = ws.thumbs.get(decodeURIComponent(op.slice('thumb/'.length)))
        if (!img) return json(res, { error: 'not found' }, 404)
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
        return res.end(img)
      }
      if (op === 'note' && req.method === 'PUT') {
        const { scene, state, text } = await body(req)
        ws.saveNotes(scene, state, text)
        return json(res, { ok: true })
      }
      if (op === 'chat' && req.method === 'POST') {
        ws.claude.send((await body(req)).text)
        return json(res, { ok: true })
      }
      if (op === 'check' && req.method === 'POST') {
        ws.check()
        return json(res, { ok: true })
      }
      if (op === 'shoot' && req.method === 'POST') {
        ws.shoot()
        return json(res, { ok: true })
      }
      return json(res, { error: 'not found' }, 404)
    }
    ui.middlewares(req, res)
  } catch (e) {
    json(res, { error: String(e.message ?? e) }, 500)
  }
})

// 引数でトークを指定したら、その編集画面の URL を出す
const arg = process.argv[2]
const picked = arg ? [...site.talks.entries()].find(([slug, t]) => slug === arg || t.info.name.startsWith(arg) || t.dir === resolve(process.cwd(), arg)) : null
if (arg && !picked) console.warn(`「${arg}」に当たるトークがありません。ホームから選んでください`)

server.listen(PORT, () => {
  console.log(`\n  hokuchi studio   http://localhost:${PORT}/`)
  if (picked) console.log(`  編集画面         http://localhost:${PORT}/talks/${picked[0]}`)
  console.log(`  サイト           ${site.url}/  (studio の中で立てています)\n`)
})

const shutdown = async () => {
  for (const ws of workspaces.values()) await ws.close()
  await site.close()
  await browser.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
