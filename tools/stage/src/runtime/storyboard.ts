import type { TalkDef } from './types'

type Board = { scenes: { id: string; title: string; notes: string[] }[] } | null

/** 絵コンテのノートと名前を、シーンに流し込む。シーンの側に書いてあれば、そちらを優先する */
export function withStoryboard(talk: TalkDef, board: Board): TalkDef {
  if (!board) return talk
  return {
    ...talk,
    scenes: talk.scenes.map((s) => {
      const b = board.scenes.find((x) => x.id === s.id)
      return b ? { ...s, title: s.title ?? b.title, notes: s.notes ?? b.notes } : s
    }),
  }
}
