// 指摘のスレッド (ADR-0040)。talks/<トーク>/feedback.yaml に、1 件の指摘とその往復を 1 本として残す。
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

export function readThreads(file) {
  if (!existsSync(file)) return { threads: [], error: null }
  try {
    return { threads: (YAML.parse(readFileSync(file, 'utf8')) ?? {}).threads ?? [], error: null }
  } catch (e) {
    return { threads: [], error: String(e.message ?? e) }
  }
}

/** 文書のまま開いて直し、書き戻す。コメントと並びを保つ */
function edit(file, fn) {
  const doc = YAML.parseDocument(existsSync(file) ? readFileSync(file, 'utf8') : `${HEAD}threads: []\n`)
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

/** 話者が指摘を書く。次に動くのは Claude */
export function openThread(file, { scene, state, text }) {
  return edit(file, (seq, doc) => {
    const id = nextId(seq)
    seq.add(doc.createNode({ id, scene, ...(state ? { state } : {}), by: '話者', text, at: now(), ball: 'Claude' }))
    return id
  })
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
