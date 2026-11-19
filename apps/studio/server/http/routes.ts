// API。ハンドラは薄く、中身は flow/service.ts に任せる
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, normalize, sep } from 'node:path'
import type { Studio } from '../flow/service.ts'
import { addNeta, listNeta, readNeta, trashNeta } from '../flow/service.ts'
import { personasList, readersOf } from '../flow/reads.ts'
import { places, repoRoot } from '../infra/config.ts'
import { notFound } from '../infra/errors.ts'
import { subscribe } from '../infra/events.ts'
import { eyecatchOf, pasteText } from '../media/notes.ts'
import { assetsDirOf, noteDir } from '../store/places.ts'
import { isWork, readWork, workDir } from '../store/works.ts'
import { createRouter, HANDLED, sendFile } from './router.ts'
import type { Sessions } from './sessions.ts'

export function routes(studio: Studio, sessions: Sessions) {
  const r = createRouter()
  const need = (id: string) => {
    if (!isWork(id)) throw notFound(`作品（${id}）が見つかりません`)
    return id
  }

  r.get('/api/health', () => ({ running: studio.conductor.activeCount() }))
  r.get('/api/home', () => studio.home())
  r.get('/api/shelf', () => studio.shelf())
  r.get('/api/events', ({ req, res, query }) => {
    const work = query.get('work')
    if (work) {
      need(work)
      subscribe(`work:${work}`, res)
      sessions.open(work)
    } else subscribe('home', res)
    req.on('close', () => {})
    return HANDLED
  })

  r.post('/api/works', async ({ body }) => {
    const b = await body<{ kind: 'note' | 'talk'; text: string; files?: { name: string; data: string }[]; seed?: string }>()
    return { id: studio.start(b.kind === 'talk' ? 'talk' : 'note', b.text ?? '', b.files ?? [], b.seed) }
  })
  r.get('/api/works/:id', ({ params }) => studio.view(need(params.id)))
  r.post('/api/works/:id/derive', ({ params }) => ({ id: studio.derive(params.id) }))
  r.post('/api/works/:id/say', async ({ params, body }) => {
    const b = await body()
    studio.say(need(params.id), { text: String(b.text ?? ''), files: b.files ?? [], anchors: b.anchors ?? [], mode: b.mode === 'interrupt' ? 'interrupt' : 'after' })
    return studio.view(params.id)
  })
  r.post('/api/works/:id/stop', ({ params }) => {
    studio.stop(need(params.id))
    return { ok: true }
  })
  r.post('/api/works/:id/press/:action', async ({ params, body }) => {
    await studio.press(need(params.id), params.action, await body())
    return studio.view(params.id)
  })
  r.put('/api/works/:id/paragraphs/:n', async ({ params, body }) => {
    const b = await body()
    studio.editParagraph(need(params.id), Number(params.n), String(b.text ?? ''), String(b.base ?? ''))
    return studio.view(params.id)
  })
  r.put('/api/works/:id/outline', async ({ params, body }) => {
    const b = await body()
    studio.editOutline(need(params.id), b.sections ?? [], String(b.base ?? ''))
    return studio.view(params.id)
  })
  r.put('/api/works/:id/koma/:scene/:n', async ({ params, body }) => {
    const b = await body()
    studio.editKoma(need(params.id), params.scene, Number(params.n), String(b.orig ?? ''), String(b.text ?? ''))
    return studio.view(params.id)
  })
  r.patch('/api/works/:id/proposals', async ({ params, body }) => {
    studio.editProposals(need(params.id), await body())
    return studio.view(params.id)
  })
  r.get('/api/works/:id/paste', ({ params }) => {
    const { work } = readWork(need(params.id))
    if (!work.note?.slug) throw notFound('原稿がありません')
    return { text: pasteText(work.note.slug) }
  })
  /** 作品の画像。原稿・トークの assets と、話者が貼った files */
  r.get('/api/works/:id/file/*path', ({ params, res }) => {
    const { work } = readWork(need(params.id))
    const rel = normalize(params.path)
    if (rel.startsWith('..') || rel.startsWith('/')) throw notFound('画像が見つかりません')
    const bases = [rel.startsWith('assets/') && work.note?.slug ? noteDir(work.note.slug) : null, rel.startsWith('assets/') ? (assetsDirOf(work) ? join(assetsDirOf(work)!, '..') : null) : null, workDir(work.id)].filter(Boolean) as string[]
    for (const base of bases) {
      const file = join(base, rel)
      if (file.startsWith(base + sep) && existsSync(file)) {
        sendFile(res, readFileSync(file), file, false)
        return HANDLED
      }
    }
    throw notFound('画像が見つかりません')
  })
  r.get('/api/works/:id/eyecatch', ({ params, res }) => {
    const file = eyecatchOf(readWork(need(params.id)).work)
    if (!file) throw notFound('見出し画像の下地がまだありません')
    sendFile(res, readFileSync(file), file, false)
    return HANDLED
  })
  r.get('/api/works/:id/thumbs/:scene/:n', ({ params, res }) => {
    const buf = sessions.thumb(need(params.id), params.scene, Number(params.n))
    if (!buf) throw notFound('縮小画像がまだありません')
    sendFile(res, buf, 'x.jpg', false)
    return HANDLED
  })
  r.get('/api/archive/:dir/*path', ({ params, res }) => {
    if (!/^\d{4}-\d{2}-\d{2}-[\w-]+$/.test(params.dir)) throw notFound('画像が見つかりません')
    const base = join(places.archive, params.dir)
    const file = normalize(join(base, params.path))
    if (!file.startsWith(base + sep) || !existsSync(file)) throw notFound('画像が見つかりません')
    sendFile(res, readFileSync(file), file)
    return HANDLED
  })

  r.get('/api/personas', () => personasList().map((p: any) => ({ id: p.id, name: p.name, label: p.label, who: p.who })))
  /** この作品で選べる読み手。企画で決めた読者・聴衆を先頭に並べる */
  r.get('/api/works/:id/personas', ({ params }) => personasList(readWork(need(params.id)).work).map((p: any) => ({ id: p.id, name: p.name, label: p.label, who: p.who, decided: p.id.startsWith('decided:') })))
  r.get('/api/works/:id/readers', ({ params }) => readersOf(readWork(need(params.id)).work))
  /** サイトの組み立てが見た目の変化で止まったときの、前後の画像 (apps/slides/.snapshots/_diff/) */
  r.get('/api/site-diff', () => {
    // build.mjs はトークごとのフォルダに前後の画像を置く (_diff/<トーク>/<状態>.before.png・.after.png)。前・後の順に並べる
    const dir = join(repoRoot, 'apps/slides/.snapshots/_diff')
    if (!existsSync(dir)) return []
    const img = (f: string) => /\.(png|jpe?g)$/i.test(f)
    const order = (f: string) => f.replace('.before.', '.0.').replace('.after.', '.1.')
    return readdirSync(dir, { withFileTypes: true })
      .flatMap((d) => (d.isDirectory() ? readdirSync(join(dir, d.name)).filter(img).map((f) => `${d.name}/${f}`) : img(d.name) ? [d.name] : []))
      .sort((a, b) => (order(a) < order(b) ? -1 : 1))
  })
  r.get('/api/site-diff/:talk/:file', ({ params, res }) => {
    const file = join(repoRoot, 'apps/slides/.snapshots/_diff', basename(params.talk), basename(params.file))
    if (!existsSync(file)) throw notFound('画像が見つかりません')
    sendFile(res, readFileSync(file), file, false)
    return HANDLED
  })
  r.get('/api/neta', () => listNeta())
  r.post('/api/neta', async ({ body }) => ({ file: addNeta(String((await body()).text ?? '')) }))
  r.get('/api/neta/:file', ({ params }) => ({ text: readNeta(params.file) }))
  r.delete('/api/neta/:file', ({ params }) => {
    trashNeta(params.file)
    return { ok: true }
  })
  return r
}
