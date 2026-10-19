// 記事の原稿 (ADR-0046) を、studio のサーバから読み書きする。段落を単位に、本文・検査・指摘を扱う
import { useEffect, useState } from 'react'
import { forClaude, type Thread } from './talk'

export type Block = { n: number; kind: 'heading' | 'image' | 'code' | 'embed' | 'quote' | 'list' | 'comment' | 'prose'; text: string; head: string }
/** lint の検査結果。n は寄せた段落の番号。記事全体のものは null */
export type Finding = { severity: 'error' | 'warn' | 'info'; id: string; message: string; n: number | null }

export type Draft = {
  slug: string
  /** 原稿の置き場 (画面と依頼文に出す) */
  dir: string
  file: string
  title: string
  tags: string[]
  blocks: Block[]
  lint: Finding[]
  stats: { chars: number; paragraphs: number; sentences: number; medianSentence: number; images: number; headings: number }
  threads: Thread[]
  error: string | null
  noteKinds: Record<string, string>
  work: { id: string; oneLiner: string } | null
}

const base = (slug: string) => `/api/drafts/${encodeURIComponent(slug)}`
const send = async (url: string, method: string, body?: unknown) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `${r.status}`)
  return r
}

/** 画面からの操作。どれもファイルを書き換え、サーバが変化を知らせてくる */
export const draftApi = (slug: string) => ({
  asset: (rel: string) => `${base(slug)}/${rel}`,
  /** 段落 n を直す。orig は読んだときの段落で、ほかで変わっていれば保存しない */
  saveBlock: (n: number, orig: string, text: string) => send(`${base(slug)}/block`, 'PUT', { n, orig, text }),
  append: (text: string) => send(`${base(slug)}/append`, 'POST', { text }),
  open: (para: number | '*', text: string) => send(`${base(slug)}/threads`, 'POST', { para, text }),
  reply: (id: string, text: string) => send(`${base(slug)}/threads/${id}/reply`, 'POST', { text }),
  close: (id: string, how: '直した' | 'そのままにした') => send(`${base(slug)}/threads/${id}/close`, 'POST', { how }),
  reopen: (id: string) => send(`${base(slug)}/threads/${id}/reopen`, 'POST'),
})
export type DraftApi = ReturnType<typeof draftApi>

/** 原稿を読み、ファイルが変わるたびに受け取り直す。原稿が無ければ null のまま */
export function useDraft(slug: string | undefined) {
  const [data, setData] = useState<Draft | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    setData(null)
    setMissing(false)
    if (!slug) return
    fetch(`${base(slug)}/state`).then(async (r) => (r.ok ? setData(await r.json()) : setMissing(true)))
    const es = new EventSource(`/api/events?note=${encodeURIComponent(slug)}`)
    es.addEventListener('draft', (e) => setData(JSON.parse((e as MessageEvent).data) as Draft))
    return () => es.close()
  }, [slug])
  return { data, missing }
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
