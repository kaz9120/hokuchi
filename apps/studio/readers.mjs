// 聴衆役の読み (ADR-0039)。プリセットのペルソナに絵コンテを読んでもらい、アンケートとコマへの感想を受け取る。
// 記事 (ADR-0046) も同じ仕組みで、原稿を「note で見つけて読みに来た」読み手に読んでもらい、段落への感想を受け取る。
// 読み手は毎回まっさらにする。渡すのは、ペルソナ・場の文脈・絵コンテの画面と話すことだけ。
// リポジトリの文脈 (CLAUDE.md など) を拾わないよう、Claude は一時ディレクトリで起動する
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'
import { parseStoryboard } from '../../packages/stage/node/storyboard.mjs'

/** アンケートの 8 項目。5 段階 (1 まったく当てはまらない 〜 5 とても当てはまる) と理由 1 行。根拠は docs/research/audience-survey.md */
export const SURVEY = [
  { key: 'got', group: '届いたか', label: '得に来たものを得られた' },
  { key: 'trouble', group: '届いたか', label: '自分の悩みに触れていた' },
  { key: 'insight', group: '届いたか', label: '新しい見方を得た' },
  { key: 'follow', group: '分かったか', label: '話の筋を最後まで追えた' },
  { key: 'glance', group: '分かったか', label: '画面はひと目で分かった' },
  { key: 'convinced', group: '動くか', label: '主張に納得した' },
  { key: 'action', group: '動くか', label: '明日やってみようと思うことがある' },
  { key: 'recommend', group: '総合', label: '同じ立場の人に勧めたい' },
]

/**
 * 記事のアンケート。発表の 8 項目と同じ意図を、記事の言葉に置き換える。key は発表と揃え、
 * 画面がひと目で分かったか (glance) だけを、冒頭で読み進めたくなったか (hook) に置き換える
 */
export const NOTE_SURVEY = [
  { key: 'got', group: '届いたか', label: '読みに来た目的を果たせた' },
  { key: 'trouble', group: '届いたか', label: '自分の悩みに触れていた' },
  { key: 'insight', group: '届いたか', label: '新しい見方を得た' },
  { key: 'follow', group: '分かったか', label: '最後まで迷わずに読めた' },
  { key: 'hook', group: '分かったか', label: '冒頭で読み進めたくなった' },
  { key: 'convinced', group: '動くか', label: '主張に納得した' },
  { key: 'action', group: '動くか', label: '読み終えて、やってみようと思うことがある' },
  { key: 'recommend', group: '総合', label: '同じ立場の人に勧めたい' },
]

/** コマへの感想の種類 (記事では段落への感想に使う) */
export const NOTE_KINDS = { word: '分からない言葉', jump: '話が飛んだ', unreadable: '読み切れない', unconvinced: '納得できない', good: '良かった' }

const readYaml = (file) => YAML.parse(readFileSync(file, 'utf8')) ?? {}

/** アンケートの点を 1〜5 に揃える */
function scoresOf(raw, survey) {
  const scores = {}
  for (const q of survey) {
    const a = raw.scores?.[q.key] ?? {}
    scores[q.key] = { score: Math.max(1, Math.min(5, Math.round(Number(a.score) || 0) || 1)), reason: String(a.reason ?? '') }
  }
  return scores
}

/** プリセットのペルソナ (人)。リポジトリの personas/ にある */
export function listPersonas(repoRoot) {
  const dir = join(repoRoot, 'personas')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => readYaml(join(dir, f)))
    .filter((p) => p.id)
}

/** このトークの読み手 (どのペルソナが、なぜこの場に来たか)。talks/<トーク>/readers.yaml */
export function listReaders(talkDir) {
  const file = join(talkDir, 'readers.yaml')
  return existsSync(file) ? (readYaml(file).readers ?? []) : []
}

/** これまでの読み。古い順 */
export function listReads(talkDir) {
  const dir = join(talkDir, 'reads')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^\d+\.yaml$/.test(f))
    .sort()
    .map((f) => readYaml(join(dir, f)))
}

// 作り手の覚え書き (要確認など) は、聴衆には見えないので渡さない
const MEMO = /（(?:要確認|検討中|調達する写真)[^）]*）/g

/** 絵コンテから、画面と話すことだけを書き出す。シーン id と状態の番号を付けて、感想をコマに紐づけられるようにする */
function screens(board) {
  const out = []
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

function buildPrompt({ persona, why, board }) {
  const place = board.meta['場'] ? `登壇の場: ${board.meta['場']}` : ''
  const items = SURVEY.map((q, i) => `  ${i + 1}. ${q.key}: ${q.label}`).join('\n')
  const kinds = Object.entries(NOTE_KINDS)
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

function askOne(input) {
  return ask(buildPrompt(input), input.persona.name)
}

/** claude -p を 1 回呼び、答えの JSON を返す */
function ask(prompt, name) {
  return new Promise((ok, ng) => {
    const p = spawn('claude', ['-p', '--output-format', 'json'], { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      try {
        const result = JSON.parse(out).result ?? ''
        ok(JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)))
      } catch (e) {
        ng(new Error(`${name}: Claude の答えを読めませんでした (${code}): ${err || out.slice(0, 300) || e.message}`))
      }
    })
    p.stdin.end(prompt)
  })
}

/** 答えを、決めた形に揃える。絵コンテに無い場面への感想は、場面全体 (state 0) やトーク全体 ("*") に寄せる */
function normalize(raw, persona, board) {
  const scores = scoresOf(raw, SURVEY)
  const notes = (raw.notes ?? []).slice(0, 12).map((n) => {
    const scene = board.scenes.find((s) => s.id === n.scene)
    const state = Number(n.state) || 0
    return { scene: scene ? scene.id : '*', state: scene && state >= 1 && state <= scene.states.length ? state : 0, kind: NOTE_KINDS[n.kind] ? n.kind : 'unconvinced', text: String(n.text ?? '') }
  })
  return { persona: persona.id, name: persona.name, label: persona.label, scores, message: String(raw.message ?? ''), wish: String(raw.wish ?? ''), notes }
}

/**
 * 読み手に読んでもらい、結果を talks/<トーク>/reads/<番号>.yaml に残す。
 * onProgress には、読み終えた人数と全体の人数、失敗した人の名前が届く
 */
export async function runRead({ repoRoot, talkDir, onProgress = () => {} }) {
  const board = parseStoryboard(readFileSync(join(talkDir, 'storyboard.md'), 'utf8'))
  const personas = listPersonas(repoRoot)
  const readers = listReaders(talkDir)
    .map((r) => ({ persona: personas.find((p) => p.id === r.persona), why: r.why ?? '' }))
    .filter((r) => r.persona)
  if (readers.length === 0) throw new Error('聴衆役が決まっていません。readers.yaml にペルソナを書いてください')
  let done = 0
  const failed = []
  onProgress({ done, total: readers.length, failed })
  const results = await Promise.all(
    readers.map((r) =>
      askOne({ ...r, board })
        .then((raw) => normalize(raw, r.persona, board))
        .catch((e) => {
          failed.push(String(e.message))
          return null
        })
        .finally(() => onProgress({ done: ++done, total: readers.length, failed })),
    ),
  )
  const dir = join(talkDir, 'reads')
  mkdirSync(dir, { recursive: true })
  const n = listReads(talkDir).length + 1
  const read = {
    id: n,
    at: new Date().toISOString(),
    scenes: board.scenes.length,
    states: board.scenes.reduce((a, s) => a + s.states.length, 0),
    readers: results.filter(Boolean),
    failed,
  }
  writeFileSync(join(dir, `${String(n).padStart(3, '0')}.yaml`), YAML.stringify(read, { lineWidth: 0 }))
  return read
}

// ---------------------------------------------------------------- 記事 (ADR-0046)

/** 記事の本文を、段落の番号付きで書き出す。画像は説明だけ、コメントは渡さない */
function paragraphs(blocks) {
  return blocks
    .filter((b) => b.kind !== 'comment')
    .map((b) => {
      if (b.kind === 'image') return `【${b.n}】[画像${b.text.match(/^\[?!\[([^\]]*)\]/)?.[1] ? `: ${b.text.match(/^\[?!\[([^\]]*)\]/)[1]}` : ''}]`
      if (b.kind === 'embed') return `【${b.n}】[埋め込み: ${b.text}]`
      return `【${b.n}】${b.text}`
    })
    .join('\n\n')
}

function buildNotePrompt({ persona, why, title, blocks }) {
  const items = NOTE_SURVEY.map((q, i) => `  ${i + 1}. ${q.key}: ${q.label}`).join('\n')
  const kinds = Object.entries(NOTE_KINDS)
    .map(([k, v]) => `${k} (${v})`)
    .join(' / ')
  return [
    'あなたは、次のプロフィールの人物として、note の記事を読みに来ています。SNS のタイムラインか note のおすすめで、この記事のタイトルを見つけて開きました。',
    '',
    `${persona.name}（${persona.label}）`,
    `どんな人か: ${persona.who}`,
    `悩み: ${persona.troubles}`,
    `知っていること・知らないこと: ${persona.knows}`,
    `引っかかりやすい点: ${persona.pushback}`,
    `書き手のことを: ${persona.knows_speaker ? '前から知っている' : '今日初めて知った'}`,
    why ? `なぜ読みに来たか: ${why}` : '',
    '',
    'これから、その記事の本文を渡します。【】の中の数字は段落の番号です。見出しも 1 つの段落として数えます。',
    'あなたはこの題材について、プロフィールに書いてある以上のことを知りません。知らないことを推測で補わないでください。',
    'スマートフォンで、上から 1 度だけ読むものとして扱ってください。退屈になったら、そこで読むのをやめてかまいません。やめた所も感想に書いてください。',
    'ファイルの読み書きや検索などの道具は使わず、下の内容だけを根拠に答えてください。',
    '',
    `タイトル: ${title}`,
    '',
    paragraphs(blocks),
    '',
    '読み終えたあとのアンケートに、この人物として正直に答えてください。遠慮や励ましは要りません。',
    '',
    '1) 次の 8 項目に、1 (まったく当てはまらない) 〜 5 (とても当てはまる) の点と、理由を 1 行で。',
    items,
    '2) message: この記事がいちばん伝えたかったことは何だと思ったかを、1 文で。',
    '3) wish: ここがこうなっていたらもっと良かった、を 1 つだけ。いちばん効くものを。',
    `4) notes: 段落へのピンポイントな感想を、大事な順に 12 件まで。para には【】の中の番号、kind には ${kinds} のどれかを入れます。記事全体への感想は para を 0 にします。良かった所も、あれば入れてください。`,
    '',
    '答えは次の JSON だけにしてください。前後に説明やコードブロックを付けないでください。',
    '{"scores":{"got":{"score":3,"reason":"…"},"trouble":{"score":3,"reason":"…"},"insight":{"score":3,"reason":"…"},"follow":{"score":3,"reason":"…"},"hook":{"score":3,"reason":"…"},"convinced":{"score":3,"reason":"…"},"action":{"score":3,"reason":"…"},"recommend":{"score":3,"reason":"…"}},"message":"…","wish":"…","notes":[{"para":1,"kind":"word","text":"…"}]}',
  ]
    .filter((l) => l !== '')
    .join('\n')
    .replace(/\n(タイトル:|これから、|読み終えたあと|1\) |答えは)/g, '\n\n$1')
}

/**
 * 記事の読み手に原稿を読んでもらい、結果を <原稿>/reads/<番号>.yaml に残す。
 * 段落への感想は para (段落の番号。記事全体は "*") と head (段落の書き出し) で返す
 */
export async function runNoteRead({ repoRoot, dir, title, blocks, onProgress = () => {} }) {
  const personas = listPersonas(repoRoot)
  const readers = listReaders(dir)
    .map((r) => ({ persona: personas.find((p) => p.id === r.persona), why: r.why ?? '' }))
    .filter((r) => r.persona)
  if (readers.length === 0) throw new Error('読み手が決まっていません。読み手を選んでください')
  let done = 0
  const failed = []
  onProgress({ done, total: readers.length, failed })
  const results = await Promise.all(
    readers.map((r) =>
      ask(buildNotePrompt({ ...r, title, blocks }), r.persona.name)
        .then((raw) => ({
          persona: r.persona.id,
          name: r.persona.name,
          label: r.persona.label,
          scores: scoresOf(raw, NOTE_SURVEY),
          message: String(raw.message ?? ''),
          wish: String(raw.wish ?? ''),
          notes: (raw.notes ?? []).slice(0, 12).map((n) => {
            const b = blocks.find((x) => x.n === Number(n.para))
            return { para: b ? b.n : '*', ...(b ? { head: b.head } : {}), kind: NOTE_KINDS[n.kind] ? n.kind : 'unconvinced', text: String(n.text ?? '') }
          }),
        }))
        .catch((e) => {
          failed.push(String(e.message))
          return null
        })
        .finally(() => onProgress({ done: ++done, total: readers.length, failed })),
    ),
  )
  const out = join(dir, 'reads')
  mkdirSync(out, { recursive: true })
  const n = listReads(dir).length + 1
  const read = { id: n, at: new Date().toISOString(), paragraphs: blocks.length, readers: results.filter(Boolean), failed }
  writeFileSync(join(out, `${String(n).padStart(3, '0')}.yaml`), YAML.stringify(read, { lineWidth: 0 }))
  return read
}

/** 記事の読み手を決める。<原稿>/readers.yaml に書く */
export function saveReaders(dir, readers) {
  const head = '# 聴衆役の読み手 (ADR-0039・ADR-0046)。persona は personas/ の id。why は、なぜこの記事を読みに来たか\n'
  writeFileSync(join(dir, 'readers.yaml'), head + YAML.stringify({ readers: readers.map((r) => ({ persona: r.persona, ...(r.why ? { why: r.why } : {}) })) }, { lineWidth: 0 }))
}
