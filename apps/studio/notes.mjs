// 公開済みの note の記事 (articles/note/<公開日>-<slug>/) を、studio のホームと閲覧画面に出す。
// index.md は生成物なので読むだけにする (ADR-0019)。描画は tools/notes の最小レンダラを使い回す
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { splitFrontMatter } from '../../tools/notes/src/lint.mjs'
import { renderBody } from '../../tools/notes/src/render.mjs'

export function notesRoot(repoRoot) {
  return join(repoRoot, 'articles/note')
}

const isArticle = (root, name) => /^\d{4}-\d{2}-\d{2}-/.test(name) && existsSync(join(root, name, 'index.md'))

function readArticle(root, name) {
  const { fm, body } = splitFrontMatter(readFileSync(join(root, name, 'index.md'), 'utf8'))
  const meta = fm ? YAML.parse(fm) : {}
  return { meta, body }
}

/** 一覧。新しい順 */
export function listNotes(repoRoot) {
  const root = notesRoot(repoRoot)
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((n) => isArticle(root, n))
    .map((name) => {
      const { meta, body } = readArticle(root, name)
      return {
        dir: name,
        title: meta.title ?? name,
        publishedAt: String(meta.published_at ?? name.slice(0, 10)).slice(0, 10),
        url: meta.note_url ?? null,
        eyecatch: meta.eyecatch ? `/api/notes/${encodeURIComponent(name)}/${meta.eyecatch}` : null,
        tags: meta.hashtags ?? [],
        chars: body.replace(/\s/g, '').length,
      }
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

/** 1 本を、画面で読める形にする。画像の参照は studio の API に向け直す */
export function readNote(repoRoot, name) {
  const root = notesRoot(repoRoot)
  if (!isArticle(root, name)) return null
  const { meta, body } = readArticle(root, name)
  const base = `/api/notes/${encodeURIComponent(name)}/`
  const { html } = renderBody(body)
  return {
    dir: name,
    title: meta.title ?? name,
    publishedAt: String(meta.published_at ?? '').slice(0, 10),
    url: meta.note_url ?? null,
    eyecatch: meta.eyecatch ? base + meta.eyecatch : null,
    tags: meta.hashtags ?? [],
    html: html.replaceAll('src="assets/', `src="${base}assets/`),
  }
}

/** 記事の画像。ディレクトリの外は読ませない */
export function noteAsset(repoRoot, name, rel) {
  const root = notesRoot(repoRoot)
  if (!isArticle(root, name) || rel.includes('..')) return null
  const file = join(root, name, rel)
  return existsSync(file) ? readFileSync(file) : null
}
