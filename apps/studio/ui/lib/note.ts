// 記事の原稿 (ADR-0046) を、studio のサーバから読み書きする。段落を単位に、本文・検査・指摘を扱う。
// サーバの作品の WorkView (shared/api.ts) を、いまの画面の形 (Draft) に写して渡す
import type { PasteText, WorkView } from '../../shared/api'
import { forClaude, threadOps, type Persona, type Read, type Reading, type Thread } from './talk'
import { call, current, useWork, workPath, write } from './works'

export type Block = { n: number; kind: 'heading' | 'image' | 'code' | 'embed' | 'quote' | 'list' | 'comment' | 'prose'; text: string; head: string }
/** lint の検査結果。n は寄せた段落の番号。記事全体のものは null */
export type Finding = { severity: 'error' | 'warn' | 'info'; id: string; message: string; n: number | null }

/** 構成の見出し 1 つ。先頭は「冒頭」で、point がフック */
export type Section = { title: string; point: string; grain: '密' | '粗'; budget: number }
/** 原稿を見出し (##) で区切った、区切りごとの地の文の字数 */
export type SectionChars = { title: string; n: number | null; chars: number }

export type Draft = {
  slug: string
  /** 原稿の置き場 (画面と依頼文に出す) */
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
  reading: Reading | null
  work: { id: string; oneLiner: string; candidates: Record<string, { at: string; items: { text: string; note: string }[] }> } | null
}
export type { PasteText }

/** 作品の WorkView を、原稿の画面が使う形にする (段 2 で画面を作り直すまでの橋渡し) */
export function toDraft(v: WorkView): Draft | null {
  const b = v.body
  if (!b || b.kind !== 'note') return null
  return {
    ...b,
    threads: v.threads.items as Thread[],
    error: v.threads.error,
    noteKinds: v.unitKinds,
    survey: v.survey,
    readers: v.readers,
    personas: v.personas as Persona[],
    reads: v.reads as Read[],
    reading: v.reading,
    work: v.brief ? { id: v.brief.id, oneLiner: v.oneLiner, candidates: v.brief.candidates ?? {} } : null,
  }
}

const keyOf = (slug: string) => `draft:${slug}`
const noteBody = (v: WorkView) => (v.body?.kind === 'note' ? v.body : null)

/** 画面からの操作。どれもファイルを書き換え、サーバが変化を知らせてくる。書くときは、手元の最新の版を添える */
export const draftApi = (slug: string) => {
  const key = keyOf(slug)
  return {
    asset: (rel: string) => `${workPath(key)}/${rel}`,
    /** 段落 n を直す。orig は読んだときの段落で、ほかで変わっていれば保存しない */
    saveBlock: (n: number, orig: string, text: string) => write(key, `/units/${n}`, 'PUT', { orig, text }),
    append: (text: string) => write(key, '/units', 'POST', { text }),
    saveOutline: async (sections: Section[]) => write(key, '/outline', 'PATCH', { op: 'replace', base: noteBody(await current(key))?.outline.version ?? 'none', sections }),
    /** front matter を書き換える。title は企画シートの title にも揃える */
    setMeta: async (meta: { title?: string; tags?: string[]; eyecatch?: string | null }) => {
      if (meta.title !== undefined) await write(key, '/title', 'PUT', { orig: (await current(key)).title, title: meta.title })
      if (meta.tags === undefined && meta.eyecatch === undefined) return
      const b = noteBody(await current(key))
      return write(key, '/meta', 'PATCH', { base: b?.metaVersion ?? 'none', ...(meta.tags !== undefined && { tags: meta.tags }), ...(meta.eyecatch !== undefined && { eyecatch: meta.eyecatch }) })
    },
    saveReaders: async (readers: { persona: string; why?: string }[]) => write(key, '/readers', 'PUT', { base: (await current(key)).readersVersion, readers }),
    read: () => write(key, '/read', 'POST', {}),
    paste: () => call<PasteText>(`${workPath(key)}/paste`),
    openAssets: () => call(`${workPath(key)}/open-assets`, 'POST', {}),
    open: (para: number | '*', text: string) => write(key, '/threads', 'POST', { at: { para }, text }),
    ...threadOps(key),
  }
}
export type DraftApi = ReturnType<typeof draftApi>

/** 原稿を読み、ファイルが変わるたびに受け取り直す。原稿が無ければ missing */
export function useDraft(slug: string | undefined) {
  const { data, missing, reading } = useWork(slug ? keyOf(slug) : undefined)
  const draft = data ? toDraft(data) : null
  return { data: draft, missing: missing || (!!data && !draft), reading }
}

/** Claude Code に渡す依頼文。原稿と指摘のファイルの場所を入れる */
export function draftHandoffText(data: Draft) {
  const list = data.threads.filter(forClaude)
  const own = list.filter((t) => t.by !== '聴衆役').length
  return [
    `${data.dir}/feedback.yaml に、Claude の番の指摘が ${list.length} 件あります（話者から ${own} 件、聴衆役から ${list.length - own} 件）。原稿は ${data.file} です。`,
    'writing-note skill に従って、原稿を直してください。指摘の para は段落の番号（見出し・画像も 1 つと数える）、head は段落の書き出しです。"*" は記事全体への指摘です。',
    '直したら、各スレッドの replies に thinking (考えたこと) と change (変えたこと) を足してください。話者に確かめたいことは ball を「話者」に、済んだものは ball を none にして closed を書いてください。',
  ].join('\n')
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
