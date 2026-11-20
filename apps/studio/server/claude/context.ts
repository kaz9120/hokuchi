// Claude に渡す作品の文脈。毎回の実行の頭に、ファイルから組み立てる (会話の記録は表示用で、Claude の記憶の正はファイル)。
// --append-system-prompt に渡す文と、書いてよい場所を返す
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { Change, Step, Work } from '../../shared/types.ts'
import { STEP_LABEL } from '../../shared/types.ts'
import { PRIVATE, places, repoRoot, shownDir } from '../infra/config.ts'
import { proposalsFile, readChat, readMaterial, workDir } from '../store/works.ts'
import { noteDir, talkDirOf } from '../store/places.ts'

/** 材料ファイルを全文で渡す上限。超えたら頭を落として、ファイルを読むよう伝える */
const MATERIAL_LIMIT = 60_000

/** file は crafting-presentation の steps/ の中のファイル名。段ごとに、その段の手順だけを読ませる (1 つの段で読む規則が多いほど、出てくるものが規則の挿絵になる) */
type Phase = { skill: string; dir?: 'writing-note' | 'crafting-presentation'; file?: string; then?: string; todo: string }

/** ステップごとに、どのスキルのどこを使い、何を書いてほしいか */
function phaseOf(work: Work, step: Step | 'shipped'): Phase {
  const note = work.note?.slug ? shownDir(noteDir(work.note.slug)) : ''
  const talk = talkDirOf(work)
  if (work.kind === 'note') {
    switch (step) {
      case 'core':
        return { skill: 'writing-note の伝えたいこと (Phase 0〜2)', dir: 'writing-note', file: 'core', todo: `材料と過去の記事 (articles/note/) を読み、proposals.yaml に読者 (reader)・持ち帰り (takeaway)・伝えたいことの候補 3 つ (core) を書く。記事の原料になる話者の言葉が足りないとき (出来事の間の理由、いちばん意外だったこと、芯の中の抽象語の中身) は、問いを 3 つまで返事に番号付きで書き、ask に「問いに答えてください」と書く。話者が貼った画像は ${note}/assets/ に写してある` }
      case 'draft':
        return {
          skill: 'writing-note の書く段と確かめて直す段 (Phase 4〜6)',
          dir: 'writing-note',
          file: 'draft',
          then: 'check',
          todo: `${note}/index.md に原稿を書き切ってから、確かめて直す。${note}/feedback.yaml の ball: Claude の感想は 1 件ずつ判断し、返事に「直した n 件・見送った n 件」と見送った理由を書く。原稿がもうあり、話者が直しを頼んでいるときは、書く段を飛ばして確かめて直す段から入る`,
        }
      case 'publish':
        return {
          skill: 'writing-note の出す段 (Phase 7)',
          dir: 'writing-note',
          file: 'publish',
          todo: `proposals.yaml にタイトル 3 案 (title)、タグ 2〜5 個 (tags)、置き場の名前の案 3 つ (slug。英小文字とハイフン。notes/ にある名前は避ける)、見出し画像のモチーフ 3 案 (motif) を書く。モチーフが決まったと伝えられたら、references/eyecatch.md に沿って ${shownDir(join(PRIVATE, 'eyecatch'))}/<公開日>-<名前>/ に下地を作る`,
        }
      default:
        return {
          skill: 'writing-note の振り返り',
          dir: 'writing-note',
          file: 'retro',
          todo: `公開版 (articles/note/ のこの記事) と原稿 (${shownDir(join(workDir(work.id), 'made'))}) の差を読み、話者が公開前に直した点から学びの案を proposals.yaml の learnings に書く ([{text, file: voice.md, note}])。voice.md は書けない。話者が採ったものだけを studio が足す`,
        }
    }
  }
  switch (step) {
    case 'core':
      return {
        skill: 'crafting-presentation の伝えること (Phase 0〜2)',
        dir: 'crafting-presentation',
        file: 'core',
        todo: '材料から場・日付・持ち時間を拾って proposals.yaml の event ({name, url, date, minutes, venue}) に、公開か社内かを scope (public / internal) に、聴衆 1〜2 人を audience ([{name, who, why, trouble, solve}]) に、中核メッセージの候補 3 つを core に書く。イベントページがあれば読む。話者にしか出せない実物 (画面・数字・失敗) とそれを選んだ理由、中核メッセージの中の抽象語の中身が素材に無いときは、問いを 3 つまで返事に番号付きで書き、ask に「問いに答えてください」と書く',
      }
    case 'outline':
      return { skill: 'crafting-presentation の構成 (Phase 3)', dir: 'crafting-presentation', file: 'outline', todo: 'メッセージマップを質の違う 2 案以上考え、推す 1 案を proposals.yaml の map ([{chapter, understand, weight}]) に書き、もう 1 案と選んだ理由を返事に書く。トークのフォルダの名前を YYYY_MM_DD_タグ_演題 の形で proposals.yaml の talkDir に書く' }
    case 'storyboard':
      return {
        skill: 'crafting-presentation の絵コンテ (Phase 4〜6)',
        dir: 'crafting-presentation',
        file: 'storyboard',
        todo: `${talk ?? '(トークのフォルダ)'}/storyboard.md に完全版の絵コンテを書き、聴衆役のサブエージェントに読ませて直し、話者の直しを受けてから持ち時間に合わせて削る。状態の行には画面に出す言葉と実物だけを書き、配置・図の形・動きは書かない。縮小画像のために talk.tsx と scenes/ を置くときは、状態の行の言葉を無地に並べるだけの下書きにし、見た目を作らない。返事に「直した n 件・見送った n 件」と見送った理由を書く`,
      }
    case 'slides':
      if (talk && hasLook(talk)) return lookedPhase(talk)
      return {
        skill: 'crafting-presentation のスライド (Phase 7)',
        dir: 'crafting-presentation',
        file: 'slides',
        todo: `承認した絵コンテから画面を作る。構成と言葉は変えない。テーマが mosh なら MOSH のテンプレート (テーマの背景・色・書体・ロゴの枠) に厳密に従う。先に表紙・覚えて帰る瞬間・まとめの 3 か所を作って見せ、話者が良いと言ってから残りを作る。bun run check ${talk ?? '<発表のフォルダ>'} --motion で撮った静止画を自分の目で見て、かっこよくなるまで直す。他のトークのシーンと、このトークの scenes/ にある下書きは、見た目の参考にしない。返事に進み具合と、確かめていないことを書く`,
      }
    case 'present':
      if (talk && hasLook(talk)) return lookedPhase(talk)
      return { skill: 'crafting-presentation の直し (Phase 8)', dir: 'crafting-presentation', file: 'fix', todo: '指されたコマを直し、check を回す' }
    default:
      return {
        skill: 'crafting-presentation の発表後',
        dir: 'crafting-presentation',
        file: 'after',
        todo: `${work.decided.scope === 'public' ? 'ノートを公開物として読み直して直す (発表後の 1)。' : ''}指摘の往復と話者の直しから、話者の型として残すべき学びの案を proposals.yaml の learnings ([{text, file: style-defaults.md, note}]) に書く。style-defaults.md は書けない`,
      }
  }
}

/** 段のファイルを読ませる文。then があれば、前の段を終えてから次のファイルを開かせる (書く前に検査の規則を読ませない) */
function stepText(p: Phase): string {
  const at = (f: string) => `.claude/skills/${p.dir}/steps/${f}.md`
  const then = p.then ? `書き終えてから、${at(p.then)} を開いて従う。` : ''
  return `手順は ${at(p.file!)} にある。最初にこのファイルを Read で開いて従う。${then}Skill ツールで ${p.dir} を呼ばず、SKILL.md と、ほかの段のファイル (steps/) は開かない (いまの段の手順だけで足りる)。\n`
}

/**
 * 話者が見た目を認めたトークか。絵コンテの頭の「見た目: 話者が認めた」を正にする。
 * out/look/ (bun run look で作る静止画) は作業出力で消えうるので、印だけには使わない。
 * 消えたときに黙って「シーンを実装し」の指示に戻ると、認めた画面が作り直されるため
 */
function hasLook(talk: string): boolean {
  if (existsSync(join(talk, 'out', 'look'))) return true
  const board = join(talk, 'storyboard.md')
  return existsSync(board) && /^見た目[:：]\s*話者が認めた/m.test(readFileSync(board, 'utf8'))
}

/**
 * 見た目を認めたトークを直す段。見た目は話者が気に入ったもので、型を当てて直すと品質が落ちる (2026-11 の将棋の発表)。
 * 続きのセッションでも毎回この文が渡るので、前の会話やスキルの古い手順より、ここを優先させる
 */
function lookedPhase(talk: string): Phase {
  return {
    skill: 'crafting-presentation の直し (Phase 8。見た目を守る)',
    dir: 'crafting-presentation',
    file: 'fix',
    todo: [
      `話者はこのトークの見た目を認めている (${talk}/out/look/ が認めた静止画。steps/fix.md の「認めた見た目を守る」)。話者が指した所と、頼んだことだけを直す。`,
      '- シーンの作り (CSS・配置・文字の大きさ・色・動き・背景) は、話者が頼まない限り変えない。スキルの座標・文字の大きさ・強調色の型と、check の「小さい文字」の指摘は当てない',
      '- 絵コンテからシーンを作り直さない。この会話の前のほうに前の版のシーンの記憶があっても、いまのファイルが正。直す前に、直すシーンのファイルを読み直す',
      '- 言葉や事実を直したら、画面の文字と、絵コンテ (storyboard.md) の話すことの両方を揃える。事実が素材で確かめられないときは、推測で埋めずに聞く',
      `- 直したら bun run check ${talk} --motion を回し、out/check.md の「認めた見た目からの変化」に出た状態を返事に書く。頼まれていない状態が変わっていたら、戻してから返事をする`,
      '- 話者がこれまでに頼んで変えた状態は、話者が認め直すまで「変化」に出続ける。この会話や前の返事 (材料と会話の記録) で頼まれた変更は戻さない。頼まれたかどうか分からない変化は、戻さずに返事で聞く',
      '- 認めた見た目を更新するのは話者 (studio の「この見た目を認める」)。あなたは bun run look を動かさない。絵コンテの頭の「見た目: 話者が認めた」の行も消さない',
    ].join('\n'),
  }
}

/**
 * 読ませない場所。スライドを作る段と直す段では、他のトークと実験の置き場を読ませない。
 * 読むとその見た目に寄る (2026-11 の比べ: 前の版を読んだ回は前の版とほぼ同じに、将棋の発表を読んだ回は将棋の世界になった)。
 * 伝えることの段は過去の登壇資料を素材として読むので、ここでは拒まない
 */
export function readDenyOf(work: Work, step: Step | 'shipped'): string[] {
  if (work.kind !== 'talk' || (step !== 'slides' && step !== 'present')) return []
  const own = talkDirOf(work)
  const deny: string[] = [join(PRIVATE, 'experiments') + '/']
  for (const base of [places.talks, places.privateTalks, join(repoRoot, 'archive', 'talks')]) {
    if (!existsSync(base)) continue
    for (const e of readdirSync(base, { withFileTypes: true })) {
      const dir = join(base, e.name)
      if (e.isDirectory() && dir !== own) deny.push(dir + '/')
    }
  }
  return deny
}

function recentReplies(id: string, n = 3): string {
  return readChat(id)
    .filter((c) => c.role === 'claude')
    .slice(-n)
    .map((c) => `- ${c.text.replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n')
}

/** 書いてよい場所。ディレクトリは末尾を / にする */
export function writableOf(work: Work, step: Step | 'shipped', extra: string[] = []): { allow: string[]; deny: string[] } {
  const allow = [proposalsFile(work.id), ...extra]
  const deny: string[] = []
  if (work.kind === 'note' && work.note?.slug) {
    allow.push(noteDir(work.note.slug) + '/')
    if (step === 'publish') allow.push(join(PRIVATE, 'eyecatch') + '/')
  }
  const talk = talkDirOf(work)
  if (work.kind === 'talk' && talk) allow.push(talk + '/')
  return { allow, deny }
}

/** 材料。長いときは真ん中 (途中の往復) を省き、最初の話と最近の話を残す */
function materialText(id: string): string {
  const m = readMaterial(id)
  if (m.length <= MATERIAL_LIMIT) return m
  const head = m.slice(0, MATERIAL_LIMIT / 3)
  const tail = m.slice(-(MATERIAL_LIMIT * 2) / 3)
  return `${head}\n\n…（途中の往復は長いので省いた。全文は ${shownDir(join(workDir(id), 'material.md'))}）…\n\n${tail}`
}

/** 頼みの頭に添える、前の返事のあとに変わったもの */
export function changesText(changes: Change[]): string {
  if (!changes.length) return ''
  return `前の返事のあとに変わったもの:\n${changes.map((c) => `- ${c.kind === 'you' ? '話者が直した' : '外で変わった'}: ${c.where}`).join('\n')}\n\n`
}

/**
 * 作品の文脈。fresh (新しいセッション) のときだけ、材料の全文と前の返事を入れる。
 * 続きのセッションでは、材料も返事もセッションの中にあるので入れない (毎回同じ文にして、キャッシュを効かせる)
 */
export function systemPrompt(work: Work, step: Step | 'shipped', fresh: boolean): string {
  const phase = phaseOf(work, step)
  const material = fresh ? materialText(work.id) : '(この会話の中にある。全文は material.md)'
  const decided = Object.keys(work.decided ?? {}).length ? YAML.stringify(work.decided, { lineWidth: 0 }) : '(まだ無い)'
  const where = [
    `- 作品のフォルダ: ${workDir(work.id)}`,
    `- 候補を書くファイル: ${proposalsFile(work.id)}`,
    work.note?.slug ? `- 記事の原稿のフォルダ: ${noteDir(work.note.slug)}` : '',
    talkDirOf(work) ? `- 発表のフォルダ: ${talkDirOf(work)}` : '',
  ].filter(Boolean)
  return `# hokuchi studio の中での作業

あなたは hokuchi studio (話者の制作アプリ) の中で、話者と作品を作っている。返事は studio の画面に出る。ターミナルではない。
話者は音声入力で話すことが多い。固有名詞や用語は文脈から読み直し、読み直した語は返事で示す。

## 作品
- id: ${work.id}
- 種類: ${work.kind === 'note' ? 'note の記事' : `発表 (${work.decided.scope === 'public' ? '公開' : '社内'})`}
- 題: ${work.title || '(未定)'}
- いまのステップ: ${step === 'shipped' ? '出した後の片付け' : STEP_LABEL[step]}
${where.join('\n')}

## このステップでしてほしいこと (${phase.skill})
${phase.dir && phase.file ? stepText(phase) : ''}${phase.todo}

## 確定した値 (話者が決めた。あなたは書けない。変えたいときは proposals.yaml に案を書く)
${decided}
## 約束
- スキルに書かれた「企画シート」「依頼文をコピーして貼る」「レールの Claude へ」「studio の○○の面」の手順は旧 studio のもの。studio の中では、この節の約束を優先する
- YAML (proposals.yaml・outline.yaml・feedback.yaml・readers.yaml) を書くときは、値に「: 」「#」や記号で始まる文を含むなら引用符で囲む。書いたら node apps/studio/scripts/check-yaml.mjs <ファイルの絶対パス> で読めるか確かめ、NG なら直す
- 候補は会話の文に埋めず、proposals.yaml に書く (YAML。知らないキーは残す)。画面がカードにし、話者が選んで確定する。話者の発言が明らかに 1 つを選んでいるときは picked にその番号 (0 始まり) を書く (例: picked: {core: 1})
- 返事の最後に、話者に求めることを 1 つ proposals.yaml の ask に書く。形は ask: {kind: choose|answer|read|press, text: 1 行}。text は話者が次にすることを、動詞で終わる 1 文で書く (例:「伝えたいことの 3 案から選ぶか、話して直す」)
- 返事は短く、結論から書く。話者に聞きたいことは番号付きで、1 つずつ答えられる形にする
- 書けるのは作品の置き場だけ。デプロイ・コミット・push・削除はできない (話者が画面で押したときに studio が行う)
- 動かせるコマンドは次の形だけ。作業場所 (リポジトリのルート) から、cd や && でつながずに、この形のまま動かす: \`node tools/notes/cli.mjs lint <名前>\`・\`bun run check <発表のフォルダの絶対パス> --motion\`・\`node .claude/skills/crafting-presentation/scripts/wave.mjs <絵コンテ>\`・\`node .claude/skills/crafting-presentation/scripts/rehearse.mjs <発表のフォルダの絶対パス>\`・\`bun run typecheck\`・\`bun run eyecatch ...\`。読むだけなら Read・Glob・Grep を使う
- studio 自身のコード (apps/studio) は読まなくてよい。この節に書いたことが、studio との約束のすべて
- 発表で packages/stage/src/kit/ や parts/ の部品を足す・直す必要があるときは、書かずに返事でその旨を伝え、ask に「部品を直すのを許すか決める」と書く

## proposals.yaml の形 (使うキーだけ書く。studio のコードは読まなくてよい)
\`\`\`yaml
ask: {kind: choose, text: 伝えたいことの 3 案から選ぶか、話して直す}
picked: {core: 0}            # 話者の発言が明らかに選んだ候補の番号 (core / title / slug / hook)
reader: {who: …, trouble: …, knows: …}   # 記事の読者
takeaway: …                  # 持ち帰ってほしいこと
core: [{text: …, note: …}]   # 伝えたいこと (中核メッセージ) の候補
coreRevision: {text: …, note: …}         # 確定した伝えたいことを直す案。確定の前 (伝えたいことのステップ) は使わず、直した案を core の先頭に足して picked で指す
hook: [{text: …, note: …}]   # フックの案
outlineRevision: [{title: …, point: …, grain: 密, budget: 600}]  # 確定した構成を直す案
title: [{text: …, note: …}]
tags: [エンジニア, …]
slug: [{text: voice-input-again, note: …}]
motif: [{text: …, note: …}]  # 見出し画像のモチーフ
learnings: [{text: …, file: voice.md, note: …}]   # text は規範に足す 1 行の本文だけ。先頭の「(日付「題」)」や「(同)」は studio が付ける
event: {name: …, url: …, date: 2026-12-05, minutes: 20, venue: …}   # 発表の場
scope: internal              # 発表の公開範囲 (public / internal)
audience: [{name: …, who: …, why: …, trouble: …, solve: …}]
map: [{chapter: …, understand: …, weight: 厚い}]   # メッセージマップ
mapRevision: [...]           # 確定したメッセージマップを直す案
talkDir: 2026_12_05_タグ_演題
trash: [{path: scenes/rule.tsx, note: 並びから外した}]   # 要らなくなったファイル。中身のフォルダ (原稿かトークのフォルダ) からの相対パス。あなたは消せないので、話者が画面でごみ箱へ移す
\`\`\`

## 材料 (話者が話したこと・貼ったものの原文。要約せずに使う)
${material}

## あなたの前の返事 (要約。正はファイル)
${fresh ? recentReplies(work.id) || '(まだ無い)' : '(この会話の中にある)'}
`
}

export const repo = repoRoot
export const placesForContext = places
