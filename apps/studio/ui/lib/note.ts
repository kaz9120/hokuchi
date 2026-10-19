// 記事の面 (構成・原稿・読み・公開) が読む形と、そこからの操作 (ADR-0046)。段落を単位に、本文・検査・指摘を扱う。
// 作品の WorkView (shared/api.ts) から、面が読む形 (Draft) を作る。取得と購読は works.ts が持つ
import type { PasteText, WorkView } from '../../shared/api'
import { mine, threadOps, type Persona, type Read, type Thread } from './talk'
import { call, current, send, workPath } from './works'

export type Block = { n: number; kind: 'heading' | 'image' | 'code' | 'embed' | 'quote' | 'list' | 'comment' | 'prose'; text: string; head: string }
/** lint の検査結果。n は寄せた段落の番号。記事全体のものは null */
export type Finding = { severity: 'error' | 'warn' | 'info'; id: string; message: string; n: number | null }

/** 構成の見出し 1 つ。先頭は「冒頭」で、point がフック */
export type Section = { title: string; point: string; grain: '密' | '粗'; budget: number }
/** 原稿を見出し (##) で区切った、区切りごとの地の文の字数 */
export type SectionChars = { title: string; n: number | null; chars: number }

export type Draft = {
  /** 作品の key。書き込みはこの key で送る */
  key: string
  slug: string
  /** 原稿の置き場 */
  dir: string
  file: string
  title: string
  tags: string[]
  /** 見出し画像 (assets/…)。front matter の eyecatch */
  eyecatch: string | null
  /** 改稿の原稿なら、元の記事のアーカイブのディレクトリ名 (ADR-0047) */
  revises: string | null
  blocks: Block[]
  lint: Finding[]
  stats: { chars: number; paragraphs: number; sentences: number; medianSentence: number; images: number; headings: number }
  sections: SectionChars[]
  assets: string[]
  outline: { exists: boolean; sections: Section[]; version: string }
  version: string
  metaVersion: string
  threads: Thread[]
  error: string | null
  noteKinds: Record<string, string>
  survey: { key: string; group: string; label: string }[]
  readers: (Persona & { why: string })[]
  personas: Persona[]
  reads: Read[]
  /** 伝えたいこと (企画の段階 4) */
  oneLiner: string
  /** 企画シートがあるか (タイトルの案は企画シートに残す) */
  hasBrief: boolean
  /** Claude に出してもらった案 (企画シートの candidates) */
  candidates: Record<string, { at: string; items: { text: string; note: string }[] }>
}
export type { PasteText }

/** 作品の WorkView から、記事の面が読む形を作る。原稿が無ければ null */
export function toDraft(v: WorkView): Draft | null {
  const b = v.body
  if (!b || b.kind !== 'note') return null
  return {
    ...b,
    key: v.key,
    threads: v.threads.items as Thread[],
    error: v.threads.error,
    noteKinds: v.unitKinds,
    survey: v.survey,
    readers: v.readers,
    personas: v.personas as Persona[],
    reads: v.reads as Read[],
    oneLiner: v.oneLiner,
    hasBrief: !!v.brief,
    candidates: v.brief?.candidates ?? {},
  }
}

const noteBody = (v: WorkView) => (v.body?.kind === 'note' ? v.body : null)

/** 記事の面からの操作。どれもファイルを書き換え、サーバが変化を知らせてくる。書くときは、手元の最新の版を添える */
export const draftApi = (key: string) => ({
  asset: (rel: string) => `${workPath(key)}/${rel}`,
  /** 段落 n を直す。orig は読んだときの段落で、ほかで変わっていれば保存しない */
  saveBlock: (n: number, orig: string, text: string) =>
    send(key, `/units/${n}`, 'PUT', { orig, text }, { optimistic: (w) => (w.body?.kind === 'note' && text ? { ...w, body: { ...w.body, blocks: w.body.blocks.map((x) => (x.n === n ? { ...x, text } : x)) } } : w) }),
  append: (text: string) => send(key, '/units', 'POST', { text }),
  saveOutline: async (sections: Section[]) =>
    send(key, '/outline', 'PATCH', { op: 'replace', base: noteBody(await current(key))?.outline.version ?? 'none', sections }, { optimistic: (w) => (w.body?.kind === 'note' ? { ...w, body: { ...w.body, outline: { ...w.body.outline, exists: true, sections } } } : w) }),
  /** front matter を書き換える。title は企画シートの title にも揃える */
  setMeta: async (meta: { title?: string; tags?: string[]; eyecatch?: string | null }) => {
    if (meta.title !== undefined) await setTitle(key, meta.title)
    if (meta.tags === undefined && meta.eyecatch === undefined) return
    const b = noteBody(await current(key))
    return send(key, '/meta', 'PATCH', { base: b?.metaVersion ?? 'none', ...(meta.tags !== undefined && { tags: meta.tags }), ...(meta.eyecatch !== undefined && { eyecatch: meta.eyecatch }) }, {
      optimistic: (w) => (w.body?.kind === 'note' ? { ...w, body: { ...w.body, ...(meta.tags !== undefined && { tags: meta.tags }), ...(meta.eyecatch !== undefined && { eyecatch: meta.eyecatch }) } } : w),
    })
  },
  saveReaders: async (readers: { persona: string; why?: string }[]) => send(key, '/readers', 'PUT', { base: (await current(key)).readersVersion, readers }),
  read: () => send(key, '/read', 'POST', {}),
  paste: () => call<PasteText>(`${workPath(key)}/paste`),
  openAssets: () => call(`${workPath(key)}/open-assets`, 'POST', {}),
  open: (para: number | '*', text: string) => send(key, '/threads', 'POST', { at: { para }, text }),
  ...threadOps(key),
})
export type DraftApi = ReturnType<typeof draftApi>

/** 作品のタイトルを直す。正は中身 (発表は talk.tsx、記事は原稿)、無ければ企画シート (rebuild.md 4.2) */
export async function setTitle(key: string, title: string) {
  const v = await current(key)
  return send(key, '/title', 'PUT', { orig: v.title, title }, { optimistic: (w) => ({ ...w, title, ...(w.body?.kind === 'note' && { body: { ...w.body, title } }) }) })
}

/** 原稿の目次。見出し (## と ###) と、見出しの下の段落にあるあなた宛ての指摘の数。先頭は「冒頭」(n = 0) */
export function tocOf(d: Draft) {
  const byPara = new Map<number | '*', number>()
  for (const t of d.threads) if (mine(t)) byPara.set(t.para ?? '*', (byPara.get(t.para ?? '*') ?? 0) + 1)
  const items: { n: number; level: number; text: string; mine: number }[] = [{ n: 0, level: 2, text: '冒頭', mine: 0 }]
  for (const b of d.blocks) {
    if (b.kind === 'heading' && headingLevel(b) >= 2 && headingLevel(b) <= 3) items.push({ n: b.n, level: headingLevel(b), text: headingText(b), mine: 0 })
    items[items.length - 1].mine += byPara.get(b.n) ?? 0
  }
  return items
}

/** 見出しの文字 (## を外したもの) */
export const headingText = (b: Block) => b.text.replace(/^#{1,6}\s+/, '')
export const headingLevel = (b: Block) => b.text.match(/^(#{1,6})\s/)?.[1].length ?? 0

/** 指摘の位置を画面の言葉にする */
export const placeOf = (t: Thread, data: Draft) => {
  if (t.para === undefined || t.para === '*') return '記事全体'
  const b = data.blocks[t.para - 1]
  const heading = [...data.blocks.slice(0, t.para)].reverse().find((x) => x.kind === 'heading')
  return `段落 ${t.para}${heading && b?.kind !== 'heading' ? `（${headingText(heading)}）` : ''}`
}

/** 見える字数 (空白を除く) */
export const visibleLength = (s: string) => s.replace(/\s/g, '').length
