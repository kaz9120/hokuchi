// 段階ごとに「AI に頼めること」。ローカルの Claude Code を非対話で 1 回呼び、候補を JSON で受け取る (ADR-0036)。
// AI は候補を出すだけで、企画シートの欄は書き換えない。選んで欄に入れるのは人
import { spawn } from 'node:child_process'
import YAML from 'yaml'

const WORD = {
  talk: { work: '発表', oneLiner: '中核メッセージ', audience: '聴衆', reader: '聴衆' },
  note: { work: 'note の記事', oneLiner: '芯', audience: '読者', reader: '読者' },
}

/** 依頼の一覧。画面はこの key でボタンを出す */
export const TASKS = {
  'audience.gaps': {
    label: 'まだ答えていない問いを指摘してもらう',
    prompt: (w) =>
      `${w.audience}の描写を読み、まだ答えが無い・あいまいな問いを指摘してください。slide:ology の 7 つの問い (どんな人か・なぜここにいるか・何に悩んでいるか・どう解決するか・何をしてほしいか・どんな反発を受けるか・最適なアプローチ) と、「属性ではなく悩みで、名前のある 1 人として描けているか」に照らします。text に指摘を、note に書き手へ投げる問いを入れます。3〜5 件。`,
  },
  'audience.pushback': {
    label: '聴衆から出そうな反論を挙げてもらう',
    prompt: (w) => `この${w.work}に対して、${w.audience}が抱きそうな反発・疑い・「だから何？」を予測してください。text に反発を、note にそれへの備え方の候補を入れます。3〜5 件。`,
  },
  'goal.candidates': {
    label: 'ゴールの案を出してもらう',
    prompt: (w) =>
      `${w.audience}が${w.work}を受け取ったあと、どうなっていてほしいか (読後感・持ち帰り・取ってほしい行動) の候補を出してください。種類の違うものを混ぜます (知識・視点・行動)。text に候補を、note にその候補を選ぶとどんな${w.work}になるかを入れます。3 件。`,
  },
  'oneLiner.candidates': {
    label: '1 文の案を出してもらう',
    prompt: (w) =>
      `この${w.work}の${w.oneLiner}を 1 文で、候補を 3 案出してください。主張になっていること (「〜について話す」は題目で主張ではない)、書き手の体験から出ていること、相手にとって自明でないこと、反論できる形であることを満たします。最初に浮かんだ案だけで終わらせず、角度の違う案を並べます。text に 1 文を、note にその案を選ぶとどこが厚くなり何を捨てることになるかを入れます。`,
  },
  'oneLiner.critique': {
    label: 'いまの 1 文に意見をもらう',
    prompt: (w) =>
      `いま書かれている${w.oneLiner}を講評してください。主張になっているか・体験から出ているか・相手にとって新しいか・反論できるか・相手とゴールに合っているかを見ます。text に気になる点を、note に直し方の案を入れます。良い点も 1 件まで入れてかまいません。2〜4 件。`,
  },
}

function buildPrompt(brief, task) {
  const w = WORD[brief.kind] ?? WORD.note
  const sheet = YAML.stringify({ 種類: w.work, タイトル: brief.title || '(未定)', 欄: brief.fields ?? {} }, { lineWidth: 0 })
  return [
    `あなたは、書き手と一緒に${w.work}を企画している相談相手です。決めるのは書き手で、あなたは候補と講評を出します。`,
    'ファイルの読み書きや検索などの道具は使わず、下の企画シートだけを根拠に答えてください。シートに無い事実は作らないでください。',
    '',
    '## 企画シート',
    sheet,
    '## 依頼',
    TASKS[task].prompt(w),
    '',
    '日本語で、短く具体的に書いてください。答えは次の JSON だけにしてください。前後に説明やコードブロックを付けないでください。',
    '{"items":[{"text":"…","note":"…"}]}',
  ].join('\n')
}

/** 依頼を 1 回投げて、候補の配列を返す */
export function ask(brief, task, { cwd }) {
  if (!TASKS[task]) return Promise.reject(new Error(`依頼「${task}」はありません`))
  return new Promise((ok, ng) => {
    const p = spawn('claude', ['-p', '--output-format', 'json'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      try {
        const result = JSON.parse(out).result ?? ''
        const json = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)
        ok((JSON.parse(json).items ?? []).map((i) => ({ text: String(i.text ?? ''), note: String(i.note ?? '') })))
      } catch (e) {
        ng(new Error(`Claude の答えを読めませんでした (${code}): ${err || out.slice(0, 300) || e.message}`))
      }
    })
    p.stdin.end(buildPrompt(brief, task))
  })
}
