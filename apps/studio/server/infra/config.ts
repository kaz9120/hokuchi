// 置き場・ポート・Claude の設定。環境変数で変えられる (README の表)
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

export const studioDir = resolve(import.meta.dirname, '../..')
export const repoRoot = resolve(studioDir, '../..')

/** 公開リポジトリの外の置き場。tools/notes/src/drafts.mjs と同じ既定 */
export const PRIVATE = process.env.HOKUCHI_PRIVATE ?? join(homedir(), 'Hobby', 'hokuchi-private')
export const PORT = Number(process.env.HOKUCHI_STUDIO_PORT ?? 5300)
export const SITE_PORT = Number(process.env.HOKUCHI_SITE_PORT ?? 5280)
/** 作品の会話で動かす Claude のモデル。claude -p の --model にそのまま渡す */
export const MODEL = process.env.HOKUCHI_STUDIO_MODEL ?? 'opus'
/** 記録 (git) を行うリポジトリ。テストでは使い捨てのリポジトリに差し替える */
export const gitRoot = process.env.HOKUCHI_GIT_ROOT ?? repoRoot
/** サイトを組み立てるスクリプト (リポジトリからの相対か絶対パス)。テストでは偽物に差し替える */
export const SITE_BUILD = process.env.HOKUCHI_SITE_BUILD ?? 'apps/slides/build.mjs'
/** サイトを公開するコマンド。試すときは偽物に差し替え、本物の公開をしない */
export const WRANGLER = process.env.HOKUCHI_WRANGLER ? [process.env.HOKUCHI_WRANGLER] : ['bunx', 'wrangler']
/** note の CLI (sync)。テストでは偽物に差し替える */
export const NOTES_CLI = process.env.HOKUCHI_NOTES_CLI ?? 'tools/notes/cli.mjs'
/** claude の実行ファイル。テストでは偽物に差し替える */
export const CLAUDE_BIN = process.env.HOKUCHI_CLAUDE_BIN ?? 'claude'

export const places = {
  works: join(PRIVATE, 'works'),
  neta: join(PRIVATE, 'neta'),
  notes: join(PRIVATE, 'notes'),
  privateTalks: join(PRIVATE, 'talks'),
  trash: join(PRIVATE, 'trash'),
  talks: process.env.HOKUCHI_TALKS ?? join(repoRoot, 'talks'),
  archive: process.env.HOKUCHI_ARCHIVE ?? join(repoRoot, 'articles/note'),
  personas: join(repoRoot, 'personas'),
}

/** 画面と Claude への文に出す場所。リポジトリの中は相対パス、外は絶対パス */
export const shownDir = (dir: string) => (dir.startsWith(repoRoot + sep) ? relative(repoRoot, dir) : dir)
