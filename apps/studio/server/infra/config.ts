// 置き場とポート。環境変数で変えられる (README の表)
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

export const studioDir = resolve(import.meta.dirname, '../..')
export const repoRoot = resolve(studioDir, '../..')

/** 公開リポジトリの外の置き場。tools/notes/src/drafts.mjs と同じ既定 */
export const PRIVATE = process.env.HOKUCHI_PRIVATE ?? join(homedir(), 'Hobby', 'hokuchi-private')
export const PORT = Number(process.env.HOKUCHI_STUDIO_PORT ?? 5300)
export const SITE_PORT = Number(process.env.HOKUCHI_SITE_PORT ?? 5280)

export const places = {
  works: join(PRIVATE, 'works'),
  seeds: join(PRIVATE, 'seeds'),
  notes: join(PRIVATE, 'notes'),
  talks: join(PRIVATE, 'talks'),
  trash: join(PRIVATE, 'trash'),
  archive: join(repoRoot, 'articles/note'),
  personas: join(repoRoot, 'personas'),
}

/** 画面と依頼文に出す場所。リポジトリの中は相対パス、外は絶対パス */
export const shownDir = (dir: string) => (dir.startsWith(repoRoot + sep) ? relative(repoRoot, dir) : dir)
