#!/usr/bin/env node
// wave.mjs — 絵コンテの粗密の波を、1 シーン 1 行で並べる (references/reduce.md 手順 4)。
//
//   node .claude/skills/crafting-presentation/scripts/wave.mjs talks/<slug>/storyboard.md
//
// 見るのは、1 シーンごとの合否ではなく、並びが平らかどうか。
// 秒数は各シーンの「粗密: 中（1 分 20 秒）」から読む。

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { parseStoryboard, seconds } = await import(pathToFileURL(path.resolve(here, '../../../../packages/stage/node/storyboard.mjs')).href)
const { UKE_RE } = await import(pathToFileURL(path.resolve(here, '../../../../tools/notes/src/lint.mjs')).href)

const file = process.argv[2]
if (!file) {
  process.stderr.write('usage: wave.mjs <storyboard.md>\n')
  process.exit(1)
}

const len = (s) => [...(s ?? '').replace(/\s/g, '')].length
const board = parseStoryboard(readFileSync(file, 'utf8'))

const rows = board.scenes.map((s, i) => {
  const grain = s.meta['粗密'] ?? ''
  return {
    n: i + 1,
    id: s.id,
    chapter: s.chapter ?? '',
    grain: grain.match(/^(粗|中|密)/)?.[1] ?? '-',
    sec: seconds(grain),
    states: s.states.length,
    notes: s.notes.reduce((a, n) => a + len(n), 0),
    roles: s.states.flatMap((st) => st.roles).length,
    core: Number(s.meta['中核'] ?? 0) || null,
  }
})

const hasSec = rows.some((r) => r.sec != null)
const bar = (r) => '█'.repeat(Math.max(1, Math.round((hasSec ? (r.sec ?? 0) : r.notes / 6) / 5)))

process.stdout.write(`wave ${file}\n\n`)
process.stdout.write('  #  粗密  sec 状態 動き  話す字数  id\n')
for (const r of rows) {
  process.stdout.write(
    `${String(r.n).padStart(3)}   ${r.grain}  ${String(r.sec ?? '-').padStart(4)} ${String(r.states).padStart(4)} ${String(r.roles).padStart(4)} ${String(r.notes).padStart(9)}  ${r.id.padEnd(24)} ${bar(r)}\n`,
  )
}

process.stdout.write('\n')
if (!hasSec) {
  process.stdout.write('  粗密に時間がない。各シーンの「粗密:」に時間を書いてから見直す (reduce.md 手順 4)\n')
  process.exit(0)
}

const total = rows.reduce((a, r) => a + (r.sec ?? 0), 0)
const limit = seconds(board.meta['持ち時間'])
process.stdout.write(`  合計 ${total} 秒 (${(total / 60).toFixed(1)} 分)${limit ? ` / 持ち時間 ${limit / 60} 分` : ''} / ${rows.length} シーン\n`)
if (limit && Math.abs(total - limit) / limit > 0.15) process.stdout.write(`  → 持ち時間との差が 15% を超えている\n`)

// 話す字数から読み上げの時間を見積もる。350 字/分は仮の値で、話者の実測ではない。
// 合成音声の通し (rehearse.mjs、Dev's Garden、話す字数 3,917 字で約 10 分、約 380 字/分) より
// 少し遅めに置いた。話者の通しの時間が分かったら差し替える。
// 粗密に書いた秒数は願望になりやすいので、字数の側から突き合わせる
const PACE = 350
const spoken = rows.reduce((a, r) => a + r.notes, 0)
const spokenSec = Math.round((spoken / PACE) * 60)
process.stdout.write(`  話す字数 ${spoken} 字 → 読み上げの見積もり ${spokenSec} 秒 (${(spokenSec / 60).toFixed(1)} 分、${PACE} 字/分)\n`)
if (limit && spokenSec > limit * 1.05) process.stdout.write(`  → 話す字数が持ち時間を超えている。あと ${Math.ceil(((spokenSec - limit) / 60) * PACE)} 字ほど削る\n`)
if (limit && spokenSec < limit * 0.7) process.stdout.write(`  → 話す字数の見積もりが持ち時間の 7 割に届かない。答えの枠として空けているなら、そのシーンの粗密に枠の秒数を分けて書く\n`)

// 話すことの受けと留保 (language.md の 7)。同じ状態に 2 つ以上あったら知らせる。全体の数も出す
let ukeTotal = 0
for (const s of board.scenes) s.states.forEach((st, i) => {
  // 当時の考えを言う過去形 (「〜と考えていました」) は事実として言うので数えない (language.md の 7)
  const notes = st.notes.join('').replace(/と(?:思|考え|感じ)(?:っていました|ていました|いました|ました|った|た)/g, '')
  const n = (notes.match(UKE_RE) ?? []).length + (notes.match(/かもしれ/g) ?? []).length
  ukeTotal += n
  if (n >= 2) process.stdout.write(`  → ${s.id} の状態 ${i + 1}: 話すことに受けと留保が ${n} つ。1 つにする\n`)
})
// 千字あたり 3 回まで。話者が仕上げた絵コンテは 1.2〜1.3 回 (Dev's Garden 5 回、KomeKaigi 10 回)
const ukeRate = spoken ? (ukeTotal / spoken) * 1000 : 0
process.stdout.write(`  話すことの受けと留保 (現在形): ${ukeTotal} 回、千字あたり ${ukeRate.toFixed(1)} 回 (3 回までが目安)\n`)
if (ukeRate > 3) process.stdout.write(`  → 話すことの受けと留保が千字あたり ${ukeRate.toFixed(1)} 回。3 回までにする (language.md の 7)\n`)

for (const r of rows) if (r.sec && (r.notes / PACE) * 60 > r.sec * 1.3) process.stdout.write(`  → ${r.id}: 粗密は ${r.sec} 秒だが、話す字数 ${r.notes} 字は約 ${Math.round((r.notes / PACE) * 60)} 秒かかる\n`)

// 中核メッセージの位置。「中核: <状態の番号>」を書いたシーンの、その状態が始まるまでの時間を見積もる
// (シーンの秒数を状態の数で割って配る)。冒頭に問いを置く型でも、答えは持ち時間の 3 分の 1 までに言う (story.md の 5)
const coreRow = rows.find((r) => r.core)
if (coreRow) {
  let at = 0
  for (const r of rows) {
    if (r === coreRow) { at += r.sec && r.states ? (r.sec / r.states) * (r.core - 1) : 0; break }
    at += r.sec ?? 0
  }
  process.stdout.write(`  中核メッセージ: ${coreRow.id} の状態 ${coreRow.core}、開始から約 ${Math.round(at)} 秒${limit ? ` (持ち時間の ${Math.round((at / limit) * 100)}%)` : ''}\n`)
  if (limit && at > limit / 3) process.stdout.write(`  → 中核メッセージが持ち時間の 3 分の 1 (${Math.round(limit / 3)} 秒) より後にある\n`)
} else {
  process.stdout.write('  中核メッセージを最初に言うシーンに「中核: <状態の番号>」が無い\n')
}

const count = (g) => rows.filter((r) => r.grain === g).length
process.stdout.write(`  粗 ${count('粗')} · 中 ${count('中')} · 密 ${count('密')}\n`)
if (count('密') === 0) process.stdout.write('  → 密がない。どこにも留まっていない\n')
// 6 割は、話者が仕上げた KomeKaigi (28 シーン中 中 16、57%) が通る線。それより中が多いと平らになる
if (rows.length && count('中') / rows.length > 0.6) process.stdout.write('  → 6 割超が中。平らである。粗に畳むか、実物を足して密にする\n')
for (const r of rows) if (r.grain === '粗' && (r.sec ?? 0) > 20) process.stdout.write(`  → ${r.id}: 粗なのに ${r.sec} 秒ある。論点を落としているか\n`)
for (const r of rows) if (r.sec && r.states && r.sec / r.states > 90) process.stdout.write(`  → ${r.id}: 1 状態あたり ${Math.round(r.sec / r.states)} 秒。画面が止まりすぎていないか\n`)

// 章ごとの合計。メッセージマップで決めた厚みと、実際の時間配分を突き合わせる (reduce.md 手順 1)
const byChapter = new Map()
for (const r of rows) byChapter.set(r.chapter, (byChapter.get(r.chapter) ?? 0) + (r.sec ?? 0))
process.stdout.write('\n  章ごとの時間\n')
for (const [ch, sec] of byChapter) process.stdout.write(`  ${String(sec).padStart(5)} 秒 ${String(Math.round((sec / (total || 1)) * 100)).padStart(3)}%  ${ch}\n`)
