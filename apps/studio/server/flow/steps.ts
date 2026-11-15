// ステップと進む操作の表。ワークフローを分け直すときは、まずこの表を直す。
// 番は保存しない。実行の記録と作品の記録から、ここで導く
import type { Kind, Proposals, Step, Turn, Work } from '../../shared/types.ts'
import { STEPS } from '../../shared/types.ts'

/** 進む操作。押すと確定した値を書き、次のステップへ進め、新しいセッションで次を頼む */
/** prompt が空なら、ステップだけ進めて Claude は動かさない (することが無い進み方) */
export type Advance = { action: string; from: Step; to: Step; label: string; prompt: string }

export const ADVANCES: Record<Kind, Advance[]> = {
  note: [
    { action: 'decide-core', from: 'core', to: 'outline', label: 'この内容で構成へ', prompt: '伝えたいことが決まった。構成に進んでほしい。フックの案と骨組みを書き、厚く書く所の材料を聞いて' },
    { action: 'decide-outline', from: 'outline', to: 'draft', label: 'この構成で書く', prompt: '構成が決まった。原稿を書いてほしい。書き終えたら 2 割削り、lint を通し、見出しごとの字数を返して' },
    { action: 'to-publish', from: 'draft', to: 'publish', label: '公開の準備へ', prompt: '原稿はこれでよい。公開の準備に進んでほしい。タイトル・タグ・置き場の名前・見出し画像のモチーフの案を書いて' },
  ],
  talk: [
    { action: 'decide-core', from: 'core', to: 'outline', label: 'この内容で構成へ', prompt: '場と聴衆と中核メッセージが決まった。メッセージマップを考えてほしい' },
    { action: 'decide-map', from: 'outline', to: 'storyboard', label: 'この構成で絵コンテへ', prompt: 'メッセージマップが決まった。トークのフォルダを用意したので、完全版の絵コンテを書き、下書きのシーンを置き、聴衆役に読ませて直して' },
    { action: 'decide-storyboard', from: 'storyboard', to: 'slides', label: 'この絵コンテで作る', prompt: '絵コンテが決まった。持ち時間に合わせて削り、シーンを実装し、check で確かめて' },
    { action: 'ready', from: 'slides', to: 'present', label: '発表の準備ができた', prompt: '' },
  ],
}

export const advanceOf = (kind: Kind, step: Step) => ADVANCES[kind].find((a) => a.from === step) ?? null

/** 話者に求めることの既定の文。Claude が ask を書かなかったときに出す */
const DEFAULT_ASK: Record<Kind, Partial<Record<Step, string>>> = {
  note: {
    core: '伝えたいことの候補を選ぶか、話して直す',
    outline: '構成を読み、厚く書く所の材料を話す',
    draft: '原稿を読み、直したい所を指して話す',
    publish: 'タイトルと名前を選び、note に貼って公開した URL を貼る',
  },
  talk: {
    core: '場と聴衆と伝えたいことを確かめて選ぶ',
    outline: '章と厚みを読んで決める',
    storyboard: 'コマを読み、直したい所を指して話す',
    slides: 'スライドを通しで見て、直したい所を指して話す',
    present: '発表したら「発表した」を押す',
  },
}

/** 片付けで残っていること。出した記録があるときだけ */
export function choresOf(work: Work, proposals: Proposals, dirty: boolean): string[] {
  if (!work.shipped || work.revising || work.reworking) return []
  const out: string[] = []
  if (!work.learned) out.push(proposals.learnings?.length ? '学びの案を選ぶ' : '学びの案を出してもらう')
  if (!work.recorded && dirty) out.push('変更を記録する')
  return out
}

export function turnOf(work: Work, running: boolean, chores: string[]): Turn {
  if (work.dropped) return 'dropped'
  if (running) return 'claude'
  // 改稿中・手直し中は、出したあとでも話者の番
  if (work.shipped && !work.revising && !work.reworking && chores.length === 0) return 'shipped'
  return 'you'
}

export function askOf(work: Work, proposals: Proposals, turn: Turn, chores: string[]): string {
  if (turn === 'dropped') return 'やめた作品'
  if (turn === 'shipped') return work.kind === 'note' ? '公開した' : work.decided.scope === 'public' ? 'サイトに出した' : '社内で発表した'
  if (chores.length) return chores.join('・')
  if (turn === 'claude') return 'Claude が作業中'
  if (work.kind === 'talk' && work.step === 'present' && work.presented && work.decided.scope === 'public') return '変わった見た目を確かめて、サイトに出す'
  if (work.kind === 'talk' && work.step === 'present' && !work.presented && work.decided.event?.date && work.decided.event.date < today()) return '発表したか、日を直すかを決める'
  return proposals.ask?.text || DEFAULT_ASK[work.kind][work.step] || '話しかける'
}

export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

export const stepIndex = (work: Work) => STEPS[work.kind].indexOf(work.step)
