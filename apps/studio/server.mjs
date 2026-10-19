#!/usr/bin/env node
// hokuchi studio。発信の準備をまとめて扱う、ローカルの制作アプリ (ADR-0030, ADR-0035)
//
//   bun run studio           ホーム (http://localhost:5300/)。一覧から、発表資料の編集画面に移る
//   bun run studio <talk>    同じものを立て、そのトークの編集画面の URL を出す
//
// 同じプロセスの中で、サイト全体の開発サーバ (http://localhost:5280/) も立てる。プレビューはそこから描く。
// トークは、リポジトリの talks/ と、公開リポジトリの外の <HOKUCHI_PRIVATE>/talks/ の両方から読む (ADR-0041)。
// 長く動くので、別ターミナルで立てる。
import { createServer as createHttpServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer as createViteServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium } from 'playwright'
import { moveScene, parseStoryboard, replaceNotes, replaceSceneMeta, seconds } from '../../packages/stage/node/storyboard.mjs'
import { SITE, loadTalk, waitReady } from '../../packages/stage/node/talk.mjs'
import { startSite } from '../slides/site-server.mjs'
import { NOTE_KINDS, NOTE_SURVEY, SURVEY, listPersonas, listReaders, listReads, runNoteRead, runRead, saveReaders } from './readers.mjs'
import { closeThread, importRead, openThread, readThreads, reopenThread, replyThread, retargetThreads } from './threads.mjs'
import { SLUG, appendBlock, createDraft, draftDir, draftFile, hasDraft, readDraft, readOutline, reanchor, replaceBlock, reviseFromArchive, saveOutline, setMeta } from './draft.mjs'
import { toPasteText } from '../../tools/notes/src/paste.mjs'
import { PRIVATE, createWork, listSeeds, listWorks, readWork, saveSeed, saveWork, trashWork, workOfTalk } from './store.mjs'
import { listNotes, noteAsset, notesRoot, readNote } from './notes.mjs'
import { TASKS, ask } from './ai.mjs'

const here = import.meta.dirname
const repoRoot = resolve(here, '../..')
// ポートは環境変数で変えられる。別の studio が動いているときに、試しに立てるため
const PORT = Number(process.env.HOKUCHI_STUDIO_PORT ?? 5300)
const SITE_PORT = Number(process.env.HOKUCHI_SITE_PORT ?? 5280)

const browser = await chromium.launch({ channel: 'chrome' })
let site
try {
  site = await startSite({ port: SITE_PORT, browser, quiet: true, moreTalkDirs: [join(PRIVATE, 'talks')] })
} catch (e) {
  console.error(e.message)
  await browser.close()
  process.exit(1)
}

/** 画面と依頼文に出すトークの場所。リポジトリの中は相対パス、外 (社内向けの発表) は絶対パスにする */
const shownDir = (dir) => (dir.startsWith(repoRoot + sep) ? relative(repoRoot, dir) : dir)

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
    this.feedbackFile = join(this.dir, 'feedback.yaml')
    this.stageUrl = `${site.url}/${slug}/`
    this.thumbs = new Map() // 'scene-step' → JPEG
    this.thumbsVersion = 0
    this.shooting = null
    this.checking = false
    this.page = null
    this.pageErrors = []
    this.reading = null // 聴衆役に読んでもらっている間の進み具合 { done, total, failed }
    let timer = null
    // 指摘や読みのファイルだけが変わったときは、絵を撮り直さない (絵は変わらないため)
    let redraw = false
    this.watcher = watch(this.dir, { recursive: true }, (_, file) => {
      if (!file || file.startsWith('out')) return
      if (!/^(feedback\.yaml|readers\.yaml|reads[\\/]|archive[\\/])/.test(file)) redraw = true
      clearTimeout(timer)
      timer = setTimeout(async () => {
        if (redraw) {
          // モジュールのキャッシュを捨ててから読み直す
          this.entry.vite.moduleGraph.invalidateAll()
          this.shoot()
        }
        redraw = false
        broadcast(slug, 'board', await this.state())
      }, redraw ? 900 : 150)
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
    const board = parseStoryboard(md)
    const personas = listPersonas(repoRoot)
    const readers = listReaders(this.dir)
      .map((r) => ({ ...personas.find((p) => p.id === r.persona), why: r.why ?? '' }))
      .filter((r) => r.id)
    const w = workOfTalk(this.slug)
    return {
      talk: { slug: this.slug, name, date, tag, title, dir: shownDir(this.dir), outside: this.entry.outside, event: this.entry.info.event?.name ?? null, minutes: seconds(board.meta['持ち時間'] ?? '') },
      board,
      scenes,
      loadError,
      thumbsVersion: this.thumbsVersion,
      stageUrl: this.stageUrl,
      ...readThreads(this.feedbackFile),
      reads: listReads(this.dir),
      reading: this.reading,
      readers,
      survey: SURVEY,
      noteKinds: NOTE_KINDS,
      work: w ? { id: w.id, oneLiner: w.fields?.oneLiner ?? '' } : null,
    }
  }

  /** 絵コンテを書き換える。ファイルの監視が、画面への通知と撮り直しをする */
  rewrite(fn) {
    writeFileSync(this.boardFile, fn(readFileSync(this.boardFile, 'utf8')))
  }

  /** 聴衆役に読んでもらう (ADR-0039)。数分かかるので裏で走らせ、進み具合を画面に知らせる */
  read() {
    if (this.reading) return
    this.reading = { done: 0, total: listReaders(this.dir).length, failed: [] }
    broadcast(this.slug, 'reading', this.reading)
    runRead({
      repoRoot,
      talkDir: this.dir,
      onProgress: (p) => {
        this.reading = p
        broadcast(this.slug, 'reading', p)
      },
    })
      .then((read) => importRead(this.feedbackFile, read))
      .catch((e) => broadcast(this.slug, 'reading', { ...this.reading, error: String(e.message ?? e) }))
      .finally(async () => {
        this.reading = null
        broadcast(this.slug, 'board', await this.state())
      })
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
  const notes = listNotes(repoRoot)
  const tasks = Object.fromEntries(Object.entries(TASKS).map(([k, t]) => [k, t.label]))
  // 作品に、紐づくトークの様子 (場面の数・あなたが答える指摘の数) を載せる。ホームは作品 1 枚で見せる (ADR-0040)
  const works = listWorks().map((w) => {
    const t = w.talk ? site.talks.get(w.talk) : null
    if (!t) return w
    const item = talks.find((x) => x.slug === w.talk)
    const { threads } = readThreads(join(t.dir, 'feedback.yaml'))
    return { ...w, talkInfo: { ...item, mine: threads.filter((x) => x.ball === '話者').length, claude: threads.filter((x) => x.ball === 'Claude').length, reads: listReads(t.dir).length } }
  }).map((w) => (w.kind === 'note' && hasDraft(w.note) ? { ...w, draftInfo: draftInfo(w.note) } : w))

  // 発表と記事を 1 つの一覧にする (ADR-0043)。企画シートが公開物に紐づいていれば 1 枚にまとめる。
  // 状態は 2 つの軸で持つ (ADR-0045)。公開範囲は実物から決め、進み具合は企画シートの finishedAt で決める。公開したものは完成として扱う。
  // ただし、公開済みの記事を改稿している (原稿がある) あいだは下書きとして見せる (ADR-0047)
  const item = ({ work = null, talk = null, note = null, kind }) => {
    const visibility = talk?.public || note ? 'public' : 'private'
    const revising = visibility === 'public' && !!work?.draftInfo
    return {
      key: work ? `work:${work.id}` : talk ? `talk:${talk.slug}` : `note:${note.dir}`,
      kind,
      progress: revising ? 'draft' : visibility === 'public' || work?.finishedAt ? 'finished' : 'draft',
      visibility,
      title: work?.title || talk?.title || note?.title || '',
      date: talk?.date ?? note?.publishedAt ?? work?.fields?.date ?? null,
      event: talk?.event ?? work?.fields?.event ?? null,
      tags: note?.tags ?? [],
      updatedAt: work?.updatedAt ?? null,
      work,
      talk,
      note,
    }
  }
  const usedTalks = new Set()
  const usedNotes = new Set()
  const items = works.map((w) => {
    const note = w.kind === 'note' ? noteOfWork(w, notes) : null
    if (w.talkInfo) usedTalks.add(w.talk)
    if (note) usedNotes.add(note.dir)
    return item({ work: w, talk: w.talkInfo ?? null, note, kind: w.kind })
  })
  for (const t of talks) if (!usedTalks.has(t.slug)) items.push(item({ talk: t, kind: 'talk' }))
  for (const n of notes) if (!usedNotes.has(n.dir)) items.push(item({ note: n, kind: 'note' }))
  // 下書きを上に (触った順)。そのあとに完成したものを、日付の新しい順に
  items.sort((a, b) => {
    if ((a.progress === 'draft') !== (b.progress === 'draft')) return a.progress === 'draft' ? -1 : 1
    const [x, y] = a.progress === 'draft' ? [a.updatedAt, b.updatedAt] : [a.date, b.date]
    return (x ?? '') < (y ?? '') ? 1 : -1
  })
  // 「サイトを開く」は本番を開く。サイトに載っているものだけが見える (ADR-0044)
  return { items, seeds: listSeeds(), tasks, siteUrl: `${SITE}/`, privateDir: PRIVATE }
}

/** 記事の作品に紐づく、アーカイブの記事。企画シートの note は記事の slug (articles/note/<公開日>-<slug>/ の slug) */
const noteOfWork = (w, notes = listNotes(repoRoot)) => (w.note ? (notes.find((n) => n.dir.slice(11) === w.note) ?? null) : null)

/** 作品が公開されているか。発表はサイトに載るトーク、記事は note のアーカイブにあるもの (ADR-0043) */
const isPublished = (w) => (w.kind === 'talk' ? site.talks.get(w.talk ?? '')?.info.public === true : !!noteOfWork(w))

/** 作品に紐づく、リポジトリの中のファイル (talks/ のトーク・記事の原稿)。削除しても残す (ADR-0044) */
function repoFilesOf(w) {
  const t = w.talk ? site.talks.get(w.talk) : null
  return t && !t.outside ? [shownDir(t.dir)] : []
}

/** 作品の画面に渡す企画シート。published と repoFiles はサーバが実物から決めた値で、企画シートには書かない */
const workView = (w) => {
  const published = isPublished(w)
  // revising は、公開済みの記事を原稿で改稿しているか (ADR-0047)。そのあいだは進み具合を下書きとして見せる
  return { ...w, published, revising: published && w.kind === 'note' && hasDraft(w.note), repoFiles: repoFilesOf(w), trashDir: join(PRIVATE, 'trash') }
}

/** 下書きを削除する。企画シートと、リポジトリの外のトークをごみ箱に移す。完成した作品と公開した作品は削除できない (ADR-0044・ADR-0045) */
async function deleteWork(w) {
  if (isPublished(w) || w.finishedAt) throw new Error('削除できるのは下書きだけです')
  const t = w.talk ? site.talks.get(w.talk) : null
  const outside = t?.outside ? t : null
  // 動いているトークの作業場とサーバを止めてから移す
  if (outside) {
    await workspaces.get(w.talk)?.close()
    workspaces.delete(w.talk)
    await outside.vite.close()
    site.talks.delete(w.talk)
  }
  const note = w.kind === 'note' && hasDraft(w.note) ? w.note : null
  if (note) {
    draftWatchers.get(note)?.close()
    draftWatchers.delete(note)
  }
  return trashWork(w.id, { talkDir: outside?.dir ?? null, noteDir: note ? draftDir(note) : null })
}

// ---------------------------------------------------------------- 記事の原稿 (ADR-0046)
// 原稿は <HOKUCHI_PRIVATE>/notes/<slug>/。画面への通知は、発表と同じ仕組みに "note:<slug>" の名前で乗せる
const draftWatchers = new Map()
function watchDraft(slug) {
  if (draftWatchers.has(slug) || !hasDraft(slug)) return
  let timer = null
  const w = watch(draftDir(slug), { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        broadcast(`note:${slug}`, 'draft', draftState(slug))
      } catch {}
    }, 150)
  })
  draftWatchers.set(slug, w)
}

const feedbackOf = (slug) => join(draftDir(slug), 'feedback.yaml')

/** 原稿の画面に渡すもの。Claude Code が本文を直して段落の番号がずれていたら、指摘を書き出しで付け直してから渡す */
function draftState(slug) {
  const d = readDraft(slug)
  retargetThreads(feedbackOf(slug), reanchor(d.blocks))
  const w = listWorks().find((x) => x.note === slug)
  const personas = listPersonas(repoRoot)
  return {
    slug,
    dir: shownDir(draftDir(slug)),
    file: shownDir(draftFile(slug)),
    ...d,
    ...readThreads(feedbackOf(slug)),
    outline: readOutline(slug),
    noteKinds: NOTE_KINDS,
    survey: NOTE_SURVEY,
    readers: listReaders(draftDir(slug))
      .map((r) => ({ ...personas.find((p) => p.id === r.persona), why: r.why ?? '' }))
      .filter((r) => r.id),
    personas: personas.map(({ id, name, label, who, troubles, knows, pushback }) => ({ id, name, label, who, troubles, knows, pushback })),
    reads: listReads(draftDir(slug)),
    reading: draftReading.get(slug) ?? null,
    work: w ? { id: w.id, oneLiner: w.fields?.oneLiner ?? '', candidates: w.candidates ?? {} } : null,
  }
}

/** 聴衆役に記事を読んでもらう (ADR-0046)。数分かかるので裏で走らせ、進み具合を画面に知らせる */
const draftReading = new Map()
function readDraftByReaders(slug) {
  if (draftReading.has(slug)) return
  const notify = (p) => {
    draftReading.set(slug, p)
    broadcast(`note:${slug}`, 'reading', p)
  }
  notify({ done: 0, total: listReaders(draftDir(slug)).length, failed: [] })
  const d = readDraft(slug)
  runNoteRead({ repoRoot, dir: draftDir(slug), title: d.title, blocks: d.blocks, onProgress: notify })
    .then((read) => importRead(feedbackOf(slug), read))
    .catch((e) => broadcast(`note:${slug}`, 'reading', { ...draftReading.get(slug), error: String(e.message ?? e) }))
    .finally(() => {
      draftReading.delete(slug)
      broadcast(`note:${slug}`, 'draft', draftState(slug))
    })
}

/** 原稿のタイトルを変える。タイトルの正は原稿の front matter で、紐づく企画シートの title も揃える (ADR-0046) */
function setDraftTitle(slug, title) {
  setMeta(slug, { title })
  const w = listWorks().find((x) => x.note === slug)
  if (w && w.title !== title) saveWork(w.id, { title })
}

/** ホームのカードに出す、原稿の様子 */
function draftInfo(slug) {
  const { threads } = readThreads(feedbackOf(slug))
  const { stats, blocks } = readDraft(slug)
  return {
    slug,
    chars: stats.chars,
    paragraphs: stats.paragraphs,
    blocks: blocks.length,
    outline: readOutline(slug).sections.length,
    reads: listReads(draftDir(slug)).length,
    mine: threads.filter((x) => x.ball === '話者').length,
    claude: threads.filter((x) => x.ball === 'Claude').length,
  }
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
      const note = url.searchParams.get('note')
      if (note) watchDraft(note)
      const slug = note ? `note:${note}` : url.searchParams.get('talk')
      const ws = slug && !note ? workspace(slug) : null
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
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
    const w = url.pathname.match(/^\/api\/works\/([^/]+)(?:\/(ask|draft))?$/)
    if (w) {
      const id = decodeURIComponent(w[1])
      const brief = readWork(id)
      if (!brief) return json(res, { error: `作品（${id}）が見つかりません` }, 404)
      // published は実物から決めた値で、企画シートには書かない
      if (!w[2] && req.method === 'GET') return json(res, workView(brief))
      if (!w[2] && req.method === 'PUT') {
        const { published, repoFiles, trashDir, ...next } = await body(req)
        return json(res, workView(saveWork(id, next)))
      }
      if (!w[2] && req.method === 'DELETE') {
        try {
          return json(res, { trash: await deleteWork(brief) })
        } catch (e) {
          return json(res, { error: String(e.message ?? e) }, 400)
        }
      }
      // 記事の原稿を作る。slug を決めて index.md を作り、企画シートの note に書く (ADR-0046)
      if (w[2] === 'draft' && req.method === 'POST') {
        const { slug } = await body(req)
        const s = String(slug ?? '').trim()
        try {
          if (brief.kind !== 'note') throw new Error('原稿を作れるのは記事だけです')
          if (brief.note && hasDraft(brief.note)) throw new Error(`この記事には原稿（${brief.note}）があります`)
          if (listNotes(repoRoot).some((n) => n.dir.slice(11) === s)) throw new Error(`「${s}」は公開済みの記事で使っています。別の slug にしてください`)
          createDraft(s, brief.title)
        } catch (e) {
          return json(res, { error: String(e.message ?? e) }, 400)
        }
        return json(res, workView(saveWork(id, { note: s })))
      }
      if (w[2] === 'ask' && req.method === 'POST') {
        const { task } = await body(req)
        // 原稿を読んで出す依頼 (タイトルの案) には、原稿を渡す
        const draft = brief.kind === 'note' && hasDraft(brief.note) ? readFileSync(draftFile(brief.note), 'utf8') : null
        const items = await ask(brief, task, { cwd: repoRoot, draft })
        // 出した候補は企画シートに残す。あとで見返せるように
        const latest = readWork(id)
        saveWork(id, { candidates: { ...(latest.candidates ?? {}), [task]: { at: new Date().toISOString(), items } } })
        return json(res, { items })
      }
    }
    if (url.pathname === '/api/seeds' && req.method === 'POST') return json(res, saveSeed(await body(req)))
    // 記事の原稿 (ADR-0046)。/api/drafts/<slug>/<操作>
    const dr = url.pathname.match(/^\/api\/drafts\/([^/]+)\/(.+)$/)
    if (dr) {
      const slug = decodeURIComponent(dr[1])
      if (!SLUG.test(slug) || !hasDraft(slug)) return json(res, { error: `原稿（${slug}）が見つかりません` }, 404)
      const op = dr[2]
      if (op === 'state') {
        watchDraft(slug)
        return json(res, draftState(slug))
      }
      // 本文の画像 (assets/…)
      if (op.startsWith('assets/') && !op.includes('..')) {
        const file = join(draftDir(slug), decodeURIComponent(op))
        if (!existsSync(file)) return json(res, { error: 'not found' }, 404)
        const ext = op.split('.').pop().toLowerCase()
        res.writeHead(200, { 'content-type': { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[ext] ?? 'application/octet-stream' })
        return res.end(readFileSync(file))
      }
      // 段落を直す。画面で直した段落の指摘は、新しい書き出しで持ち直す。ほかは書き出しで付け直す
      if (op === 'block' && req.method === 'PUT') {
        const { n, orig, text } = await body(req)
        try {
          const { after } = replaceBlock(slug, Number(n), String(orig ?? ''), String(text ?? ''))
          const gone = !String(text ?? '').trim()
          const rest = reanchor(after)
          retargetThreads(feedbackOf(slug), (t) => (t.para === Number(n) ? (gone || !after[t.para - 1] ? { para: '*' } : { para: t.para, head: after[t.para - 1].head }) : rest(t)))
        } catch (e) {
          return json(res, { error: String(e.message ?? e) }, 409)
        }
        return json(res, { ok: true })
      }
      // 構成 (outline.yaml) を丸ごと書き換える
      if (op === 'outline' && req.method === 'PUT') {
        saveOutline(slug, (await body(req)).sections ?? [])
        return json(res, { ok: true })
      }
      // front matter (タイトル・タグ・見出し画像)。タイトルは企画シートにも揃える
      if (op === 'meta' && req.method === 'PUT') {
        const { title, tags, eyecatch } = await body(req)
        if (title !== undefined) setDraftTitle(slug, String(title).trim())
        if (tags !== undefined) setMeta(slug, { hashtags: (tags ?? []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean) })
        if (eyecatch !== undefined) setMeta(slug, { eyecatch: eyecatch || null })
        return json(res, { ok: true })
      }
      // 聴衆役の読み手を決める・読んでもらう
      if (op === 'readers' && req.method === 'PUT') {
        saveReaders(draftDir(slug), (await body(req)).readers ?? [])
        return json(res, { ok: true })
      }
      if (op === 'read' && req.method === 'POST') {
        readDraftByReaders(slug)
        return json(res, { ok: true })
      }
      // note に貼る本文 (tools/notes の paste と同じ)。画像の一覧も返す
      if (op === 'paste') return json(res, toPasteText(readFileSync(draftFile(slug), 'utf8')))
      // 画像を入れるときに、assets/ を Finder で開く
      if (op === 'open-assets' && req.method === 'POST') {
        if (process.platform === 'darwin') spawn('open', [join(draftDir(slug), existsSync(join(draftDir(slug), 'assets')) ? 'assets' : '')])
        return json(res, { ok: true })
      }
      if (op === 'append' && req.method === 'POST') {
        appendBlock(slug, String((await body(req)).text ?? ''))
        return json(res, { ok: true })
      }
      // 指摘のスレッド。位置は段落の番号と書き出し。記事全体は "*"
      if (op === 'threads' && req.method === 'POST') {
        const { para, text } = await body(req)
        if (!String(text ?? '').trim()) return json(res, { error: 'text が要ります' }, 400)
        const blocks = readDraft(slug).blocks
        const b = para === '*' ? null : blocks[Number(para) - 1]
        return json(res, { id: openThread(feedbackOf(slug), { para: b ? b.n : '*', head: b?.head, text: String(text).trim() }) })
      }
      const th = op.match(/^threads\/([^/]+)\/(reply|close|reopen)$/)
      if (th && req.method === 'POST') {
        const { text, how } = await body(req)
        if (th[2] === 'reply') {
          if (!String(text ?? '').trim()) return json(res, { error: 'text が要ります' }, 400)
          replyThread(feedbackOf(slug), th[1], String(text).trim())
        }
        if (th[2] === 'close') closeThread(feedbackOf(slug), th[1], how)
        if (th[2] === 'reopen') reopenThread(feedbackOf(slug), th[1])
        return json(res, { ok: true })
      }
      return json(res, { error: 'not found' }, 404)
    }
    // 公開済みの記事を改稿する (ADR-0047)。アーカイブを原稿に写し、企画シートに紐づける。アーカイブは読むだけ
    const rv = url.pathname.match(/^\/api\/notes\/([^/]+)\/revise$/)
    if (rv && req.method === 'POST') {
      const name = decodeURIComponent(rv[1])
      const note = listNotes(repoRoot).find((x) => x.dir === name)
      if (!note) return json(res, { error: `記事（${name}）が見つかりません` }, 404)
      try {
        const { slug } = reviseFromArchive(join(notesRoot(repoRoot), name), name)
        let w = listWorks().find((x) => x.note === slug)
        if (!w) w = saveWork(createWork('note').id, { title: readDraft(slug).title || note.title, note: slug })
        return json(res, { work: w.id, slug })
      } catch (e) {
        return json(res, { error: String(e.message ?? e) }, 400)
      }
    }
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
      if (!ws) return json(res, { error: `発表（${m[1]}）が見つかりません` }, 404)
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
      // 指摘のスレッド (ADR-0040)。書く・答える・閉じる・もう一度開く
      if (op === 'threads' && req.method === 'POST') {
        const { scene, state, text } = await body(req)
        if (!scene || !String(text ?? '').trim()) return json(res, { error: 'scene と text が要ります' }, 400)
        return json(res, { id: openThread(ws.feedbackFile, { scene, state: Number(state) || null, text: String(text).trim() }) })
      }
      const th = op.match(/^threads\/([^/]+)\/(reply|close|reopen)$/)
      if (th && req.method === 'POST') {
        const { text, how } = await body(req)
        if (th[2] === 'reply') {
          if (!String(text ?? '').trim()) return json(res, { error: 'text が要ります' }, 400)
          replyThread(ws.feedbackFile, th[1], String(text).trim())
        }
        if (th[2] === 'close') closeThread(ws.feedbackFile, th[1], how)
        if (th[2] === 'reopen') reopenThread(ws.feedbackFile, th[1])
        return json(res, { ok: true })
      }
      // シーンの情報 (伝えること・粗密) と並びを、話者が直す
      if (op === 'meta' && req.method === 'PUT') {
        const { scene, key, value } = await body(req)
        if (!['伝えること', '粗密'].includes(key)) return json(res, { error: `${key} は直せません` }, 400)
        ws.rewrite((md) => replaceSceneMeta(md, scene, key, String(value ?? '').trim()))
        return json(res, { ok: true })
      }
      if (op === 'move' && req.method === 'POST') {
        const { scene, dir } = await body(req)
        ws.rewrite((md) => moveScene(md, scene, Number(dir) < 0 ? -1 : 1))
        return json(res, { ok: true })
      }
      if (op === 'read' && req.method === 'POST') {
        ws.read()
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
