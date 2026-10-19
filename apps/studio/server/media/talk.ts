// 発表の部品 (rebuild.md 4.3)。中身はトーク (talk.tsx・storyboard.md・シーン)。単位はコマ (シーン + 状態。番号は 1 始まり)。
// 絵コンテの読み書きは packages/stage/node/storyboard.mjs が持つ。Markdown のまま、該当する行だけを書き換える
import { join } from 'node:path'
import type { Board, SurveyItem, TalkBody, Thread } from '../../shared/api.ts'
import { UNIT_KINDS } from '../../shared/api.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { moveScene, parseStoryboard, replaceNotes, replaceSceneMeta, seconds } from '../../../../packages/stage/node/storyboard.mjs'
// @ts-expect-error JS のモジュール (型が無い)
import { publicInfo } from '../../../../packages/stage/node/build.mjs'
import { shownDir } from '../infra/config.ts'
import { conflict, invalid } from '../infra/errors.ts'
import { readText, readVersioned, rewrite } from '../infra/files.ts'
import { loadTalkDef, theSite, type SiteTalk } from '../infra/site.ts'
import type { WorkRef } from '../domain/work.ts'
import type { Media } from './types.ts'

/** アンケートの 8 項目。5 段階と理由 1 行。根拠は docs/research/audience-survey.md */
const SURVEY: SurveyItem[] = [
  { key: 'got', group: '届いたか', label: '得に来たものを得られた' },
  { key: 'trouble', group: '届いたか', label: '自分の悩みに触れていた' },
  { key: 'insight', group: '届いたか', label: '新しい見方を得た' },
  { key: 'follow', group: '分かったか', label: '話の筋を最後まで追えた' },
  { key: 'glance', group: '分かったか', label: '画面はひと目で分かった' },
  { key: 'convinced', group: '動くか', label: '主張に納得した' },
  { key: 'action', group: '動くか', label: '明日やってみようと思うことがある' },
  { key: 'recommend', group: '総合', label: '同じ立場の人に勧めたい' },
]

const THREADS_HEAD = [
  '# 指摘のスレッド (ADR-0040)。1 件の指摘と、その往復を 1 本にまとめる。studio の画面が読み書きし、Claude Code も直接直す。',
  '#   scene: 絵コンテのシーン id。トーク全体への指摘は "*"。state: コマの番号 (1 始まり)。無ければシーン全体',
  '#   by: 話者 / 聴衆役 / Claude / 検査。聴衆役は name (誰が)・read (何回目の読みか)・kind (感想の種類) を持つ',
  '#   replies: 返事を順に足す。Claude は thinking (考えたこと) と change (変えたこと)、話者は text',
  '#   ball: いま誰が動く番か。話者 / Claude / none。closed: 済んだ件の終わり方 (直した / そのままにした / 良かった点 / 読み直した)',
  '',
].join('\n')

const boardFile = (t: SiteTalk) => join(t.dir, 'storyboard.md')
const need = (ref: WorkRef): SiteTalk => {
  if (!ref.talk) throw invalid('発表のトークがありません。Claude Code に絵コンテを頼んでください')
  return ref.talk
}
const boardOf = (t: SiteTalk): Board & { scenes: (Board['scenes'][number] & { line: number })[] } => parseStoryboard(readText(boardFile(t)) ?? '')
/** 話すことの比べ方。絵コンテの読み取りと同じく、行をつないで前後の空白を除く */
const notesOf = (board: Board, scene: string, n: number) => board.scenes.find((s) => s.id === scene)?.notes[n - 1]

/** talk.tsx を読み直して、一覧の名前や公開の可否を最新にする (サイトの開発サーバの監視を待たずに) */
export async function refreshTalkInfo(t: SiteTalk) {
  t.vite.moduleGraph.invalidateAll()
  const def = await loadTalkDef(t.vite)
  t.info = { ...publicInfo(t.dir, def), ...(t.outside && { public: false }) }
  t.firstScene = def.scenes[0]?.id ?? t.firstScene
}

// 作り手の覚え書き (要確認など) は、聴衆には見えないので渡さない
const MEMO = /（(?:要確認|検討中|調達する写真)[^）]*）/g

/** 絵コンテから、画面と話すことだけを書き出す。シーン id と状態の番号を付けて、感想をコマに紐づけられるようにする */
function screens(board: Board) {
  const out: string[] = []
  for (const s of board.scenes) {
    out.push(`\n【${s.id}】`)
    s.states.forEach((st, i) => {
      out.push(`  ${s.id} の ${i + 1} / 画面: ${st.screen.replace(MEMO, '').trim()}`)
      const notes = st.notes.join(' ').replace(MEMO, '').trim()
      if (notes) out.push(`    話すこと: ${notes}`)
    })
  }
  return out.join('\n').trim()
}

function readerPrompt(persona: any, why: string, board: Board) {
  const place = board.meta['場'] ? `登壇の場: ${board.meta['場']}` : ''
  const items = SURVEY.map((q, i) => `  ${i + 1}. ${q.key}: ${q.label}`).join('\n')
  const kinds = Object.entries(UNIT_KINDS)
    .map(([k, v]) => `${k} (${v})`)
    .join(' / ')
  return [
    'あなたは、次のプロフィールの人物として、ある登壇を聞きに来ています。',
    '',
    `${persona.name}（${persona.label}）`,
    `どんな人か: ${persona.who}`,
    `悩み: ${persona.troubles}`,
    `知っていること・知らないこと: ${persona.knows}`,
    `引っかかりやすい点: ${persona.pushback}`,
    `話し手のことを: ${persona.knows_speaker ? '前から知っている' : '今日初めて知った'}`,
    why ? `なぜここにいるか: ${why}` : '',
    place,
    '',
    'これから、その登壇の画面と、話し手が話す内容を順に渡します。画面は、場面ごとに状態が切り替わっていきます。',
    'あなたはこの題材について、プロフィールに書いてある以上のことを知りません。知らないことを推測で補わないでください。',
    '画面の文字は 3 秒ほどしか見られないものとして読んでください。話す内容は、1 度だけ耳で聞いたものとして扱ってください。',
    'ファイルの読み書きや検索などの道具は使わず、下の内容だけを根拠に答えてください。',
    '',
    `演題: ${board.title}`,
    '',
    screens(board),
    '',
    '聞き終えたあとのアンケートに、この人物として正直に答えてください。遠慮や励ましは要りません。',
    '',
    '1) 次の 8 項目に、1 (まったく当てはまらない) 〜 5 (とても当てはまる) の点と、理由を 1 行で。',
    items,
    '2) message: この登壇がいちばん伝えたかったことは何だと思ったかを、1 文で。',
    '3) wish: ここがこうなっていたらもっと良かった、を 1 つだけ。いちばん効くものを。',
    `4) notes: 場面へのピンポイントな感想を、大事な順に 12 件まで。scene には【】の中の名前、state にはその場面の中の番号、kind には ${kinds} のどれかを入れます。場面全体への感想は state を 0 にします。良かった所も、あれば入れてください。`,
    '',
    '答えは次の JSON だけにしてください。前後に説明やコードブロックを付けないでください。',
    '{"scores":{"got":{"score":3,"reason":"…"},"trouble":{"score":3,"reason":"…"},"insight":{"score":3,"reason":"…"},"follow":{"score":3,"reason":"…"},"glance":{"score":3,"reason":"…"},"convinced":{"score":3,"reason":"…"},"action":{"score":3,"reason":"…"},"recommend":{"score":3,"reason":"…"}},"message":"…","wish":"…","notes":[{"scene":"…","state":1,"kind":"word","text":"…"}]}',
  ]
    .filter((l) => l !== '')
    .join('\n')
    .replace(/\n(演題:|これから、|聞き終えたあと|1\) |答えは)/g, '\n\n$1')
}

/** talk.tsx の title を書き換える。defineTalk の title: '…' が 1 か所だけのときに限る */
function rewriteTalkTitle(src: string, title: string) {
  const re = /^(\s*)title:\s*(['"])((?:\\.|(?!\2).)*)\2(,?)[ \t]*$/gm
  const hits = [...src.matchAll(re)]
  if (hits.length !== 1) throw invalid('talk.tsx のタイトルの行を 1 か所に決められませんでした。Claude Code に頼んでください')
  const q = hits[0][2]
  const escaped = title.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), `\\${q}`)
  return src.replace(re, (_m, indent, quote, _t, comma) => `${indent}title: ${quote}${escaped}${quote}${comma}`)
}

export const talk: Media = {
  kind: 'talk',
  words: { work: '発表', oneLiner: '中核メッセージ', audience: '聴衆' },
  threadsHeader: THREADS_HEAD,
  readersHeader: '# この発表を読んでもらう聴衆役 (ADR-0039)。persona は personas/ のプリセットの id。\n# why は「場」の文脈で、なぜこの発表を聞きに来たかを書く。\n',
  survey: SURVEY,

  home: (ref) => ref.talk?.dir ?? null,
  watchDirs: (ref) => (ref.talk ? [ref.talk.dir] : []),

  async body(ref, { thumbsVersion }) {
    const t = ref.talk
    if (!t) return null
    const { text, version } = readVersioned(boardFile(t))
    const board = parseStoryboard(text ?? '')
    for (const s of board.scenes) {
      delete s.line
      for (const st of s.states) {
        delete st.line
        delete st.noteLines
      }
    }
    let implemented: { id: string; steps: number }[] = []
    let loadError: string | null = null
    try {
      implemented = (await loadTalkDef(t.vite)).scenes.map((s) => ({ id: s.id, steps: s.steps }))
    } catch (e) {
      loadError = String((e as Error).message ?? e)
    }
    const { slug, name, date, tag, title } = t.info
    const view: TalkBody = {
      kind: 'talk',
      slug,
      name,
      date,
      tag,
      title,
      dir: shownDir(t.dir),
      outside: t.outside,
      event: t.info.event?.name ?? null,
      minutes: seconds(board.meta['持ち時間'] ?? ''),
      board,
      version,
      implemented,
      loadError,
      thumbsVersion,
      stageUrl: `${theSite().url}/${slug}/`,
    }
    return view
  },
  bodyTitle: (ref) => ref.talk?.info.title ?? null,
  oneLinerFromBody: (ref) => (ref.talk ? (boardOf(ref.talk).meta['中核メッセージ'] ?? '') : ''),

  async setTitle(ref, { orig, title }) {
    const t = ref.talk
    if (!t) return false
    if (t.info.title !== orig) throw conflict('タイトルが、ほかで変更されています', t.info.title)
    rewrite(join(t.dir, 'talk.tsx'), (src) => rewriteTalkTitle(src, title))
    await refreshTalkInfo(t)
    return true
  },

  editUnit(ref, unit, { orig, text }) {
    const t = need(ref)
    const [scene, n] = [unit.split('/')[0], Number(unit.split('/')[1])]
    rewrite(boardFile(t), (md) => {
      const cur = notesOf(parseStoryboard(md), scene, n)
      if (cur === undefined) throw invalid(`${scene} のコマ ${n} が絵コンテにありません`)
      if (cur !== String(orig ?? '').trim()) throw conflict('この話すことは、ほかで変更されています。画面を読み込み直してから直してください', cur)
      return replaceNotes(md, scene, n - 1, String(text ?? ''))
    })
  },
  appendUnit: () => {
    throw invalid('発表のコマは、絵コンテで足します。Claude Code に頼んでください')
  },

  editOutline(ref, op) {
    const t = need(ref)
    if (op.op === 'meta') {
      if (!['伝えること', '粗密'].includes(op.key)) throw invalid(`${op.key} は直せません`)
      rewrite(boardFile(t), (md) => {
        const scene = parseStoryboard(md).scenes.find((s: any) => s.id === op.scene)
        if (!scene) throw invalid(`${op.scene} が絵コンテにありません`)
        if ((scene.meta[op.key] ?? '') !== String(op.orig ?? '').trim()) throw conflict(`${op.key}は、ほかで変更されています`, scene.meta[op.key] ?? '')
        return replaceSceneMeta(md, op.scene, op.key, String(op.value ?? '').trim())
      })
      return
    }
    if (op.op === 'move') {
      rewrite(
        boardFile(t),
        (md) => {
          try {
            return moveScene(md, op.scene, Number(op.dir) < 0 ? -1 : 1)
          } catch (e) {
            throw invalid(String((e as Error).message))
          }
        },
        op.base,
      )
      return
    }
    throw invalid('発表の流れは、シーンの情報と並びを直します')
  },
  editMeta: () => {
    throw invalid('発表には front matter がありません')
  },

  anchor(ref, at) {
    const t = need(ref)
    if (!('scene' in at)) throw invalid('発表の指摘の位置は、シーン (scene) とコマ (state) で指します')
    if (at.scene === '*') return { scene: '*' }
    const scene = boardOf(t).scenes.find((s) => s.id === at.scene)
    if (!scene) throw invalid(`${at.scene} が絵コンテにありません`)
    const n = Number(at.state) || 0
    if (n && (n < 1 || n > scene.states.length)) throw invalid(`${at.scene} にコマ ${n} はありません`)
    return { scene: scene.id, ...(n ? { state: n } : {}) }
  },
  anchorOfNote: (n) => ({ scene: n.scene, ...(n.state ? { state: n.state } : {}) }),
  beforeView: () => {},

  readPlan(ref) {
    const t = need(ref)
    const board = boardOf(t)
    return {
      dir: t.dir,
      survey: SURVEY,
      prompt: (persona, why) => readerPrompt(persona, why, board),
      // 絵コンテに無い場面への感想は、場面全体 (state 0) やトーク全体 ("*") に寄せる
      notes: (raw) =>
        raw.map((n) => {
          const scene = board.scenes.find((s) => s.id === n.scene)
          const state = Number(n.state) || 0
          return { scene: scene ? scene.id : '*', state: scene && state >= 1 && state <= scene.states.length ? state : 0, kind: UNIT_KINDS[n.kind] ? n.kind : 'unconvinced', text: String(n.text ?? '') }
        }),
      meta: { scenes: board.scenes.length, states: board.scenes.reduce((a, s) => a + s.states.length, 0) },
    }
  },
  draftForAsk: () => null,

  handoff(ref, threads: Thread[]) {
    const list = threads.filter((t) => t.ball === 'Claude')
    const own = list.filter((t) => t.by !== '聴衆役').length
    return [
      `${ref.talk ? shownDir(ref.talk.dir) : ''}/feedback.yaml に、Claude の番の指摘が ${list.length} 件あります（話者から ${own} 件、聴衆役から ${list.length - own} 件）。`,
      'crafting-presentation skill の Phase 8 に従って、絵コンテ (storyboard.md) を先に直し、実装を追従させてください。',
      '直したら、各スレッドの replies に thinking (考えたこと) と change (変えたこと) を足してください。話者に確かめたいことは ball を「話者」に、済んだものは ball を none にして closed を書いてください。',
    ].join('\n')
  },

  // リポジトリの外のトークだけを移す。リポジトリの中は git の操作が要るので触らない (ADR-0044)
  trashItems: (ref) => (ref.talk?.outside ? [{ from: ref.talk.dir, into: 'talks' }] : []),
  async beforeTrash(ref) {
    if (ref.talk?.outside) await theSite().unmount(ref.talk.info.slug)
  },
  repoFiles: (ref) => (ref.talk && !ref.talk.outside ? [shownDir(ref.talk.dir)] : []),

  paste: () => {
    throw invalid('発表には、note に貼る本文がありません')
  },
  openAssets: () => {
    throw invalid('発表の画像は、トークの assets/ に置きます')
  },
  assetFile: () => null,

  summary(ref) {
    const t = ref.talk
    if (!t) return { talk: null, draft: null, cover: null, date: ref.brief?.fields?.date ?? null, event: ref.brief?.fields?.event ?? null, tags: [] }
    const md = readText(boardFile(t))
    const board: Board | null = md ? parseStoryboard(md) : null
    const siteUrl = `${theSite().url}/${t.info.slug}/`
    return {
      talk: {
        slug: t.info.slug,
        name: t.info.name,
        title: t.info.title,
        date: t.info.date,
        tag: t.info.tag,
        event: t.info.event?.name ?? null,
        public: t.info.public,
        scenes: board?.scenes.length ?? 0,
        states: board?.scenes.reduce((n, s) => n + s.states.length, 0) ?? 0,
        siteUrl,
      },
      draft: null,
      cover: `${siteUrl}og.png`,
      date: t.info.date ?? ref.brief?.fields?.date ?? null,
      event: t.info.event?.name ?? ref.brief?.fields?.event ?? null,
      tags: [],
    }
  },
}

