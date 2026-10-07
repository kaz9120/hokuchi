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
const { parseStoryboard, seconds } = await import(pathToFileURL(path.resolve(here, '../../../../tools/stage/storyboard.mjs')).href)

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

const count = (g) => rows.filter((r) => r.grain === g).length
process.stdout.write(`  粗 ${count('粗')} · 中 ${count('中')} · 密 ${count('密')}\n`)
if (count('密') === 0) process.stdout.write('  → 密がない。どこにも留まっていない\n')
if (rows.length && count('中') / rows.length > 0.6) process.stdout.write('  → 6 割超が中。平らである (山はあっても谷がないので、山に見えない)\n')
for (const r of rows) if (r.grain === '粗' && (r.sec ?? 0) > 20) process.stdout.write(`  → ${r.id}: 粗なのに ${r.sec} 秒ある。論点を落としているか\n`)
for (const r of rows) if (r.sec && r.states && r.sec / r.states > 90) process.stdout.write(`  → ${r.id}: 1 状態あたり ${Math.round(r.sec / r.states)} 秒。画面が止まりすぎていないか\n`)

// 章ごとの合計。メッセージマップで決めた厚みと、実際の時間配分を突き合わせる (reduce.md 手順 1)
const byChapter = new Map()
for (const r of rows) byChapter.set(r.chapter, (byChapter.get(r.chapter) ?? 0) + (r.sec ?? 0))
process.stdout.write('\n  章ごとの時間\n')
for (const [ch, sec] of byChapter) process.stdout.write(`  ${String(sec).padStart(5)} 秒 ${String(Math.round((sec / (total || 1)) * 100)).padStart(3)}%  ${ch}\n`)
