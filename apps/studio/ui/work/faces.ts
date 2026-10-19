// 作品の画面の工程 (design.md 3 章「作品の画面」)。面の並び・使えるか・面ごとの数字・開いたときの子 (目次) を決める。
// レールはこれを並べるだけにする。状態の判定 (下書き・公開 など) はサーバの状態の表が持ち、ここでは中身の有無だけを見る
import type { WorkView } from '../../shared/api'
import type { Face } from '@/lib/router'
import { STAGES, stageStatus } from '@/lib/stages'
import { mine, mmss, sceneSeconds, type Thread } from '@/lib/talk'
import { toDraft, tocOf } from '@/lib/note'

export type Child = { place: string; label: string; level?: number; group?: string; status?: 'todo' | 'doing' | 'done'; mine?: number }
export type FaceItem = {
  face: Face
  label: string
  /** 面の 1 つの数字 (流れは合計時間、コマはコマの数 など) */
  count: string | null
  /** 使えないときの理由。使えるなら null */
  disabled: string | null
  /** 開いているときに出す子 (企画の段階・シーン・見出し) */
  children: Child[]
  /** 企画の段階がすべて済んだ */
  done?: boolean
  /** 数字を、決めた値と食い違った色で出す (持ち時間を超えた) */
  over?: boolean
}

export const PLAN_STAGES = STAGES.filter((s) => !s.later)

/** 公開済みの記事の本文 (HTML) の見出し。原稿の面で読むだけのときの目次にする */
export function archiveHeadings(html: string) {
  const out: { id: string; level: number; text: string }[] = []
  html.replace(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
    out.push({ id: `h-${out.length + 1}`, level: Number(level), text: inner.replace(/<[^>]+>/g, '').trim() })
    return ''
  })
  return out
}

/**
 * 企画として見せる企画シート。公開済み・改稿中の作品で、欄が 1 つも書かれていない企画シート (改稿のときに作ったもの) は、
 * 企画シートの無い作品と同じに見せる (公開したものに企画が未定なのは当たり前で、「未定」「0/4」は的外れなため)
 */
export function planOf(v: WorkView) {
  const b = v.brief
  if (!b) return null
  if (v.state.word !== '公開' && v.state.word !== '改稿中') return b
  const filled = Object.values(b.fields ?? {}).some((x) => (Array.isArray(x) ? x.some((p) => Object.values(p ?? {}).some(Boolean)) : !!String(x ?? '').trim())) || Object.keys(b.gates ?? {}).length > 0
  return filled ? b : null
}

export function facesOf(v: WorkView): FaceItem[] {
  const plan: FaceItem = (() => {
    const b = planOf(v)
    if (!b) return { face: 'plan', label: '企画', count: 'なし', disabled: null, children: [] }
    const st = PLAN_STAGES.map((s) => stageStatus(s, b))
    const done = st.filter((x) => x === 'done').length
    return {
      face: 'plan',
      label: '企画',
      count: `${done}/${PLAN_STAGES.length}`,
      disabled: null,
      done: done === PLAN_STAGES.length,
      children: PLAN_STAGES.map((s, i) => ({ place: s.key, label: s.title[v.kind], status: st[i] })),
    }
  })()

  if (v.kind === 'talk') {
    const body = v.body?.kind === 'talk' ? v.body : null
    const none = body ? null : '絵コンテができると使えます'
    const scenes = body?.board.scenes ?? []
    const total = scenes.reduce((n, s) => n + sceneSeconds(s), 0)
    const threads = v.threads.items as Thread[]
    return [
      plan,
      { face: 'flow', label: '流れ', count: body ? mmss(total) : null, over: !!body?.minutes && total > body.minutes, disabled: none, children: [] },
      {
        face: 'koma',
        label: 'コマ',
        count: body ? `${scenes.reduce((n, s) => n + s.states.length, 0)} コマ` : null,
        disabled: none,
        children: scenes.map((s) => ({ place: s.id, label: s.title, group: s.chapter ?? '', mine: threads.filter((t) => t.scene === s.id && mine(t)).length })),
      },
      { face: 'reads', label: '読み', count: v.reads.length ? `${v.reads.length} 回` : null, disabled: none, children: [] },
      { face: 'publish', label: '公開', count: null, disabled: none, children: [] },
    ]
  }

  const draft = toDraft(v)
  const archive = v.archive
  const none = draft ? null : archive ? '改稿すると使えます' : '原稿を作ると使えます'
  const draftChildren: Child[] = draft
    ? tocOf(draft).map((h) => ({ place: String(h.n), label: h.text, level: h.level, mine: h.mine }))
    : archive?.html
      ? archiveHeadings(archive.html).map((h) => ({ place: h.id, label: h.text, level: h.level }))
      : []
  return [
    plan,
    { face: 'outline', label: '構成', count: draft?.outline.sections.length ? `見出し ${draft.outline.sections.length}` : null, disabled: none, children: [] },
    { face: 'draft', label: '原稿', count: draft ? `${draft.stats.chars.toLocaleString()} 字` : archive ? `${archive.chars.toLocaleString()} 字` : null, disabled: null, children: draftChildren },
    { face: 'reads', label: '読み', count: v.reads.length ? `${v.reads.length} 回` : null, disabled: none, children: [] },
    { face: 'publish', label: '公開', count: null, disabled: draft || archive ? null : '原稿を作ると使えます', children: [] },
  ]
}

/** URL に面が無いときに開く面。下書きで企画が残っていれば企画、それ以外は読む面 (コマ・原稿)。発表で絵コンテが無ければ企画 */
export function defaultFace(v: WorkView): Face {
  const read: Face = v.kind === 'talk' ? 'koma' : 'draft'
  const b = planOf(v)
  const planLeft = !!b && PLAN_STAGES.some((s) => stageStatus(s, b) !== 'done')
  if (v.state.word === '下書き' && planLeft) return 'plan'
  if (v.kind === 'talk' && !v.body) return 'plan'
  return read
}
