// 聴衆役の読み (ADR-0039)。プリセットのペルソナに絵コンテを読んでもらい、アンケートとコマへの感想を受け取る。
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

/** コマへの感想の種類 */
export const NOTE_KINDS = { word: '分からない言葉', jump: '話が飛んだ', unreadable: '読み切れない', unconvinced: '納得できない', good: '良かった' }

const readYaml = (file) => YAML.parse(readFileSync(file, 'utf8')) ?? {}

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
        ng(new Error(`${input.persona.name}: Claude の答えを読めませんでした (${code}): ${err || out.slice(0, 300) || e.message}`))
      }
    })
    p.stdin.end(buildPrompt(input))
  })
}

/** 答えを、決めた形に揃える。絵コンテに無い場面への感想は、場面全体 (state 0) やトーク全体 ("*") に寄せる */
function normalize(raw, persona, board) {
  const scores = {}
  for (const q of SURVEY) {
    const a = raw.scores?.[q.key] ?? {}
    scores[q.key] = { score: Math.max(1, Math.min(5, Math.round(Number(a.score) || 0) || 1)), reason: String(a.reason ?? '') }
  }
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
  if (readers.length === 0) throw new Error('読み手が決まっていません。readers.yaml に、読んでもらうペルソナを書いてください')
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
