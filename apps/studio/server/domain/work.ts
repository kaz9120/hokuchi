// 作品 (rebuild.md 4 章)。企画シート・中身 (トーク / 原稿)・アーカイブ・指摘・読みを、サーバの中で 1 つの実体にまとめる。
// 作品は WorkKey で指す。企画シートがあればその id、無ければ talk:<slug>・note:<アーカイブ>・draft:<原稿の slug>。
// どの key で指しても、同じ作品に解決する (企画シートが紐づいていれば、企画シートの id が本当の key)
import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { Action, ActionResult, Anchor, Archive, AudiencePersona, Brief, HomeItem, Kind, Persona, ThreadOp, TitleEdit, WorkView } from '../../shared/api.ts'
import { UNIT_KINDS } from '../../shared/api.ts'
import { places } from '../infra/config.ts'
import { conflict, invalid, notFound } from '../infra/errors.ts'
import { theSite, type SiteTalk } from '../infra/site.ts'
import { mediaOf } from '../media/index.ts'
import { createDraft, draftDir, hasDraft, reviseFromArchive, SLUG } from '../media/note.ts'
import { shownDir } from '../infra/config.ts'
import { briefFile } from './brief.ts'
import { slugFromTitle } from './slug.ts'
import { archiveDir, archiveOfSlug, listArchives, readArchive, slugOfArchive } from './archive.ts'
import { briefDir, createBrief, isBriefId, listBriefs, readBrief, writeBrief } from './brief.ts'
import { listPersonas, listReads, readReaders, readings } from './reads.ts'
import { unlinkWork } from './seeds.ts'
import { deriveState } from './state.ts'
import { openThread, operate, readThreads } from './threads.ts'
import { moveToTrash } from './trash.ts'

export type WorkRef = {
  key: string
  kind: Kind
  brief: Brief | null
  briefVersion: string | null
  /** 発表のトーク (サイトの開発サーバが持つもの) */
  talk: SiteTalk | null
  /** 記事の原稿の slug。原稿があるときだけ */
  draft: string | null
  /** 公開済みの記事のアーカイブ */
  archive: Archive | null
}

// ---------------------------------------------------------------- 解決

function refOfBrief(brief: Brief, version: string): WorkRef {
  const talk = brief.kind === 'talk' && brief.talk ? (theSite().talks.get(brief.talk) ?? null) : null
  const note = brief.kind === 'note' ? (brief.note ?? null) : null
  return { key: brief.id, kind: brief.kind, brief, briefVersion: version, talk, draft: hasDraft(note) ? note : null, archive: archiveOfSlug(note) }
}
const bare = (kind: Kind, key: string, part: Partial<WorkRef>): WorkRef => ({ key, kind, brief: null, briefVersion: null, talk: null, draft: null, archive: null, ...part })

const draftSlugs = () => (existsSync(places.notes) ? readdirSync(places.notes).filter((s) => hasDraft(s)) : [])

/** すべての作品。企画シートのある作品と、企画シートの無い中身 (トーク・アーカイブ・原稿) */
export function allRefs(): WorkRef[] {
  const briefs = listBriefs().map(({ brief, version }) => refOfBrief(brief, version))
  const usedTalks = new Set(briefs.filter((r) => r.talk).map((r) => r.talk!.info.slug))
  const usedNotes = new Set(briefs.filter((r) => r.kind === 'note' && r.brief!.note).map((r) => r.brief!.note!))
  const refs = [...briefs]
  for (const [slug, t] of theSite().talks) if (!usedTalks.has(slug)) refs.push(bare('talk', `talk:${slug}`, { talk: t }))
  // 同じ slug の記事が複数あることがある (月次の振り返りなど)。企画シートが紐づくのは、新しい方の 1 本 (archiveOfSlug)
  const linkedArchives = new Set(briefs.filter((r) => r.archive).map((r) => r.archive!.dir))
  const draftsWithArchive = new Set<string>()
  for (const a of listArchives()) {
    if (linkedArchives.has(a.dir)) continue
    const slug = slugOfArchive(a.dir)
    const draft = !usedNotes.has(slug) && !draftsWithArchive.has(slug) && hasDraft(slug) ? slug : null
    if (draft) draftsWithArchive.add(draft)
    refs.push(bare('note', `note:${a.dir}`, { archive: a, draft }))
  }
  for (const slug of draftSlugs()) if (!usedNotes.has(slug) && !draftsWithArchive.has(slug)) refs.push(bare('note', `draft:${slug}`, { draft: slug }))
  return refs
}

/** key から作品を解決する。企画シートが紐づいていれば、どの key で指しても企画シートの作品になる */
export function resolve(key: string): WorkRef {
  const [prefix, ...rest] = key.split(':')
  const id = rest.join(':')
  const briefWith = (pred: (b: Brief) => boolean) => {
    const hit = listBriefs().find(({ brief }) => pred(brief))
    return hit ? refOfBrief(hit.brief, hit.version) : null
  }
  if (rest.length === 0) {
    const b = isBriefId(key) ? readBrief(key) : null
    if (!b) throw notFound(`作品（${key}）が見つかりません`)
    return refOfBrief(b.brief, b.version)
  }
  if (prefix === 'talk') {
    const linked = briefWith((b) => b.kind === 'talk' && b.talk === id && theSite().talks.has(id))
    if (linked) return linked
    const t = theSite().talks.get(id)
    if (!t) throw notFound(`発表（${id}）が見つかりません`)
    return bare('talk', key, { talk: t })
  }
  if (prefix === 'note' || prefix === 'draft') {
    const slug = prefix === 'note' ? slugOfArchive(id) : id
    // 同じ slug の古い記事は、企画シートに紐づかない (企画シートが紐づくのは新しい方の 1 本)
    const linked = prefix === 'note' && archiveOfSlug(slug)?.dir !== id ? null : briefWith((b) => b.kind === 'note' && b.note === slug)
    if (linked) return linked
    const archive = prefix === 'note' ? (listArchives().find((a) => a.dir === id) ?? null) : archiveOfSlug(slug)
    const draft = hasDraft(slug) ? slug : null
    if (!archive && !draft) throw notFound(`記事（${id}）が見つかりません`)
    return bare('note', archive ? `note:${archive.dir}` : `draft:${slug}`, { archive, draft })
  }
  throw notFound(`作品（${key}）が見つかりません`)
}

// ---------------------------------------------------------------- 状態

export function stateOf(ref: WorkRef) {
  const published = ref.kind === 'talk' ? ref.talk?.info.public === true : !!ref.archive
  return deriveState({
    kind: ref.kind,
    hasBrief: !!ref.brief,
    published,
    finished: !!ref.brief?.finishedAt,
    revising: ref.kind === 'note' && published && !!ref.draft,
    hasBody: !!(ref.talk || ref.draft || ref.archive),
    outside: !!ref.talk?.outside,
    publishIntent: ref.brief?.fields?.publish,
  })
}

const ACTION_LABEL: Record<Action, string> = { finish: '完成にする', unfinish: '下書きに戻す', delete: '削除', 'publish-howto': '公開の手順', revise: '改稿する', 'cancel-revision': '改稿をやめる' }

/** 状態の表で押せる操作を行う。押せない操作は断る (サーバでも、画面と同じ表で確かめる) */
export async function act(ref: WorkRef, action: Action): Promise<ActionResult> {
  const st = stateOf(ref)
  // 改稿中の記事で「改稿する」を押したら、いまの原稿をそのまま開く
  if (action === 'revise' && st.word === '改稿中') return { key: ref.key, slug: ref.draft! }
  if (!st.actions.includes(action)) throw invalid(`いまの状態（${st.label}）では、${ACTION_LABEL[action] ?? action}はできません`)
  const now = new Date().toISOString()
  switch (action) {
    case 'finish':
      writeBrief(ref.brief!.id, { finishedAt: now })
      return { key: ref.key }
    case 'unfinish':
      writeBrief(ref.brief!.id, { finishedAt: null })
      return { key: ref.key }
    case 'publish-howto':
      return { key: ref.key }
    case 'delete': {
      // 下書きだけを、ごみ箱に移す。リポジトリの中のファイルには触らない (ADR-0044・ADR-0045)
      const media = mediaOf(ref.kind)
      await media.beforeTrash(ref)
      const id = ref.brief!.id
      const trash = moveToTrash('work', id, [{ from: briefDir(id), into: 'works' }, ...media.trashItems(ref)])
      unlinkWork(id)
      return { key: ref.key, trash }
    }
    case 'revise': {
      // 公開済みの記事を原稿に写し、企画シートに紐づける。アーカイブは読むだけ (ADR-0047)
      const { slug } = reviseFromArchive(ref.archive!.dir)
      if (ref.brief) return { key: ref.key, slug }
      const b = createBrief('note')
      writeBrief(b.id, { title: ref.archive!.title, note: slug })
      return { key: b.id, slug }
    }
    case 'cancel-revision': {
      // 改稿の原稿だけをごみ箱へ移す。企画シート・note の記事・アーカイブは変えない (ADR-0048)
      const trash = moveToTrash('revision', ref.draft!, [{ from: draftDir(ref.draft!), into: 'notes' }])
      return { key: ref.key, trash }
    }
  }
  throw invalid(`${action} はできません`)
}

/** 作品の置き場 (「⋯」の「置き場を開く」で Finder に出す)。中身があれば中身のフォルダ、無ければ企画シートのフォルダ */
export function folderOf(ref: WorkRef): string {
  if (ref.talk) return ref.talk.dir
  if (ref.draft) return draftDir(ref.draft)
  if (ref.archive) return archiveDir(ref.archive.dir)
  if (ref.brief) return briefDir(ref.brief.id)
  throw notFound('この作品には、置き場がありません')
}

// ---------------------------------------------------------------- 中身を作る・直す

const slugTaken = (s: string) => existsSync(draftDir(s)) || !!archiveOfSlug(s)

/**
 * 記事の原稿を作る。index.md を作り、企画シートの note に書く (ADR-0046)。
 * slug を渡さなければ、企画のタイトルから決める (話者に聞かない。直したいときは renameBody)
 */
export function createBody(ref: WorkRef, slug?: string) {
  if (ref.kind !== 'note') throw invalid('原稿を作れるのは記事だけです。発表の絵コンテは Claude Code に頼んでください')
  if (!ref.brief) throw invalid('企画シートの無い記事には、原稿を作れません')
  if (ref.draft) throw invalid(`この記事には原稿（${ref.draft}）があります`)
  if (ref.archive) throw invalid('公開済みの記事は「改稿する」で直します')
  const s = String(slug ?? '').trim() || slugFromTitle(ref.brief.title, slugTaken)
  createDraft(s, ref.brief.title)
  writeBrief(ref.brief.id, { note: s })
  return s
}

/** 原稿の置き場の名前 (slug) を変える。公開前の原稿だけ (改稿中の原稿の名前は、公開済みの記事と同じでないといけない) */
export function renameBody(ref: WorkRef, slug: string) {
  const s = String(slug ?? '').trim()
  if (ref.kind !== 'note' || !ref.brief || !ref.draft) throw invalid('名前を変えられるのは、公開前の記事の原稿だけです')
  if (ref.archive) throw invalid('改稿中の原稿は、公開済みの記事と同じ名前のままにします')
  if (s === ref.draft) return s
  if (!SLUG.test(s)) throw invalid('名前は半角の英小文字・数字・ハイフンにしてください')
  if (slugTaken(s)) throw invalid(`「${s}」はほかの原稿か公開済みの記事で使っています`)
  renameSync(draftDir(ref.draft), draftDir(s))
  writeBrief(ref.brief.id, { note: s })
  return s
}

/**
 * 企画の段階 2 で描いた人を、聴衆役のペルソナの形にする (rebuild.md 4.2: 聴衆の正は企画)。
 * id は brief:<名前>。readers.yaml の形は変えず、persona にこの id を書く
 */
export function briefPersonas(ref: WorkRef): Persona[] {
  const f = ref.brief?.fields
  if (!f) return []
  if (ref.kind === 'talk')
    return ((f.personas ?? []) as AudiencePersona[])
      .filter((p) => p.name || p.who)
      .map((p, i) => {
        // 「高橋さん（中堅・6 年目のバックエンドエンジニア）」は、名前と肩書きに分ける
        const [, base, note] = (p.name || `${i + 1} 人目`).match(/^([^（(]+)[（(]?([^）)]*)/) ?? []
        const name = base.trim()
        return { id: `brief:${name}`, name, label: note?.trim() || '企画で描いた聴衆', who: p.who ?? '', troubles: p.trouble ?? '', knows: '', pushback: p.pushback ?? '', why: p.why ?? '', tags: ['企画'] } as Persona & { why: string }
      })
  if (!String(f.readerWho ?? '').trim()) return []
  return [{ id: 'brief:読者', name: '企画で描いた読者', label: String(f.readerWho).split('\n')[0].slice(0, 40), who: String(f.readerWho), troubles: String(f.readerTrouble ?? ''), knows: String(f.readerKnows ?? ''), pushback: '', tags: ['企画'] }]
}

/** 中身を Claude Code に頼む依頼文 (企画の最後に置く)。発表は絵コンテ、記事は下書き。記事は原稿があるときだけ */
function bodyRequest(ref: WorkRef): string | null {
  if (!ref.brief) return null
  const brief = shownDir(briefFile(ref.brief.id))
  if (ref.kind === 'talk') return ref.talk ? null : [`企画シート ${brief} をもとに、絵コンテを作ってください。`, 'crafting-presentation skill の Phase 3 から始めてください (企画の段階 1〜4 が Phase 0〜2 に当たります)。トークができたら、企画シートの talk に slug を書いて紐づけてください。'].join('\n')
  if (!ref.draft) return null
  return [`企画シート ${brief} をもとに、原稿 ${shownDir(draftDir(ref.draft))}/index.md の下書きを書いてください。`, 'writing-note skill の Phase 3 から始めてください (企画の段階 1〜4 が Phase 0〜2 に当たります)。'].join('\n')
}

/** タイトルを直す。正は中身 (発表は talk.tsx、記事は原稿)。中身が無ければ企画シート。企画シートの title にも写す (rebuild.md 4.2) */
export async function setTitle(ref: WorkRef, edit: TitleEdit) {
  const title = String(edit.title ?? '').trim()
  if (!title) throw invalid('タイトルが空です')
  const handled = await mediaOf(ref.kind).setTitle(ref, { orig: edit.orig, title })
  if (!ref.brief) {
    if (!handled) throw invalid('この作品には、タイトルを書く場所がありません')
    return
  }
  if (!handled && ref.brief.title !== edit.orig) throw conflict('タイトルが、ほかで変更されています', ref.brief.title)
  writeBrief(ref.brief.id, { title })
}

const feedbackOf = (ref: WorkRef) => {
  const home = mediaOf(ref.kind).home(ref)
  if (!home) throw invalid('中身がまだ無いので、指摘を書けません')
  return join(home, 'feedback.yaml')
}

export function openThreadOn(ref: WorkRef, at: Anchor, text: string) {
  const media = mediaOf(ref.kind)
  return openThread(feedbackOf(ref), media.threadsHeader, media.anchor(ref, at), text)
}
export function operateThread(ref: WorkRef, id: string, op: string, input: ThreadOp) {
  operate(feedbackOf(ref), mediaOf(ref.kind).threadsHeader, id, op, input)
}

// ---------------------------------------------------------------- 見せる

/** 聴衆・読者の要約。企画の段階 2 から作る */
export function audienceOf(brief: Brief | null) {
  if (!brief) return ''
  if (brief.kind === 'talk') {
    const p = (brief.fields.personas ?? []).filter((x) => x.name || x.who)
    return p.map((x) => (x.name ? `${x.name}${x.who ? `（${x.who.split('\n')[0]}）` : ''}` : x.who.split('\n')[0])).join(' / ')
  }
  return String(brief.fields.readerWho ?? '').split('\n')[0]
}

/** 中身のタイトルが企画シートと違えば、企画シートに写す (Claude Code が中身を直したときも、一覧のタイトルがそろう) */
function syncTitle(ref: WorkRef) {
  const t = mediaOf(ref.kind).bodyTitle(ref)
  if (!ref.brief || !t || t === ref.brief.title || (ref.kind === 'note' && !ref.draft)) return
  const saved = writeBrief(ref.brief.id, { title: t })
  ref.brief = saved.brief
  ref.briefVersion = saved.version
}

export async function viewOf(ref: WorkRef, ctx: { thumbsVersion: number } = { thumbsVersion: 0 }): Promise<WorkView> {
  const media = mediaOf(ref.kind)
  media.beforeView(ref)
  syncTitle(ref)
  const home = media.home(ref)
  const threads = home ? readThreads(join(home, 'feedback.yaml')) : { items: [], error: null }
  const audiencePersonas = briefPersonas(ref)
  const { readers, version: readersVersion } = readReaders(home, audiencePersonas)
  const summary = media.summary(ref)
  const forClaude = threads.items.filter((t) => t.ball === 'Claude')
  return {
    key: ref.key,
    kind: ref.kind,
    title: media.bodyTitle(ref) ?? ref.brief?.title ?? '',
    oneLiner: String(ref.brief?.fields?.oneLiner ?? '') || media.oneLinerFromBody(ref),
    audience: audienceOf(ref.brief),
    event: summary.event,
    date: summary.date,
    state: stateOf(ref),
    brief: ref.brief ? { ...ref.brief, version: ref.briefVersion! } : null,
    body: await media.body(ref, ctx),
    archive: ref.archive ? readArchive(ref.archive.dir, `/api/works/${encodeURIComponent(ref.key)}/`) : null,
    threads,
    reads: listReads(home),
    reading: readings.get(ref.key) ?? null,
    readers,
    readersVersion,
    personas: listPersonas(),
    audiencePersonas,
    bodyRequest: bodyRequest(ref),
    survey: media.survey,
    unitKinds: UNIT_KINDS,
    handoff: { count: forClaude.length, own: forClaude.filter((t) => t.by !== '聴衆役').length, text: media.handoff(ref, threads.items) },
    repoFiles: media.repoFiles(ref),
    trashDir: places.trash,
  }
}

/** ホームの一覧。下書き (と改稿中) を上に触った順、そのあとに完成と公開を日付の新しい順 */
export function homeItems(): HomeItem[] {
  const items = allRefs().map((ref): HomeItem => {
    const media = mediaOf(ref.kind)
    const home = media.home(ref)
    const threads = home ? readThreads(join(home, 'feedback.yaml')).items : []
    const s = media.summary(ref)
    return {
      key: ref.key,
      kind: ref.kind,
      state: stateOf(ref),
      title: media.bodyTitle(ref) || ref.brief?.title || '',
      date: s.date,
      event: s.event,
      tags: s.tags,
      updatedAt: ref.brief?.updatedAt ?? null,
      oneLiner: String(ref.brief?.fields?.oneLiner ?? ''),
      cover: s.cover,
      brief: ref.brief,
      talk: s.talk,
      draft: s.draft,
      archive: ref.archive,
      counts: { mine: threads.filter((t) => t.ball === '話者').length, claude: threads.filter((t) => t.ball === 'Claude').length, reads: listReads(home).length },
    }
  })
  return items.sort((a, b) => {
    const da = a.state.progress === 'draft'
    if (da !== (b.state.progress === 'draft')) return da ? -1 : 1
    const [x, y] = da ? [a.updatedAt, b.updatedAt] : [a.date, b.date]
    return (x ?? '') < (y ?? '') ? 1 : -1
  })
}
