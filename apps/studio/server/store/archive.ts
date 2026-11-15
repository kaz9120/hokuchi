// 公開済みの note の記事のアーカイブ (articles/note/<公開日>-<slug>/)。index.md は生成物なので読むだけにする。
// 描画は tools/notes の最小レンダラを使い回す
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { Archive } from '../../shared/api.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { splitFrontMatter } from '../../../../tools/notes/src/lint.mjs'
// @ts-expect-error JS のモジュール (型が無い)
import { renderBody } from '../../../../tools/notes/src/render.mjs'
import { places } from '../infra/config.ts'

const DIR = /^\d{4}-\d{2}-\d{2}-/
const isArticle = (name: string) => DIR.test(name) && existsSync(join(places.archive, name, 'index.md'))
/** アーカイブのディレクトリ名から、記事の slug を読む (<公開日>-<slug>) */
export const slugOfArchive = (dir: string) => dir.slice(11)
export const archiveDir = (dir: string) => join(places.archive, dir)

function read(name: string) {
  const { fm, body } = splitFrontMatter(readFileSync(join(places.archive, name, 'index.md'), 'utf8'))
  return { meta: (fm ? YAML.parse(fm) : {}) ?? {}, body: body as string }
}

/** 一覧。新しい順 */
export function listArchives(): Archive[] {
  if (!existsSync(places.archive)) return []
  return readdirSync(places.archive)
    .filter(isArticle)
    .map((name): Archive => {
      const { meta, body } = read(name)
      return {
        dir: name,
        title: meta.title ?? name,
        publishedAt: String(meta.published_at ?? name.slice(0, 10)).slice(0, 10),
        url: meta.note_url ?? null,
        eyecatch: meta.eyecatch ?? null,
        tags: meta.hashtags ?? [],
        chars: body.replace(/\s/g, '').length,
      }
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

export const archiveOfSlug = (slug: string | null | undefined) => (slug ? (listArchives().find((a) => slugOfArchive(a.dir) === slug) ?? null) : null)

/** 1 本を、画面で読める形にする。画像の参照は assetBase に向け直す */
export function readArchive(name: string, assetBase: string): Archive | null {
  const a = listArchives().find((x) => x.dir === name)
  if (!a) return null
  const { html } = renderBody(read(name).body)
  return { ...a, html: String(html).replaceAll('src="assets/', `src="${assetBase}assets/`) }
}

/** 記事の画像。ディレクトリの外は読ませない */
export function archiveAsset(name: string, rel: string) {
  if (!isArticle(name) || rel.includes('..')) return null
  const file = join(places.archive, name, rel)
  return existsSync(file) ? file : null
}
