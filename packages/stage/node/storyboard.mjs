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
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    let m
    if ((m = line.match(/^#\s+(.+)$/))) {
      board.title = m[1]
    } else if ((m = line.match(/^##\s+(.+)$/))) {
      chapter = { name: m[1], meta: {} }
      board.chapters.push(chapter)
      scene = state = null
    } else if ((m = line.match(SCENE))) {
      scene = { id: m[1], title: m[2].trim(), chapter: chapter?.name ?? null, meta: {}, states: [] }
      board.scenes.push(scene)
      state = null
    } else if (scene && (m = line.match(STATE))) {
      const text = m[2]
      state = { screen: text.replace(ROLE, '').trim(), roles: [...text.matchAll(ROLE)].map((r) => r[1]), notes: [] }
      scene.states.push(state)
    } else if (state && (m = line.match(NOTE))) {
      state.notes.push(m[1])
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
