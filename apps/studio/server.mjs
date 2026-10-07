#!/usr/bin/env node
// hokuchi studio。絵コンテを見ながら、Claude とチャットして発表資料を作るローカルの制作アプリ (ADR-0030)
//
//   bun run studio <talk>    <talk> は talks/ の中の名前の先頭 (例: 2026_09_29) かパス。省略すると最新のトーク
//
// 長く動くので、別ターミナルで立てる。
import { createServer as createHttpServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer as createViteServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'
import { stageConfig } from '../../packages/stage/node/vite.mjs'
import { parseStoryboard, replaceNotes } from '../../packages/stage/node/storyboard.mjs'
import { isTalkDir, loadTalk, talkInfo, waitReady } from '../../packages/stage/node/talk.mjs'
import { ClaudeSession } from './claude.mjs'

const here = import.meta.dirname
const repoRoot = resolve(here, '../..')
const PORT = 5300
const STAGE_PORT = 5281

// ---------------------------------------------------------------- 対象のトーク
function findTalk(arg) {
  const talks = join(repoRoot, 'talks')
  if (arg && existsSync(resolve(process.cwd(), arg))) return resolve(process.cwd(), arg)
  const names = readdirSync(talks).filter((n) => !n.startsWith('_') && isTalkDir(join(talks, n)))
  const hits = arg ? names.filter((n) => n.startsWith(arg)) : names.sort().slice(-1)
  if (hits.length !== 1) {
    console.error(hits.length ? `「${arg}」に当たるトークが複数あります: ${hits.join(', ')}` : `トークが見つかりません: ${arg ?? ''}`)
    process.exit(1)
  }
  return join(talks, hits[0])
}
const talkDir = findTalk(process.argv[2])
const boardFile = join(talkDir, 'storyboard.md')

// ---------------------------------------------------------------- 画面への通知 (Server-Sent Events)
const clients = new Set()
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(msg)
}

// ---------------------------------------------------------------- トークの開発サーバと、描画の撮影
const stage = await createViteServer(stageConfig(talkDir, { port: STAGE_PORT }))
await stage.listen()
const stageUrl = stage.resolvedUrls.local[0]

const thumbs = new Map() // 'scene-step' → PNG
let thumbsVersion = 0
let shooting = null
const browser = await chromium.launch({ channel: 'chrome' })
const shotPage = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const pageErrors = []
shotPage.on('pageerror', (e) => pageErrors.push(String(e)))

async function shoot() {
  if (shooting) return shooting
  shooting = (async () => {
    pageErrors.length = 0
    try {
      await shotPage.goto(`${stageUrl}?shot=all`)
      await waitReady(shotPage)
      thumbs.clear()
      for (const el of await shotPage.$$('[data-frame]')) {
        const name = (await el.getAttribute('data-frame')).replace('/', '-')
        thumbs.set(name, await el.screenshot({ type: 'jpeg', quality: 80 }))
      }
      thumbsVersion++
      broadcast('thumbs', { version: thumbsVersion, errors: pageErrors })
    } catch (e) {
      broadcast('thumbs', { version: thumbsVersion, errors: [...pageErrors, String(e.message ?? e)] })
    } finally {
      shooting = null
    }
  })()
  return shooting
}

async function boardState() {
  const md = existsSync(boardFile) ? readFileSync(boardFile, 'utf8') : ''
  let scenes = []
  let loadError = null
  try {
    const talk = await loadTalk(stage)
    scenes = talk.scenes.map((s) => ({ id: s.id, steps: s.steps }))
  } catch (e) {
    loadError = String(e.message ?? e)
  }
  return { talk: talkInfo(talkDir), board: parseStoryboard(md), scenes, loadError, thumbsVersion, stageUrl }
}

// ファイルの変更を見張り、絵コンテが変われば画面へ知らせ、描画を撮り直す
let timer = null
watch(talkDir, { recursive: true }, (_, file) => {
  if (!file || file.startsWith('out')) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    // モジュールのキャッシュを捨ててから読み直す
    stage.moduleGraph.invalidateAll()
    broadcast('board', await boardState())
    shoot()
  }, 900)
})

// ---------------------------------------------------------------- 検査
let checking = false
function runCheck() {
  if (checking) return
  checking = true
  broadcast('check', { running: true })
  const p = spawn('node', [join(repoRoot, 'packages/stage/cli.mjs'), 'check', talkDir], { cwd: repoRoot })
  p.on('close', () => {
    checking = false
    const report = join(talkDir, 'out', 'check.md')
    broadcast('check', { running: false, report: existsSync(report) ? readFileSync(report, 'utf8') : '' })
  })
}

// ---------------------------------------------------------------- Claude
const claude = new ClaudeSession({ repoRoot, talkDir, onEvent: (ev) => broadcast('chat', ev) })

// ---------------------------------------------------------------- UI と API
const ui = await createViteServer({
  configFile: false,
  root: join(here, 'ui'),
  plugins: [react()],
  logLevel: 'warn',
  server: { middlewareMode: true },
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

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.write(`event: chat-history\ndata: ${JSON.stringify(claude.transcript)}\n\n`)
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (url.pathname === '/api/state') return json(res, await boardState())
    if (url.pathname.startsWith('/api/thumb/')) {
      const png = thumbs.get(decodeURIComponent(url.pathname.slice('/api/thumb/'.length)))
      if (!png) return json(res, { error: 'not found' }, 404)
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
      return res.end(png)
    }
    if (url.pathname === '/api/note' && req.method === 'PUT') {
      const { scene, state, text } = await body(req)
      writeFileSync(boardFile, replaceNotes(readFileSync(boardFile, 'utf8'), scene, state, text))
      return json(res, { ok: true })
    }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const { text } = await body(req)
      claude.send(text)
      return json(res, { ok: true })
    }
    if (url.pathname === '/api/check' && req.method === 'POST') {
      runCheck()
      return json(res, { ok: true })
    }
    if (url.pathname === '/api/shoot' && req.method === 'POST') {
      shoot()
      return json(res, { ok: true })
    }
    ui.middlewares(req, res)
  } catch (e) {
    json(res, { error: String(e.message ?? e) }, 500)
  }
})
server.listen(PORT, () => {
  console.log(`\n  hokuchi studio  http://localhost:${PORT}`)
  console.log(`  トーク          ${talkDir.replace(repoRoot + '/', '')}`)
  console.log(`  プレビュー      ${stageUrl}\n`)
})
shoot()

const shutdown = async () => {
  claude.stop()
  await browser.close()
  await stage.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
