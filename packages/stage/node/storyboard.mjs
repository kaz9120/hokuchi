// 絵コンテ (talks/<slug>/storyboard.md) の読み取り。形式は .claude/skills/crafting-presentation/references/storyboard.md
//
//   # タイトル
//   中核メッセージ: …            ← 見出しの前の「キー: 値」はトーク全体の情報
//   ## 1. 章の名前（種類・厚み）
//   この章で理解すること: …
//   ### <scene-id> — シーンの名前
//   伝えること: …                ← 状態より前の「キー: 値」はシーンの情報
//   1. 画面で何が見え、何が変わるか〔動きの役割〕
//      > 話すこと (複数行可)
//   2. …

const FIELD = /^([^\s:：>#\d][^:：]{0,15})[:：]\s*(.*)$/
const SCENE = /^###\s+([a-z0-9][a-z0-9-]*)\s+[—–-]+\s+(.+)$/
const STATE = /^(\d+)\.\s+(.*)$/
const NOTE = /^\s*>\s?(.*)$/
const ROLE = /〔([^〕]+)〕/g

export function parseStoryboard(md) {
  const board = { title: '', meta: {}, chapters: [], scenes: [] }
  let chapter = null
  let scene = null
  let state = null
  const lines = md.split('\n')
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/\s+$/, '')
    let m
    if ((m = line.match(/^#\s+(.+)$/))) {
      board.title = m[1]
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      chapter = { name: m[1], meta: {} }
      board.chapters.push(chapter)
      scene = state = null
    } else if ((m = line.match(SCENE))) {
      scene = { id: m[1], title: m[2].trim(), chapter: chapter?.name ?? null, meta: {}, states: [], line: n }
      board.scenes.push(scene)
      state = null
    } else if (scene && (m = line.match(STATE))) {
      const text = m[2]
      // line と noteLines は、制作アプリ (apps/studio) が絵コンテをその場で書き換えるときに使う
      state = { screen: text.replace(ROLE, '').trim(), roles: [...text.matchAll(ROLE)].map((r) => r[1]), notes: [], line: n, noteLines: [] }
      scene.states.push(state)
    } else if (state && (m = line.match(NOTE))) {
      state.notes.push(m[1])
      state.noteLines.push(n)
    } else if ((m = line.match(FIELD))) {
      const target = scene && !state ? scene.meta : !scene && chapter ? chapter.meta : !scene ? board.meta : null
      if (target) target[m[1].trim()] = m[2].trim()
    }
  }
  for (const s of board.scenes) s.notes = s.states.map((st) => st.notes.join('\n').trim())
  return board
}

/** 「中（45 秒）」「1 分 30 秒」のような書き方から秒数を読む */
export function seconds(text) {
  if (!text) return null
  const min = text.match(/(\d+(?:\.\d+)?)\s*分/)
  const sec = text.match(/(\d+)\s*秒/)
  if (!min && !sec) return null
  return Math.round((min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0))
}

/** 状態の「話すこと」を書き換えた絵コンテを返す。scene は id、state は 0 始まりの番号 */
export function replaceNotes(md, sceneId, stateIndex, text) {
  const board = parseStoryboard(md)
  const st = board.scenes.find((s) => s.id === sceneId)?.states[stateIndex]
  if (!st) throw new Error(`${sceneId} の状態 ${stateIndex + 1} が絵コンテにありません`)
  const lines = md.split('\n')
  const indent = (st.noteLines.length ? lines[st.noteLines[0]].match(/^\s*/)[0] : '   ')
  const next = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `${indent}> ${l}`)
  const at = st.noteLines.length ? st.noteLines[0] : st.line + 1
  const count = st.noteLines.length ? st.noteLines.at(-1) - st.noteLines[0] + 1 : 0
  lines.splice(at, count, ...next)
  return lines.join('\n')
}
