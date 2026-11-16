#!/usr/bin/env node
// rehearse.mjs — 絵コンテの「話すこと」を合成音声にし、check の静止画に重ねて、通しの動画にする。
//
//   node .claude/skills/crafting-presentation/scripts/rehearse.mjs <トークのフォルダ> [--voice <id>] [--speed <倍率>]
//
// 先に `bun run check <トーク>` を回して out/states/ を作っておく。出力は次の 2 つ。
//   out/rehearsal.mp4  通しの動画。話者・Gemini・聴衆役に見せる
//   out/rehearsal.md   状態ごとの開始時刻・画面・話すことの一覧。動画を見られない読み手に渡す
//
// 動きは入らない (状態ごとの静止画)。見たいのは、話の流れ・1 状態の長さ・画面と話の食い違いで、
// 遷移の見え方は check --motion のコマ撮りで見る。
//
// 声は VOICEVOX core (既定は ~/.local/share/voicevox の tts.py と venv。VOICEVOX_DIR で変えられる)。
// 無ければ macOS の say (Kyoko) で読む。既定の声 13 は青山龍星 (ノーマル)。

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseStoryboard } from '../../../../packages/stage/node/storyboard.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const talkDir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
if (!talkDir) {
  console.error('usage: rehearse.mjs <トークのフォルダ> [--voice <id>] [--speed <倍率>]')
  process.exit(2)
}
const dir = resolve(talkDir)
const voice = opt('--voice', '13')
// 仮の値。話者の話す速さに合うかはまだ確かめていない。最初の通しを話者に見てもらって合わせる
const speed = opt('--speed', '1.15')
const out = join(dir, 'out')
const work = join(out, 'rehearsal')
const states = join(out, 'states')

const board = parseStoryboard(readFileSync(join(dir, 'storyboard.md'), 'utf8'))
if (!existsSync(states)) {
  console.error(`${states} がありません。先に bun run check <トーク> を回してください`)
  process.exit(1)
}

// 状態の静止画は <scene-id>-<0 始まりの番号>.png (packages/stage/node/talk.mjs の shootStates)
const items = []
const missing = []
for (const scene of board.scenes) {
  scene.states.forEach((st, i) => {
    const png = join(states, `${scene.id}-${i}.png`)
    if (!existsSync(png)) missing.push(`${scene.id}-${i}`)
    items.push({ scene: scene.id, title: scene.title, n: i + 1, screen: st.screen, text: speakable(st.notes.join('\n')), png })
  })
}
if (missing.length) {
  console.error(`静止画が足りません (絵コンテと実装の状態の数が合っていない可能性があります): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`)
  process.exit(1)
}

rmSync(work, { recursive: true, force: true })
mkdirSync(join(work, 'audio'), { recursive: true })
mkdirSync(join(work, 'seg'), { recursive: true })

// --- 音声 -------------------------------------------------------------------
const vvDir = process.env.VOICEVOX_DIR ?? join(homedir(), '.local/share/voicevox')
const vvPython = join(vvDir, 'venv/bin/python')
const vvScript = join(vvDir, 'tts.py')
const jobs = items.map((it, i) => ({ text: it.text || '。', out: join(work, 'audio', `${String(i).padStart(3, '0')}.wav`) }))
if (existsSync(vvPython) && existsSync(vvScript)) {
  const r = spawnSync(vvPython, [vvScript, '--batch', voice, speed], { input: JSON.stringify(jobs), stdio: ['pipe', 'inherit', 'inherit'] })
  if (r.status !== 0) process.exit(r.status ?? 1)
} else {
  console.error('VOICEVOX が見つからないので、say (Kyoko) で読みます')
  const rate = String(Math.round(200 * Number(speed)))
  for (const j of jobs) {
    const aiff = j.out.replace(/\.wav$/, '.aiff')
    execFileSync('say', ['-v', 'Kyoko', '-r', rate, '-o', aiff, j.text])
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, j.out])
  }
}

// --- 状態ごとの動画をつないで 1 本にする ----------------------------------------
const PAD = 0.6 // 状態の切り替わりで息をつく秒数
const duration = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
let t = 0
const list = []
const rows = []
items.forEach((it, i) => {
  const wav = jobs[i].out
  const len = (it.text ? duration(wav) : 1.2) + PAD
  const seg = join(work, 'seg', `${String(i).padStart(3, '0')}.mp4`)
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-loop', '1', '-i', it.png, '-i', wav,
    '-filter_complex', `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v];[1:a]apad,atrim=0:${len.toFixed(3)}[a]`,
    '-map', '[v]', '-map', '[a]', '-t', len.toFixed(3), '-r', '30', '-c:v', 'libx264', '-tune', 'stillimage', '-c:a', 'aac', '-ar', '48000', seg,
  ])
  list.push(`file '${seg}'`)
  rows.push({ ...it, at: t, len })
  t += len
})
writeFileSync(join(work, 'list.txt'), list.join('\n'))
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-c', 'copy', join(out, 'rehearsal.mp4')])

// --- 時刻つきの一覧 ---------------------------------------------------------
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const md = [`# 通し: ${board.title}`, '', `合計 ${clock(t)}。持ち時間: ${board.meta['持ち時間'] ?? '(絵コンテに無し)'}。声 ${voice}、速さ ${speed}。`, '']
let last = null
for (const r of rows) {
  if (r.scene !== last) md.push(...(last ? [''] : []), `## ${r.scene} — ${r.title}`, '')
  last = r.scene
  md.push(`- ${clock(r.at)} (${r.len.toFixed(0)} 秒) 状態 ${r.n}: ${r.screen}`, ...(r.text ? [`  > ${r.text.replace(/\n/g, ' ')}`] : []))
}
writeFileSync(join(out, 'rehearsal.md'), md.join('\n') + '\n')
console.log(`out/rehearsal.mp4 (${clock(t)}) と out/rehearsal.md を書きました`)

/** ノートの Markdown を、読み上げる文にする */
function speakable(s) {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
}
