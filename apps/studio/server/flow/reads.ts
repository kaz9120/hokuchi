// 聴衆役の読み。読み手 (personas/ のプリセット) が中身を読み、アンケートと単位への感想を返す。
// 読み手は毎回まっさらにするため、Claude は一時ディレクトリで起こす (リポジトリの文脈を拾わせない)。
// 結果は <中身>/reads/<番号>.yaml に残し、感想は feedback.yaml のスレッドにする。判断は作品の Claude に頼む
import { join } from 'node:path'
import type { ReadSummary, Work } from '../../shared/types.ts'
import type { Persona, SurveyItem } from '../../shared/api.ts'
import { UNIT_KINDS } from '../../shared/api.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { parseStoryboard } from '../../../../packages/stage/node/storyboard.mjs'
import { invalid } from '../infra/errors.ts'
import { readText } from '../infra/files.ts'
import { draftFile, parseDraft } from '../media/notes.ts'
import { boardFile } from '../media/talks.ts'
import { noteDir, talkDirOf } from '../store/places.ts'
import { listPersonas, listReads, readReaders, runRead, saveReaders, type ReadPlan } from '../store/reads.ts'
import { importRead, operate, readThreads } from '../store/threads.ts'
import { brokenYaml } from '../store/works.ts'

const NOTE_SURVEY: SurveyItem[] = [
  { key: 'got', group: '届いたか', label: '読みに来た目的を果たせた' },
  { key: 'trouble', group: '届いたか', label: '自分の悩みに触れていた' },
  { key: 'insight', group: '届いたか', label: '新しい見方を得た' },
  { key: 'follow', group: '分かったか', label: '最後まで迷わずに読めた' },
  { key: 'hook', group: '分かったか', label: '冒頭で読み進めたくなった' },
  { key: 'convinced', group: '動くか', label: '主張に納得した' },
  { key: 'action', group: '動くか', label: '読み終えて、やってみようと思うことがある' },
  { key: 'recommend', group: '総合', label: '同じ立場の人に勧めたい' },
]

const TALK_SURVEY: SurveyItem[] = [
  { key: 'got', group: '届いたか', label: '得に来たものを得られた' },
  { key: 'trouble', group: '届いたか', label: '自分の悩みに触れていた' },
  { key: 'insight', group: '届いたか', label: '新しい見方を得た' },
  { key: 'follow', group: '分かったか', label: '話の筋を最後まで追えた' },
  { key: 'glance', group: '分かったか', label: '画面はひと目で分かった' },
  { key: 'convinced', group: '動くか', label: '主張に納得した' },
  { key: 'action', group: '動くか', label: '明日やってみようと思うことがある' },
  { key: 'recommend', group: '総合', label: '同じ立場の人に勧めたい' },
]

export const SURVEY_LABEL: Record<string, string> = Object.fromEntries([...NOTE_SURVEY, ...TALK_SURVEY].map((q) => [q.key, q.label]))

const THREADS_HEAD = [
  '# 指摘のスレッド。聴衆役の感想と、その往復を 1 本にまとめる。studio と Claude が読み書きする。',
  '#   記事は para (段落の番号) と head、発表は scene と state。全体への感想は "*"',
  '#   ball: いま誰が動く番か (話者 / Claude / none)。closed: 直した / そのままにした / 良かった点 / 読み直した',
  '#   replies: Claude は thinking (考えたこと) と change (変えたこと) を足す',
  '',
].join('\n')
const READERS_HEAD = '# この作品を読んでもらう聴衆役。persona は personas/ のプリセットの id。why はなぜ読みに来たか\n'

const kinds = Object.entries(UNIT_KINDS)
  .map(([k, v]) => `${k} (${v})`)
  .join(' / ')

function profile(persona: any, why: string, place: string) {
  return [
    `${persona.name}（${persona.label}）`,
    `どんな人か: ${persona.who}`,
    `悩み: ${persona.troubles}`,
    `知っていること・知らないこと: ${persona.knows}`,
    `引っかかりやすい点: ${persona.pushback}`,
    `${place}のことを: ${persona.knows_speaker ? '前から知っている' : '今日初めて知った'}`,
    why ? `なぜ来たか: ${why}` : '',
  ].filter(Boolean)
}

function notePlan(dir: string, slug: string): ReadPlan {
  const { meta, blocks } = parseDraft(readText(draftFile(slug)) ?? '')
  const title = String(meta.title ?? '')
  const body = blocks
    .filter((b) => b.kind !== 'comment')
    .map((b) => (b.kind === 'image' ? `【${b.n}】[画像]` : b.kind === 'embed' ? `【${b.n}】[埋め込み: ${b.text}]` : `【${b.n}】${b.text}`))
    .join('\n\n')
  return {
    dir,
    survey: NOTE_SURVEY,
    prompt: (persona, why) =>
      [
        'あなたは、次のプロフィールの人物として、note の記事を読みに来ています。SNS のタイムラインか note のおすすめで、この記事のタイトルを見つけて開きました。',
        '',
        ...profile(persona, why, '書き手'),
        '',
        'これから、その記事の本文を渡します。【】の中の数字は段落の番号です。見出しも 1 つの段落として数えます。',
        'あなたはこの題材について、プロフィールに書いてある以上のことを知りません。知らないことを推測で補わないでください。',
        'スマートフォンで、上から 1 度だけ読むものとして扱ってください。退屈になったら、そこで読むのをやめてかまいません。やめた所も感想に書いてください。',
        'ファイルの読み書きや検索などの道具は使わず、下の内容だけを根拠に答えてください。',
        '',
        `タイトル: ${title}`,
        '',
        body,
        '',
        '読み終えたあとのアンケートに、この人物として正直に答えてください。遠慮や励ましは要りません。',
        '1) 次の 8 項目に、1 (まったく当てはまらない) 〜 5 (とても当てはまる) の点と、理由を 1 行で。',
        NOTE_SURVEY.map((q, i) => `  ${i + 1}. ${q.key}: ${q.label}`).join('\n'),
        '2) message: この記事がいちばん伝えたかったことは何だと思ったかを、1 文で。',
        '3) wish: ここがこうなっていたらもっと良かった、を 1 つだけ。',
        `4) notes: 段落へのピンポイントな感想を、大事な順に 12 件まで。para には【】の中の番号、kind には ${kinds} のどれかを入れます。記事全体への感想は para を 0 にします。良かった所も入れてください。`,
        '',
        '答えは次の JSON だけにしてください。前後に説明やコードブロックを付けないでください。',
        '{"scores":{"got":{"score":3,"reason":"…"},"trouble":{"score":3,"reason":"…"},"insight":{"score":3,"reason":"…"},"follow":{"score":3,"reason":"…"},"hook":{"score":3,"reason":"…"},"convinced":{"score":3,"reason":"…"},"action":{"score":3,"reason":"…"},"recommend":{"score":3,"reason":"…"}},"message":"…","wish":"…","notes":[{"para":1,"kind":"word","text":"…"}]}',
      ].join('\n'),
    notes: (raw) =>
      raw.map((n) => {
        const b = blocks.find((x) => x.n === Number(n.para))
        return { para: b ? b.n : '*', ...(b ? { head: b.head } : {}), kind: UNIT_KINDS[n.kind] ? n.kind : 'unconvinced', text: String(n.text ?? '') } as any
      }),
    meta: { paragraphs: blocks.length },
  }
}

const MEMO = /（(?:要確認|検討中|調達する写真)[^）]*）/g

function talkPlan(dir: string): ReadPlan {
  const board = parseStoryboard(readText(boardFile(dir)) ?? '')
  const screens = board.scenes
    .map((s: any) => [`【${s.id}】`, ...s.states.map((st: any, i: number) => `  ${s.id} の ${i + 1} / 画面: ${st.screen.replace(MEMO, '').trim()}${st.notes.join(' ').trim() ? `\n    話すこと: ${st.notes.join(' ').replace(MEMO, '').trim()}` : ''}`)].join('\n'))
    .join('\n')
  return {
    dir,
    survey: TALK_SURVEY,
    prompt: (persona, why) =>
      [
        'あなたは、次のプロフィールの人物として、ある登壇を聞きに来ています。',
        '',
        ...profile(persona, why, '話し手'),
        board.meta['場'] ? `登壇の場: ${board.meta['場']}` : '',
        '',
        'これから、その登壇の画面と、話し手が話す内容を順に渡します。画面は、場面ごとに状態が切り替わっていきます。',
        'あなたはこの題材について、プロフィールに書いてある以上のことを知りません。知らないことを推測で補わないでください。',
        '画面の文字は 3 秒ほどしか見られないものとして読んでください。話す内容は、1 度だけ耳で聞いたものとして扱ってください。',
        'ファイルの読み書きや検索などの道具は使わず、下の内容だけを根拠に答えてください。',
        '',
        `演題: ${board.title}`,
        '',
        screens,
        '',
        '聞き終えたあとのアンケートに、この人物として正直に答えてください。遠慮や励ましは要りません。',
        '1) 次の 8 項目に、1 (まったく当てはまらない) 〜 5 (とても当てはまる) の点と、理由を 1 行で。',
        TALK_SURVEY.map((q, i) => `  ${i + 1}. ${q.key}: ${q.label}`).join('\n'),
        '2) message: この登壇がいちばん伝えたかったことは何だと思ったかを、1 文で。',
        '3) wish: ここがこうなっていたらもっと良かった、を 1 つだけ。',
        `4) notes: 場面へのピンポイントな感想を、大事な順に 12 件まで。scene には【】の中の名前、state にはその場面の中の番号、kind には ${kinds} のどれかを入れます。場面全体への感想は state を 0 にします。良かった所も入れてください。`,
        '',
        '答えは次の JSON だけにしてください。前後に説明やコードブロックを付けないでください。',
        '{"scores":{"got":{"score":3,"reason":"…"},"trouble":{"score":3,"reason":"…"},"insight":{"score":3,"reason":"…"},"follow":{"score":3,"reason":"…"},"glance":{"score":3,"reason":"…"},"convinced":{"score":3,"reason":"…"},"action":{"score":3,"reason":"…"},"recommend":{"score":3,"reason":"…"}},"message":"…","wish":"…","notes":[{"scene":"…","state":1,"kind":"word","text":"…"}]}',
      ]
        .filter((l) => l !== '')
        .join('\n'),
    notes: (raw) =>
      raw.map((n) => {
        const scene = board.scenes.find((s: any) => s.id === n.scene)
        const state = Number(n.state) || 0
        return { scene: scene ? scene.id : '*', state: scene && state >= 1 && state <= scene.states.length ? state : 0, kind: UNIT_KINDS[n.kind] ? n.kind : 'unconvinced', text: String(n.text ?? '') } as any
      }),
    meta: { scenes: board.scenes.length, states: board.scenes.reduce((a: number, s: any) => a + s.states.length, 0) },
  }
}

/** 読みの置き場 (原稿かトークのフォルダ) */
export function readsDir(work: Work): string | null {
  if (work.kind === 'note') return work.note?.slug ? noteDir(work.note.slug) : null
  return talkDirOf(work)
}

/** 企画で決めた読者・聴衆を、読み手にできる形にする (id は decided:*)。プリセットより先に並べる */
export function decidedPersonas(work: Work): Persona[] {
  const d = work.decided ?? {}
  if (work.kind === 'note' && d.reader?.who)
    return [{ id: 'decided:reader', name: '決めた読者', label: d.reader.who, who: d.reader.who, troubles: d.reader.trouble ?? '', knows: d.reader.knows ?? '', pushback: '' }]
  return (d.audience ?? []).map((a, i) => ({ id: `decided:${i}`, name: a.name, label: `決めた聴衆（${a.who ?? ''}）`, who: a.who ?? '', troubles: a.trouble ?? '', knows: '', pushback: '', why: a.why } as Persona))
}

export function personasList(work?: Work): Persona[] {
  return [...(work ? decidedPersonas(work) : []), ...listPersonas()]
}

export function readersOf(work: Work) {
  return readReaders(readsDir(work), decidedPersonas(work)).readers.map((r) => ({ persona: r.id, name: r.name, label: r.label, why: r.why }))
}

export function setReaders(work: Work, readers: { persona: string; why?: string }[]) {
  const dir = readsDir(work)
  if (!dir) throw invalid('中身がまだありません')
  saveReaders(dir, READERS_HEAD, readers, undefined, decidedPersonas(work))
}

export async function read(work: Work, onProgress: (done: number, total: number) => void, onCost: (usd: number) => void): Promise<number> {
  const dir = readsDir(work)
  if (!dir) throw invalid('中身がまだありません')
  const plan = { ...(work.kind === 'note' ? notePlan(dir, work.note!.slug) : talkPlan(dir)), onCost, extra: decidedPersonas(work) }
  const bad = brokenYaml([join(dir, 'feedback.yaml')])
  if (bad.length) throw invalid(`feedback.yaml が YAML として読めないので、感想を足せません (${bad[0].error})。会話で直すよう頼んでください`)
  const result = await runRead(plan, (p) => onProgress(p.done, p.total))
  importRead(join(dir, 'feedback.yaml'), THREADS_HEAD, result as any, work.kind === 'note' ? (n: any) => ({ para: n.para, ...(n.head ? { head: n.head } : {}) }) : (n: any) => ({ scene: n.scene, ...(n.state ? { state: n.state } : {}) }))
  return result.readers.reduce((s, r) => s + r.notes.filter((n) => n.kind !== 'good').length, 0)
}

export function reopen(work: Work, threadId: string) {
  const dir = readsDir(work)
  if (!dir) throw invalid('中身がまだありません')
  operate(join(dir, 'feedback.yaml'), THREADS_HEAD, threadId, 'reopen', {} as any)
}

export function readSummary(work: Work): ReadSummary | undefined {
  const dir = readsDir(work)
  if (!dir) return undefined
  const rounds = listReads(dir).map((r: any) => ({ id: String(r.id), at: r.at, readers: (r.readers ?? []).map((x: any) => ({ name: x.name, label: x.label, scores: Object.fromEntries(Object.entries(x.scores ?? {}).map(([k, v]: any) => [k, v.score])), message: x.message, wish: x.wish })) }))
  const { items } = readThreads(join(dir, 'feedback.yaml'))
  const listeners = items.filter((t: any) => t.by === '聴衆役')
  if (!rounds.length && !listeners.length) return { rounds: [], open: 0, closed: { fixed: 0, kept: 0, good: 0 }, threads: [] }
  // シーンは id ではなく絵コンテの見出しで見せる
  const titles = new Map<string, string>(work.kind === 'talk' ? parseStoryboard(readText(boardFile(dir)) ?? '').scenes.map((s: any) => [s.id, s.title]) : [])
  const where = (t: any) => (t.para !== undefined ? (t.para === '*' ? '記事全体' : `段落 ${t.para}`) : t.scene === '*' ? 'トーク全体' : `「${titles.get(t.scene) ?? t.scene}」${t.state ? ` のコマ ${t.state}` : ''}`)
  return {
    rounds,
    open: listeners.filter((t: any) => t.ball === 'Claude').length,
    closed: { fixed: listeners.filter((t: any) => t.closed === '直した').length, kept: listeners.filter((t: any) => t.closed === 'そのままにした').length, good: listeners.filter((t: any) => t.closed === '良かった点').length },
    threads: listeners
      .filter((t: any) => t.closed !== '良かった点' && t.closed !== '読み直した')
      .slice(-60)
      .map((t: any) => ({ id: t.id, where: where(t), by: t.name ?? t.by, text: t.text, ball: t.ball, closed: t.closed, thinking: (t.replies ?? []).filter((r: any) => r.by === 'Claude').at(-1)?.thinking })),
  }
}
