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

/**
 * シーンの「キー: 値」(粗密など) を書き換えた絵コンテを返す。キーが無ければ、状態の行の前に足す。
 * 制作アプリ (apps/studio) の構成の画面が、粗密と時間を人が決めるときに使う
 */
export function replaceSceneMeta(md, sceneId, key, value) {
  const board = parseStoryboard(md)
  const i = board.scenes.findIndex((s) => s.id === sceneId)
  if (i < 0) throw new Error(`${sceneId} が絵コンテにありません`)
  const scene = board.scenes[i]
  const lines = md.split('\n')
  // シーンの見出しから、最初の状態 (無ければ次の見出し) までが、シーンの情報の範囲
  const end = scene.states[0]?.line ?? lines.findIndex((l, n) => n > scene.line && /^##+ /.test(l))
  const stop = end < 0 ? lines.length : end
  const at = lines.findIndex((l, n) => n > scene.line && n < stop && l.match(FIELD)?.[1].trim() === key)
  if (at >= 0) lines[at] = `${key}: ${value}`
  else {
    // 情報の並びの最後 (空行の手前) に足す
    let last = scene.line
    for (let n = scene.line + 1; n < stop; n++) if (FIELD.test(lines[n])) last = n
    lines.splice(last + 1, 0, ...(last === scene.line ? ['', `${key}: ${value}`] : [`${key}: ${value}`]))
  }
  return lines.join('\n')
}

/**
 * シーンを、同じ章の中で 1 つ前 (dir = -1) か 1 つ後ろ (dir = 1) へ動かした絵コンテを返す。
 * 章をまたぐ移動はしない (章の「理解すること」と合わなくなるので、話者と Claude で決め直す)
 */
export function moveScene(md, sceneId, dir) {
  const board = parseStoryboard(md)
  const i = board.scenes.findIndex((s) => s.id === sceneId)
  if (i < 0) throw new Error(`${sceneId} が絵コンテにありません`)
  const j = i + (dir < 0 ? -1 : 1)
  const a = board.scenes[Math.min(i, j)]
  const b = board.scenes[Math.max(i, j)]
  if (!a || !b || a.chapter !== b.chapter) throw new Error('章の端なので、これ以上は動かせません')
  const lines = md.split('\n')
  // シーンの範囲は、見出しから、次のシーンか章の見出しの手前まで
  const end = (s) => {
    const n = lines.findIndex((l, k) => k > s.line && /^##+ /.test(l))
    return n < 0 ? lines.length : n
  }
  const blockA = lines.slice(a.line, end(a))
  const blockB = lines.slice(b.line, end(b))
  // 末尾の空行を揃える (最後のシーンには空行が無いことがある)
  const trim = (x) => {
    const y = [...x]
    while (y.length && y.at(-1).trim() === '') y.pop()
    return y
  }
  const tail = lines.slice(end(b))
  return [...lines.slice(0, a.line), ...trim(blockB), '', ...trim(blockA), ...(tail.length ? ['', ...tail] : [''])].join('\n')
}
