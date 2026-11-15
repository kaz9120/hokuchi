// 作品の中身の置き場。記事は notes/<名前>/、発表は社内なら hokuchi-private/talks/、公開なら talks/
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Work } from '../../shared/types.ts'
import { places } from '../infra/config.ts'

export const noteDir = (slug: string) => join(places.notes, slug)

/** 発表のフォルダ (絶対パス)。まだ作っていなければ null */
export function talkDirOf(work: Work): string | null {
  const dir = work.talk?.dir
  if (!dir) return null
  const base = work.decided.scope === 'public' ? places.talks : places.privateTalks
  const abs = join(base, dir)
  return existsSync(abs) ? abs : join(base, dir)
}

/** 原稿・トークの画像の置き場 */
export function assetsDirOf(work: Work): string | null {
  if (work.kind === 'note' && work.note?.slug) return join(noteDir(work.note.slug), 'assets')
  const talk = talkDirOf(work)
  return talk && existsSync(talk) ? join(talk, 'assets') : null
}
