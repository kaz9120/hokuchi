// 指摘のスレッド (feedback.yaml。ADR-0040)。1 件の指摘とその往復を 1 本にし、「いま誰が動く番か (ball)」と「どう終わったか (closed)」で扱う。
//   ball: 話者 / Claude / none。closed: 直した / そのままにした / 良かった点 / 読み直した
// 発表と記事で形は同じで、位置 (anchor) だけが違う。発表は scene と state、記事は para と head (ADR-0046)。
// YAML は文書のまま開いて直し、頭書きのコメントと並びを保って書き戻す (Claude Code も直接直すため)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import YAML from 'yaml'
import type { Thread, ThreadOp } from '../../shared/api.ts'
import { conflict, invalid, notFound } from '../infra/errors.ts'
import { versionOf } from '../infra/files.ts'

/** 位置。発表は { scene, state? }、記事は { para, head? } */
export type AnchorFields = Record<string, string | number>
type Raw = Omit<Thread, 'rev'>

const now = () => new Date().toISOString()
/** スレッドの版。返信・閉じる操作で、画面が読んだときと同じかを確かめる */
export const revOf = (t: Raw) => versionOf(JSON.stringify(t))

export function readThreads(file: string): { items: Thread[]; error: string | null } {
  if (!existsSync(file)) return { items: [], error: null }
  try {
    const list: Raw[] = (YAML.parse(readFileSync(file, 'utf8')) ?? {}).threads ?? []
    return { items: list.map((t) => ({ ...t, rev: revOf(t) })), error: null }
  } catch (e) {
    return { items: [], error: String((e as Error).message ?? e) }
  }
}

/** 文書のまま開いて直し、書き戻す。head はファイルが無いときの頭書き */
function edit<T>(file: string, head: string, fn: (seq: YAML.YAMLSeq<YAML.YAMLMap>, doc: YAML.Document) => T): T {
  const doc = YAML.parseDocument(existsSync(file) ? readFileSync(file, 'utf8') : `${head}threads: []\n`)
  if (!YAML.isSeq(doc.get('threads'))) doc.set('threads', doc.createNode([]))
  const seq = doc.get('threads') as YAML.YAMLSeq<YAML.YAMLMap>
  const result = fn(seq, doc)
  // 人が読めるよう、1 件を 1 行に詰めず、項目ごとに行を分けて書く
  seq.flow = false
  for (const t of seq.items) {
    t.flow = false
    const replies = t.get('replies')
    if (YAML.isSeq(replies)) {
      replies.flow = false
      for (const r of replies.items as YAML.YAMLMap[]) r.flow = false
    }
  }
  writeFileSync(file, doc.toString({ lineWidth: 0 }))
  return result
}

const maxId = (seq: YAML.YAMLSeq<YAML.YAMLMap>) => Math.max(0, ...seq.items.map((t) => Number(String(t.get('id') ?? '').slice(1)) || 0))
const idOf = (n: number) => `t${String(n).padStart(3, '0')}`

/** 話者が指摘を書く。次に動くのは Claude */
export function openThread(file: string, head: string, at: AnchorFields, text: string): string {
  const t = String(text ?? '').trim()
  if (!t) throw invalid('指摘の文が要ります')
  return edit(file, head, (seq, doc) => {
    const id = idOf(maxId(seq) + 1)
    seq.add(doc.createNode({ id, ...at, by: '話者', text: t, at: now(), ball: 'Claude' }))
    return id
  })
}

/** 話者の操作 (返信・閉じる・開き直す)。rev は画面が読んだときのスレッドの版 */
export function operate(file: string, head: string, id: string, op: string, input: ThreadOp) {
  const cur = readThreads(file).items.find((t) => t.id === id)
  if (!cur) throw notFound(`指摘（${id}）が見つかりません`)
  if (input.rev !== undefined && input.rev !== cur.rev) throw conflict('この指摘は、ほかで変更されています。画面を読み込み直してください', cur)
  if (op === 'reply' && !String(input.text ?? '').trim()) throw invalid('返信の文が要ります')
  if (!['reply', 'close', 'reopen'].includes(op)) throw invalid(`${op} はできません`)
  edit(file, head, (seq, doc) => {
    const t = seq.items.find((x) => x.get('id') === id)!
    if (op === 'reply') {
      if (!YAML.isSeq(t.get('replies'))) t.set('replies', doc.createNode([]))
      ;(t.get('replies') as YAML.YAMLSeq).add(doc.createNode({ by: '話者', text: String(input.text).trim(), at: now() }))
      t.set('ball', 'Claude')
      t.delete('closed')
    }
    // 閉じる: how は「直した」(これでいい) か「そのままにした」(直さなくていい)
    if (op === 'close') {
      t.set('ball', 'none')
      t.set('closed', input.how === 'そのままにした' ? 'そのままにした' : '直した')
    }
    if (op === 'reopen') {
      t.set('ball', 'Claude')
      t.delete('closed')
    }
  })
}

/**
 * 記事の指摘の位置を付け直す (ADR-0046)。fn は { para, head } を受け取り、新しい { para, head } を返す。
 * 位置が変わった件だけを書き換え、変えた数を返す
 */
export function retarget(file: string, head: string, fn: (p: { para: number; head?: string }) => { para: number | '*'; head?: string }) {
  if (!existsSync(file)) return 0
  const moves = new Map<string, { para: number | '*'; head?: string }>()
  for (const t of readThreads(file).items) {
    if (t.para === undefined || t.para === '*') continue
    const next = fn({ para: t.para, head: t.head })
    if (next.para !== t.para || next.head !== t.head) moves.set(t.id, next)
  }
  if (moves.size === 0) return 0
  edit(file, head, (seq) => {
    for (const t of seq.items) {
      const next = moves.get(String(t.get('id')))
      if (!next) continue
      t.set('para', next.para)
      if (next.para === '*') t.delete('head')
      else t.set('head', next.head)
    }
  })
  return moves.size
}

/**
 * 聴衆役の読みを取り込む。感想を 1 件ずつスレッドにする。良かった点は、済んだ件として残す。
 * 前の読みの感想で、Claude の番のまま残っているものは「読み直した」として閉じる。話者の番のものは残す。
 * anchorOf は、感想から位置の欄を取り出す (発表と記事で違う)
 */
export function importRead(file: string, head: string, read: { id: number; at: string; readers: { name: string; notes: { kind: string; text: string }[] }[] }, anchorOf: (note: any) => AnchorFields) {
  edit(file, head, (seq, doc) => {
    for (const t of seq.items) {
      if (t.get('by') === '聴衆役' && t.get('ball') === 'Claude' && t.get('read') !== read.id) {
        t.set('ball', 'none')
        t.set('closed', '読み直した')
      }
    }
    let n = maxId(seq)
    for (const r of read.readers) {
      for (const note of r.notes) {
        const good = note.kind === 'good'
        seq.add(
          doc.createNode({
            id: idOf(++n),
            ...anchorOf(note),
            by: '聴衆役',
            name: r.name,
            read: read.id,
            kind: note.kind,
            text: note.text,
            at: read.at,
            ball: good ? 'none' : 'Claude',
            ...(good ? { closed: '良かった点' } : {}),
          }),
        )
      }
    }
  })
}
