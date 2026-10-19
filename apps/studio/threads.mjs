// 指摘のスレッド (ADR-0040)。talks/<トーク>/feedback.yaml に、1 件の指摘とその往復を 1 本として残す。
// 記事の原稿 (<HOKUCHI_PRIVATE>/notes/<slug>/feedback.yaml) も同じ形で、位置だけが段落になる (ADR-0046)。
// 見るのは「いま誰が動く番か (ball)」と「どう終わったか (closed)」の 2 つ。
//   ball: 話者 (あなたが答える) / Claude (Claude が直す) / none (済んだ)
//   closed: 直した / そのままにした / 良かった点 / 読み直した
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import YAML from 'yaml'

const HEAD = [
  '# 指摘のスレッド (ADR-0040)。1 件の指摘と、その往復を 1 本にまとめる。studio の画面が読み書きし、Claude Code も直接直す。',
  '#   scene: 絵コンテのシーン id。トーク全体への指摘は "*"。state: コマの番号 (1 始まり)。無ければシーン全体',
  '#   by: 話者 / 聴衆役 / Claude / 検査。聴衆役は name (誰が)・read (何回目の読みか)・kind (感想の種類) を持つ',
  '#   replies: 返事を順に足す。Claude は thinking (考えたこと) と change (変えたこと)、話者は text',
  '#   ball: いま誰が動く番か。話者 / Claude / none。closed: 済んだ件の終わり方 (直した / そのままにした / 良かった点 / 読み直した)',
  '',
].join('\n')

/** 記事の原稿の feedback.yaml を作るときの頭書き */
export const NOTE_HEAD = [
  '# 指摘のスレッド (ADR-0040・ADR-0046)。記事の原稿への指摘と、その往復を 1 本にまとめる。studio の画面が読み書きし、Claude Code も直接直す。',
  '#   para: 段落の番号 (本文の頭から 1 始まり。見出し・画像も 1 つと数える)。記事全体への指摘は "*"',
  '#   head: 段落の書き出し (空白を除いた先頭 20 字)。本文を直して番号がずれたら、これで付け直す',
  '#   by・replies・ball・closed は発表と同じ',
  '',
].join('\n')

export function readThreads(file) {
  if (!existsSync(file)) return { threads: [], error: null }
  try {
    return { threads: (YAML.parse(readFileSync(file, 'utf8')) ?? {}).threads ?? [], error: null }
  } catch (e) {
    return { threads: [], error: String(e.message ?? e) }
  }
}

/** 文書のまま開いて直し、書き戻す。コメントと並びを保つ */
function edit(file, fn, head = HEAD) {
  const doc = YAML.parseDocument(existsSync(file) ? readFileSync(file, 'utf8') : `${head}threads: []\n`)
  if (!YAML.isSeq(doc.get('threads'))) doc.set('threads', doc.createNode([]))
  const result = fn(doc.get('threads'), doc)
  // 人が読めるよう、1 件を 1 行に詰めず、項目ごとに行を分けて書く
  const seq = doc.get('threads')
  seq.flow = false
  for (const t of seq.items) {
    t.flow = false
    if (YAML.isSeq(t.get('replies'))) {
      t.get('replies').flow = false
      for (const r of t.get('replies').items) r.flow = false
    }
  }
  writeFileSync(file, doc.toString({ lineWidth: 0 }))
  return result
}

const nextId = (seq) => `t${String(Math.max(0, ...seq.items.map((t) => Number(String(t.get('id') ?? '').slice(1)) || 0)) + 1).padStart(3, '0')}`
const find = (seq, id) => {
  const t = seq.items.find((x) => x.get('id') === id)
  if (!t) throw new Error(`スレッド ${id} がありません`)
  return t
}
const now = () => new Date().toISOString()

/**
 * 話者が指摘を書く。次に動くのは Claude。
 * 位置は、発表なら scene と state (無ければシーン全体)、記事なら para と head (ADR-0046)
 */
export function openThread(file, { scene, state, para, head, text }) {
  const where = para !== undefined ? { para, ...(para !== '*' && head ? { head } : {}) } : { scene, ...(state ? { state } : {}) }
  return edit(
    file,
    (seq, doc) => {
      const id = nextId(seq)
      seq.add(doc.createNode({ id, ...where, by: '話者', text, at: now(), ball: 'Claude' }))
      return id
    },
    para !== undefined ? NOTE_HEAD : HEAD,
  )
}

/**
 * 記事の指摘の位置を付け直す (ADR-0046)。fn は { para, head } を受け取り、新しい { para, head } を返す。
 * 位置が変わった件だけを書き換え、変えた数を返す。ファイルが無ければ何もしない
 */
export function retargetThreads(file, fn) {
  if (!existsSync(file)) return 0
  const { threads } = readThreads(file)
  const moves = new Map()
  for (const t of threads) {
    if (t.para === undefined || t.para === '*') continue
    const next = fn({ para: t.para, head: t.head })
    if (next.para !== t.para || next.head !== t.head) moves.set(t.id, next)
  }
  if (moves.size === 0) return 0
  edit(file, (seq) => {
    for (const t of seq.items) {
      const next = moves.get(t.get('id'))
      if (!next) continue
      t.set('para', next.para)
      if (next.para === '*') t.delete('head')
      else t.set('head', next.head)
    }
  })
  return moves.size
}

/** 話者が答える。次に動くのは Claude */
export function replyThread(file, id, text) {
  edit(file, (seq, doc) => {
    const t = find(seq, id)
    if (!YAML.isSeq(t.get('replies'))) t.set('replies', doc.createNode([]))
    t.get('replies').add(doc.createNode({ by: '話者', text, at: now() }))
    t.set('ball', 'Claude')
    t.delete('closed')
  })
}

/** 話者が閉じる。how は「直した」(これでいい) か「そのままにした」(直さなくていい) */
export function closeThread(file, id, how) {
  edit(file, (seq) => {
    const t = find(seq, id)
    t.set('ball', 'none')
    t.set('closed', how === 'そのままにした' ? 'そのままにした' : '直した')
  })
}

/** 閉じた件を、もう一度開く。次に動くのは Claude */
export function reopenThread(file, id) {
  edit(file, (seq) => {
    const t = find(seq, id)
    t.set('ball', 'Claude')
    t.delete('closed')
  })
}

/**
 * 聴衆役の読みを取り込む。コマへの感想を 1 件ずつスレッドにする。良かった点は、済んだ件として残す。
 * 前の読みの感想で、Claude の番のまま残っているものは「読み直した」として閉じる。話者の番のものは残す
 */
export function importRead(file, read) {
  edit(file, (seq, doc) => {
    for (const t of seq.items) {
      if (t.get('by') === '聴衆役' && t.get('ball') === 'Claude' && t.get('read') !== read.id) {
        t.set('ball', 'none')
        t.set('closed', '読み直した')
      }
    }
    let n = Math.max(0, ...seq.items.map((t) => Number(String(t.get('id') ?? '').slice(1)) || 0))
    for (const r of read.readers) {
      for (const note of r.notes) {
        const good = note.kind === 'good'
        seq.add(
          doc.createNode({
            id: `t${String(++n).padStart(3, '0')}`,
            scene: note.scene,
            ...(note.state ? { state: note.state } : {}),
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
