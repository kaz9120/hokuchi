// API のハンドラ。入力を確かめ、ドメインを呼び、返すだけにする。契約は shared/api.ts の先頭の一覧
import { readFileSync } from 'node:fs'
import type { Action, ActionResult, BriefPatch, CreateBody, CreateWork, HomeData, MetaEdit, OutlineOp, ReadersEdit, ThreadOp, ThreadOpen, TitleEdit, UnitEdit } from '../../shared/api.ts'
import { PRIVATE } from '../infra/config.ts'
import { invalid, notFound } from '../infra/errors.ts'
import { subscribe } from '../infra/events.ts'
import { PRODUCTION_SITE, theSite } from '../infra/site.ts'
import { mediaOf } from '../media/index.ts'
import { ask, taskLabels } from '../domain/ask.ts'
import { createBrief, patchBrief } from '../domain/brief.ts'
import { saveReaders } from '../domain/reads.ts'
import { addSeed, listSeeds } from '../domain/seeds.ts'
import { changed, openSession, startRead, thumb, topicOf, viewNow } from '../domain/sessions.ts'
import { act, briefPersonas, createBody, folderOf, renameBody, homeItems, openThreadOn, operateThread, resolve, setTitle } from '../domain/work.ts'
import { reveal } from '../infra/reveal.ts'
import { createRouter, HANDLED, sendFile } from './router.ts'

const ACTIONS: Action[] = ['finish', 'unfinish', 'delete', 'publish-howto', 'revise', 'cancel-revision']

/** 作品を直す操作の共通部。作品を解決して fn を呼び、作品が変わったことを知らせる */
const mutate = async <T>(key: string, fn: (ref: ReturnType<typeof resolve>) => T | Promise<T>) => {
  const ref = resolve(key)
  const out = await fn(ref)
  await changed(ref.key)
  return out
}

export function routes() {
  const r = createRouter()

  r.get('/api/home', async (): Promise<HomeData> => {
    // 置き場に足したトークを、立て直さずに一覧へ出す
    for (const e of await theSite().refresh()) console.warn(`トークを立てられませんでした: ${e}`)
    return { items: homeItems(), seeds: listSeeds(), tasks: taskLabels(), siteUrl: `${PRODUCTION_SITE}/`, privateDir: PRIVATE }
  })

  r.get('/api/events', async ({ query, res }) => {
    if (query.get('home')) {
      subscribe('home', res)
      return HANDLED
    }
    const key = query.get('work')
    if (!key) throw invalid('work か home を指定してください')
    const real = openSession(key)
    subscribe(topicOf(real), res)
    return HANDLED
  })

  r.post('/api/works', async ({ body }) => {
    const { kind, seedId } = await body<CreateWork>()
    if (kind !== 'talk' && kind !== 'note') throw invalid('kind は talk か note にしてください')
    const b = createBrief(kind, seedId)
    await changed(b.id)
    return { key: b.id }
  })

  r.get('/api/works/:key', ({ params }) => viewNow(params.key))

  r.patch('/api/works/:key/brief', async ({ params, body }) => {
    const patch = await body<BriefPatch>()
    return mutate(params.key, (ref) => {
      if (!ref.brief) throw invalid('この作品には企画シートがありません')
      const saved = patchBrief(ref.brief.id, patch)
      return { ...saved.brief, version: saved.version }
    })
  })

  r.post('/api/works/:key/actions/:action', async ({ params }): Promise<ActionResult> => {
    const action = params.action as Action
    if (!ACTIONS.includes(action)) throw notFound(`操作「${params.action}」はありません`)
    const ref = resolve(params.key)
    const out = await act(ref, action)
    await changed(ref.key)
    if (out.key !== ref.key) await changed(out.key)
    return out
  })

  r.put('/api/works/:key/title', async ({ params, body }) => {
    const edit = await body<TitleEdit>()
    await mutate(params.key, (ref) => setTitle(ref, edit))
  })

  r.post('/api/works/:key/body', async ({ params, body }) => {
    const { slug } = await body<CreateBody>()
    await mutate(params.key, (ref) => createBody(ref, slug))
    return viewNow(params.key)
  })

  r.put('/api/works/:key/slug', async ({ params, body }) => {
    const { slug } = await body<{ slug: string }>()
    return { slug: await mutate(params.key, (ref) => renameBody(ref, slug)) }
  })

  r.put('/api/works/:key/units/*unit', async ({ params, body }) => {
    const edit = await body<UnitEdit>()
    if (typeof edit.orig !== 'string') throw invalid('orig (読んだときの中身) が要ります')
    await mutate(params.key, (ref) => mediaOf(ref.kind).editUnit(ref, params.unit, edit))
  })
  r.post('/api/works/:key/units', async ({ params, body }) => {
    const { text } = await body<{ text: string }>()
    await mutate(params.key, (ref) => mediaOf(ref.kind).appendUnit(ref, text))
  })

  r.patch('/api/works/:key/outline', async ({ params, body }) => {
    const op = await body<OutlineOp>()
    await mutate(params.key, (ref) => mediaOf(ref.kind).editOutline(ref, op))
  })

  r.patch('/api/works/:key/meta', async ({ params, body }) => {
    const edit = await body<MetaEdit>()
    if (typeof edit.base !== 'string') throw invalid('base (読んだときの版) が要ります')
    await mutate(params.key, (ref) => mediaOf(ref.kind).editMeta(ref, edit))
  })

  r.put('/api/works/:key/readers', async ({ params, body }) => {
    const { base, readers } = await body<ReadersEdit>()
    await mutate(params.key, (ref) => {
      const media = mediaOf(ref.kind)
      const home = media.home(ref)
      if (!home) throw invalid('中身がまだ無いので、読み手を決められません')
      saveReaders(home, media.readersHeader, readers, base, briefPersonas(ref))
    })
  })

  r.post('/api/works/:key/read', ({ params }) => {
    startRead(resolve(params.key))
  })

  r.post('/api/works/:key/threads', async ({ params, body }) => {
    const { at, text } = await body<ThreadOpen>()
    if (!at) throw invalid('at (指摘の位置) が要ります')
    return { id: await mutate(params.key, (ref) => openThreadOn(ref, at, text)) }
  })
  r.post('/api/works/:key/threads/:id/:op', async ({ params, body }) => {
    const input = await body<ThreadOp>()
    if (typeof input.rev !== 'string') throw invalid('rev (読んだときの指摘の版) が要ります')
    await mutate(params.key, (ref) => operateThread(ref, params.id, params.op, input))
  })

  r.post('/api/works/:key/ask', async ({ params, body }) => {
    const { task } = await body<{ task: string }>()
    return { items: await mutate(params.key, (ref) => ask(ref, task)) }
  })

  r.get('/api/works/:key/paste', ({ params }) => {
    const ref = resolve(params.key)
    return mediaOf(ref.kind).paste(ref)
  })
  r.post('/api/works/:key/open-assets', ({ params }) => {
    const ref = resolve(params.key)
    mediaOf(ref.kind).openAssets(ref)
  })
  r.post('/api/works/:key/reveal', ({ params }) => {
    reveal(folderOf(resolve(params.key)))
  })
  r.get('/api/works/:key/assets/*path', ({ params, res }) => {
    const ref = resolve(params.key)
    const file = mediaOf(ref.kind).assetFile(ref, `assets/${params.path}`)
    if (!file) throw notFound('画像が見つかりません')
    sendFile(res, readFileSync(file), file)
    return HANDLED
  })
  r.get('/api/works/:key/thumbs/:scene/:n', ({ params, res }) => {
    const img = thumb(resolve(params.key).key, params.scene, Number(params.n))
    if (!img) throw notFound('絵がありません')
    sendFile(res, img, 'thumb.jpg', false)
    return HANDLED
  })

  r.post('/api/seeds', async ({ body }) => {
    const seed = addSeed(await body())
    await changed('')
    return seed
  })

  return r
}
