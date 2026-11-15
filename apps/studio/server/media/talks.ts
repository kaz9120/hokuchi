// 発表の中身。絵コンテ (storyboard.md) とシーンの実装 (talk.tsx・scenes/)。単位はシーンとコマ。
// 絵と再生は、サイトの開発サーバのトークの URL (/<slug>/) から描く
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TalkView, Work } from '../../shared/types.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { moveScene, parseStoryboard, replaceNotes, replaceSceneMeta, seconds } from '../../../../packages/stage/node/storyboard.mjs'
import { conflict, invalid } from '../infra/errors.ts'
import { readText, readVersioned, rewrite } from '../infra/files.ts'
import { theSite, type SiteTalk } from '../infra/site.ts'
import { talkDirOf } from '../store/places.ts'

export const boardFile = (dir: string) => join(dir, 'storyboard.md')

/** サイトに載っているトークのうち、作品のフォルダのもの */
export function siteTalkOf(work: Work): SiteTalk | null {
  const dir = talkDirOf(work)
  if (!dir) return null
  try {
    for (const t of theSite().talks.values()) if (t.dir === dir) return t
  } catch {}
  return null
}

export function talkView(work: Work, thumbs: { version: number; errors: string[] }): TalkView {
  const dir = talkDirOf(work)
  const exists = !!dir && existsSync(boardFile(dir))
  const { text, version } = readVersioned(dir ? boardFile(dir) : '/nonexistent')
  const board = parseStoryboard(text ?? '')
  const site = siteTalkOf(work)
  const scenes = board.scenes.map((s: any) => ({
    id: s.id,
    title: s.title,
    chapter: s.chapter ?? '',
    message: s.meta['伝えること'] ?? '',
    grain: s.meta['粗密'] ?? '',
    seconds: seconds(s.meta['粗密'] ?? ''),
    koma: s.states.map((st: any, i: number) => ({ n: i + 1, note: s.notes[i] ?? '', screen: st.screen })),
  }))
  let stageUrl: string | undefined
  try {
    if (site) stageUrl = `${theSite().url}/${site.info.slug}/`
  } catch {}
  return {
    slug: site?.info.slug ?? work.talk?.slug,
    dir: dir ?? undefined,
    exists,
    version,
    title: site?.info.title ?? board.title ?? work.title,
    scenes,
    totalSeconds: scenes.reduce((s: number, x: { seconds: number | null }) => s + (x.seconds ?? 0), 0),
    minutes: work.decided.event?.minutes ?? (seconds(board.meta['持ち時間'] ?? '') ?? 0) / 60,
    stageUrl,
    thumbsVersion: thumbs.version,
    thumbErrors: thumbs.errors,
    onSite: !!site && site.info.public && !site.outside,
  }
}

/** コマの「話すこと」を書き換える。orig は読んだときの文 (違えば 409) */
export function editNote(dir: string, scene: string, n: number, orig: string, text: string) {
  rewrite(boardFile(dir), (md) => {
    const board = parseStoryboard(md)
    const cur = board.scenes.find((s: any) => s.id === scene)?.notes[n - 1]
    if (cur === undefined) throw invalid(`${scene} のコマ ${n} が絵コンテにありません`)
    if (cur !== String(orig ?? '').trim()) throw conflict('この話すことは、ほかで変更されています。画面を読み込み直してから直してください', cur)
    return replaceNotes(md, scene, n - 1, String(text ?? ''))
  })
}

/** シーンの時間 (粗密の行) を書き換える */
export function setSceneTime(dir: string, scene: string, grain: string, base: string) {
  rewrite(boardFile(dir), (md) => replaceSceneMeta(md, scene, '粗密', grain), base)
}

/** シーンを章の中で前後に動かす */
export function shiftScene(dir: string, scene: string, delta: -1 | 1, base: string) {
  rewrite(boardFile(dir), (md) => moveScene(md, scene, delta), base)
}

export const hasBoard = (dir: string | null) => !!dir && readText(boardFile(dir)) !== null
