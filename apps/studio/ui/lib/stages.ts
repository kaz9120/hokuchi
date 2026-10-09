// 作品の段階と欄の定義 (docs/design.md の 3)。発表と記事で骨組みを揃え、欄の中身だけを変える
export type Kind = 'talk' | 'note'

export type Persona = {
  name: string
  who: string
  why: string
  trouble: string
  solve: string
  action: string
  pushback: string
  approach: string
}

export type Brief = {
  id: string
  kind: Kind
  title: string
  createdAt: string
  updatedAt: string
  seedId: string | null
  fields: Record<string, any> & { personas?: Persona[] }
  gates: Record<string, { passedAt: string; value: string }>
  candidates: Record<string, { at: string; items: { text: string; note: string }[] }>
}

export type Field = {
  key: string
  label: string
  help?: string
  placeholder?: string
  type: 'text' | 'textarea' | 'choice'
  options?: string[]
}

export type Stage = {
  key: string
  n: number
  title: string
  /** 人が通す関門か */
  gate?: boolean
  /** 何を決める段階か。画面の上に出す */
  purpose: Record<Kind, string>
  fields?: Record<Kind, Field[]>
  /** その段階で AI に頼めること (サーバの TASKS の key) */
  tasks?: Record<Kind, string[]>
  /** まだ作っていない段階 */
  later?: boolean
  source: string
}

// slide:ology p.35 の 7 つの問い
export const PERSONA_FIELDS: { key: keyof Persona; label: string; help: string }[] = [
  { key: 'who', label: 'どんな人か', help: '属性から入ってよいが、最後は 1 人の人として' },
  { key: 'why', label: 'なぜここにいるのか', help: '自分から来たのか、来させられたのか' },
  { key: 'trouble', label: '何に悩んでいるか', help: '' },
  { key: 'solve', label: 'その悩みをどう解決するか', help: 'この発表で、聴衆が得るもの' },
  { key: 'action', label: '何をしてほしいか', help: '「だから何？」への答え。聞き終えて取ってほしい行動' },
  { key: 'pushback', label: 'どんな反発を受けるか', help: '' },
  { key: 'approach', label: '最適なアプローチは何か', help: '会場・話し方・資料の渡し方まで' },
]

export const emptyPersona = (): Persona => ({ name: '', who: '', why: '', trouble: '', solve: '', action: '', pushback: '', approach: '' })

export const STAGES: Stage[] = [
  {
    key: 'seed',
    n: 1,
    title: '種',
    purpose: { talk: '発表の場と、手元の素材を集める', note: '書きたい出来事と、手元の素材を集める' },
    fields: {
      talk: [
        { key: 'event', label: 'イベント', type: 'text', placeholder: "Dev's Garden" },
        { key: 'eventUrl', label: 'イベントの URL', type: 'text', placeholder: 'https://…' },
        { key: 'date', label: '日付', type: 'text', placeholder: '2026-11-20' },
        { key: 'duration', label: '持ち時間', type: 'text', placeholder: '10 分' },
        { key: 'venue', label: '会場と聴衆の規模', type: 'text', help: '会場の明るさ・広さで、背景や文字の大きさが変わる (slide:ology p.152)' },
        { key: 'stance', label: '立場', type: 'choice', options: ['個人', 'MOSH'] },
        { key: 'publish', label: '公開', type: 'choice', options: ['公開する', '社内向け', '未定'] },
        { key: 'materials', label: '素材', type: 'textarea', help: '過去の資料・記事・社内ドキュメント・URL。1 行に 1 つ' },
      ],
      note: [
        { key: 'happening', label: '出来事', type: 'textarea', help: '何があって、何に引っかかったか。「なんか面白い」の中身を言葉にする (鈴木)' },
        { key: 'genre', label: '種類', type: 'choice', options: ['情報', '日記', '主張'], help: '知らない人の日記と主張は読まれにくい (けんすう)' },
        { key: 'materials', label: '素材', type: 'textarea', help: 'メモ・書き起こし・元の登壇資料・URL。1 行に 1 つ' },
      ],
    },
    source: 'slide:ology p.32, 39 / note の本 p.118-125 / 鈴木・けんすう',
  },
  {
    key: 'audience',
    n: 2,
    title: '相手',
    purpose: { talk: '聴衆を、名前のある 1 人として描く', note: '読者を、悩みのある 1 人として描く' },
    fields: {
      talk: [],
      note: [
        { key: 'readerWho', label: '誰に向けて書くか', type: 'textarea', help: '属性ではなく悩みで絞り、1 人に (note の本 p.126, 130)。過去の自分でもよい' },
        { key: 'readerTrouble', label: 'その人の悩み', type: 'textarea', help: 'いつ頃の、どんな悩みか。どんな言葉があれば救われたか (p.131)' },
        { key: 'readerKnows', label: 'その人がいま知っていること', type: 'textarea', help: '知っていることは書かず、知らないことだけを書く' },
      ],
    },
    tasks: { talk: ['audience.gaps', 'audience.pushback'], note: ['audience.gaps'] },
    source: 'slide:ology p.35-37 / note の本 p.126-132 / 白水・佐伯',
  },
  {
    key: 'goal',
    n: 3,
    title: 'ゴール',
    purpose: { talk: '聞き終えた聴衆に、何をしてほしいか', note: '読み終えた読者に、どうなっていてほしいか' },
    fields: {
      talk: [
        { key: 'callToAction', label: '行動への呼びかけ', type: 'textarea', help: '何より大切なのは行動への呼びかけ (slide:ology p.34)' },
        { key: 'relation', label: '聴衆との関係', type: 'choice', options: ['ヒーロー', '応援団長'], help: '聴衆にとって、自分はヒーローか、応援団長か。どちらも自分のためではなく聴衆のために力を尽くす (slide:ology p.36)' },
      ],
      note: [
        { key: 'afterFeeling', label: '読後感', type: 'textarea', help: '読み終えて何を思ってほしいか (鈴木)' },
        { key: 'takeaway', label: '持ち帰ってほしいもの', type: 'choice', options: ['知識', '視点', '行動'] },
      ],
    },
    tasks: { talk: ['goal.candidates'], note: ['goal.candidates'] },
    source: 'slide:ology p.34-36 / note の本 p.636 / 鈴木',
  },
  {
    key: 'oneLiner',
    n: 4,
    title: '一言',
    gate: true,
    purpose: { talk: '中核メッセージを 1 文にする', note: '芯を 1 文にする' },
    fields: {
      talk: [{ key: 'oneLiner', label: '中核メッセージ', type: 'textarea', help: '主張の形で。「〜について話す」は題目で、主張ではない' }],
      note: [{ key: 'oneLiner', label: '芯', type: 'textarea', help: '主張の形で。体験から出ていて、読者にとって新しいこと' }],
    },
    tasks: { talk: ['oneLiner.candidates', 'oneLiner.critique'], note: ['oneLiner.candidates', 'oneLiner.critique'] },
    source: '鈴木・佐伯 / note の本 p.161 / slide:ology p.39, 47',
  },
  { key: 'diverge', n: 5, title: '発散と取捨', later: true, purpose: { talk: '案を 5 つ以上出してから、1 つを残して捨てる', note: '材料を並べ、使うもの・捨てるものを決める' }, source: 'slide:ology p.46-48, 60 / 佐伯' },
  { key: 'structure', n: 6, title: '構成', gate: true, later: true, purpose: { talk: 'メッセージマップから絵コンテへ', note: '冒頭を固定し、箇条書きの流れを作る' }, source: 'slide:ology p.39, 48 / 村井' },
  { key: 'make', n: 7, title: '制作', later: true, purpose: { talk: 'シーンを実装する', note: '書く' }, source: '' },
  { key: 'review', n: 8, title: '見直し', gate: true, later: true, purpose: { talk: '機械の検査と、人のチェック', note: '機械の検査と、「よく書けた」と思えるか' }, source: 'slide:ology p.160, 256 / 村井 / note の本 p.634' },
  { key: 'publish', n: 9, title: '公開', later: true, purpose: { talk: '公開の可否・OGP・ノートの仕上げ', note: 'タイトル・タグ・見出し画像・公開前の仮説' }, source: 'note の本 p.213-218 / 鈴木' },
  { key: 'retro', n: 10, title: '振り返り', later: true, purpose: { talk: 'リハーサルと当日の反応', note: '仮説と結果を並べる' }, source: 'slide:ology p.241 / 鈴木' },
]

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0

/** 段階の状態。関門は人が通したか、通したあとに中身が変わっていないかで決める */
export function stageStatus(stage: Stage, brief: Brief): 'todo' | 'doing' | 'done' {
  const f = brief.fields
  if (stage.later) return 'todo'
  if (stage.gate) {
    const g = brief.gates[stage.key]
    if (g && g.value === (f[stage.key] ?? '')) return 'done'
    return filled(f[stage.key]) ? 'doing' : 'todo'
  }
  if (stage.key === 'audience' && brief.kind === 'talk') {
    const p = f.personas ?? []
    if (p.some((x) => filled(x.who) && filled(x.action))) return 'done'
    return p.some((x) => Object.values(x).some(filled)) ? 'doing' : 'todo'
  }
  const keys = (stage.fields?.[brief.kind] ?? []).map((x) => x.key)
  const n = keys.filter((k) => filled(f[k])).length
  return n === 0 ? 'todo' : n === keys.length ? 'done' : 'doing'
}

export const KIND_LABEL: Record<Kind, string> = { talk: '発表', note: '記事' }

/** 相手の要約。画面の上に出す */
export function audienceSummary(brief: Brief) {
  if (brief.kind === 'talk') {
    const p = (brief.fields.personas ?? []).filter((x) => x.name || x.who)
    return p.map((x) => (x.name ? `${x.name}${x.who ? `（${x.who.split('\n')[0]}）` : ''}` : x.who.split('\n')[0])).join(' / ')
  }
  return (brief.fields.readerWho ?? '').split('\n')[0]
}
