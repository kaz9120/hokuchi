// 記事の中身。原稿 (notes/<名前>/index.md) と構成 (outline.yaml)。単位は段落。
//
// 段落は、本文を空行で分けたまとまり。コードの囲み (```) は中に空行があっても 1 つにまとめる。
// 見出し・画像・埋め込みも 1 つの段落として数える。番号は本文の頭から 1 始まり。
// 書き戻すときは、その段落の範囲だけを置き換える。front matter とほかの段落には触らない
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { Block, BlockKind, Finding, NoteView, Section, Work } from '../../shared/types.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { lintDraft, splitFrontMatter } from '../../../../tools/notes/src/lint.mjs'
// @ts-expect-error JS のモジュール (型が無い)
import { toPasteText } from '../../../../tools/notes/src/paste.mjs'
import { PRIVATE, places } from '../infra/config.ts'
import { conflict, invalid } from '../infra/errors.ts'
import { readText, readVersioned, rewrite, versionOf, writeText, yamlText } from '../infra/files.ts'
import { noteDir } from '../store/places.ts'

export const SLUG = /^[a-z0-9][a-z0-9-]*$/
export const draftFile = (slug: string) => join(noteDir(slug), 'index.md')
export const outlineFile = (slug: string) => join(noteDir(slug), 'outline.yaml')
export const feedbackFile = (slug: string) => join(noteDir(slug), 'feedback.yaml')

/** 段落の書き出し。指摘の位置を付け直すときの目印にする。空白を除いた先頭 20 字 */
export const headOf = (text: string) => text.replace(/\s+/g, '').slice(0, 20)

const kindOf = (text: string): BlockKind =>
  /^#{1,6} /.test(text) ? 'heading' : /^(!\[|\[!\[)/.test(text) ? 'image' : /^```/.test(text) ? 'code' : /^https?:\/\/\S+$/.test(text) ? 'embed' : /^> /.test(text) ? 'quote' : /^([-*+] |\d+\. )/.test(text) ? 'list' : /^<!--/.test(text) ? 'comment' : 'prose'

const visible = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s/g, '').length

type Span = Block & { start: number; end: number }

/** 本文を段落に分ける。start と end は本文の中の位置 (end は段落の最後の文字の次) */
export function splitBlocks(body: string): Span[] {
  const blocks: { start: number; end: number }[] = []
  let pos = 0
  let cur: { start: number; end: number } | null = null
  let fence: string | null = null
  for (const line of body.split('\n')) {
    const end = pos + line.length
    if (fence) {
      cur!.end = end
      if (line.startsWith(fence)) fence = null
    } else if (line.trim() === '') {
      if (cur) blocks.push(cur)
      cur = null
    } else {
      if (!cur) cur = { start: pos, end }
      else cur.end = end
      const f = line.match(/^(`{3,})/)
      if (f) fence = f[1]
    }
    pos = end + 1
  }
  if (cur) blocks.push(cur)
  return blocks.map((b, i) => {
    const text = body.slice(b.start, b.end)
    const kind = kindOf(text)
    return { n: i + 1, kind, text, head: headOf(text), chars: kind === 'prose' || kind === 'quote' || kind === 'list' ? visible(text) : 0, start: b.start, end: b.end }
  })
}

export function parseDraft(md: string) {
  const { fm, body } = splitFrontMatter(md) as { fm: string | null; body: string }
  let meta: Record<string, any> = {}
  try {
    meta = fm ? (YAML.parse(fm) ?? {}) : {}
  } catch {}
  return { meta, fm, body, offset: md.length - body.length, blocks: splitBlocks(body) }
}

/** lint の検査結果を、本文の抜粋 (at) を含む段落に寄せる。寄せられないものは記事全体 (n: null) */
function lintBlocks(md: string, blocks: Block[]): Finding[] {
  const plain = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<([^>\s]+)>/g, '$1').replace(/\\(.)/g, '$1')
  const texts = blocks.map((b) => plain(b.text))
  return lintDraft(md).map((f: any) => {
    const i = f.at ? texts.findIndex((t) => t.includes(f.at) || t.replace(/^#{1,6} /, '').includes(f.at)) : -1
    return { rule: f.id, level: f.severity, message: f.message, n: i >= 0 ? blocks[i].n : null }
  })
}

// ---------------------------------------------------------------- 構成

const OUTLINE_HEAD = [
  '# 記事の構成。studio の構成の画面と Claude が書く。「この構成で書く」を押したあとは studio だけが書く',
  '#   sections: 見出しの並び。先頭は「冒頭」で、point がフック (冒頭に置く場面)',
  '#   title: 見出し (原稿の ## と同じ文字)。point: その見出しで伝えること (1 行)',
  '#   grain: 密 か 粗。密は 2 つまで (writing-note の somitsu.md)。budget: 字数の予算 (空白を除く)',
  '',
].join('\n')

export function readOutline(slug: string): { exists: boolean; sections: Section[]; version: string } {
  const { text, version } = readVersioned(outlineFile(slug))
  let raw: any[] = []
  try {
    raw = text ? (YAML.parse(text)?.sections ?? []) : []
  } catch {}
  const sections: Section[] = raw.map((x) => ({ title: String(x.title ?? ''), point: String(x.point ?? ''), grain: x.grain === '密' ? '密' : '粗', budget: Number(x.budget) || 0 }))
  if (sections.length && sections[0].title !== '冒頭') sections.unshift({ title: '冒頭', point: '', grain: '粗', budget: 0 })
  return { exists: text !== null, sections, version }
}

export function writeOutline(slug: string, sections: Section[], base?: string) {
  const clean = sections.map((s) => ({ title: s.title, point: s.point, grain: s.grain === '密' ? '密' : '粗', budget: Math.max(0, Math.round(Number(s.budget) || 0)) }))
  writeText(outlineFile(slug), OUTLINE_HEAD + yamlText({ sections: clean }), base)
}

/** 原稿を見出し (##) で区切り、区切りごとの地の文の字数を数える。先頭は「冒頭」 */
function sectionChars(blocks: Block[]) {
  const out = [{ title: '冒頭', chars: 0 }]
  for (const b of blocks) {
    if (b.kind === 'heading' && /^## /.test(b.text)) out.push({ title: b.text.replace(/^##\s+/, '').trim(), chars: 0 })
    else out[out.length - 1].chars += b.chars
  }
  return out
}

// ---------------------------------------------------------------- 原稿

export function ensureDraft(slug: string, title: string) {
  if (!existsSync(draftFile(slug))) {
    mkdirSync(join(noteDir(slug), 'assets'), { recursive: true })
    writeText(draftFile(slug), `---\n${yamlText({ title: title || '無題' })}---\n\n`)
  }
}

function listAssets(slug: string) {
  const dir = join(noteDir(slug), 'assets')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .sort()
    .map((f) => `assets/${f}`)
}

/** 本文に出てくる順の画像。note に 1 枚ずつ貼るため */
function imagesInOrder(blocks: Block[], slug: string): string[] {
  const used = blocks.flatMap((b) => [...b.text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]))
  const rest = listAssets(slug).filter((a) => !used.includes(a))
  return [...used.filter((u) => u.startsWith('assets/')), ...rest]
}

/** 見出し画像の下地 (hokuchi-private/eyecatch/<公開日>-<名前>/eyecatch.jpg)。名前か作品の id で探す */
export function eyecatchOf(work: Work): string | null {
  const base = join(PRIVATE, 'eyecatch')
  if (!existsSync(base)) return null
  const names = [work.note?.slug, work.id].filter(Boolean) as string[]
  const dir = readdirSync(base)
    .filter((d) => names.some((n) => d === n || d.endsWith(`-${n}`)))
    .sort()
    .at(-1)
  if (!dir) return null
  for (const f of ['eyecatch.jpg', 'eyecatch.png', 'motif.jpg']) if (existsSync(join(base, dir, f))) return join(base, dir, f)
  return null
}

export function noteView(work: Work): NoteView | undefined {
  const slug = work.note?.slug
  if (!slug) return undefined
  const { text, version } = readVersioned(draftFile(slug))
  const outline = readOutline(slug)
  if (text === null) return { slug, dir: noteDir(slug), exists: false, version, title: work.title, tags: [], blocks: [], findings: [], outline: outline.sections, outlineVersion: outline.version, chars: [], total: 0, images: [] }
  const { meta, blocks } = parseDraft(text)
  const clean = blocks.map(({ start, end, ...b }) => b)
  let findings: Finding[] = []
  try {
    findings = lintBlocks(text, clean)
  } catch {}
  return {
    slug,
    dir: noteDir(slug),
    exists: true,
    version,
    title: String(meta.title ?? work.title ?? ''),
    tags: (meta.hashtags ?? []).map(String),
    eyecatch: meta.eyecatch,
    blocks: clean,
    findings,
    outline: outline.sections,
    outlineVersion: outline.version,
    chars: sectionChars(clean),
    total: clean.reduce((s, b) => s + b.chars, 0),
    images: imagesInOrder(clean, slug),
    eyecatchReady: !!eyecatchOf(work),
  }
}

/** 段落を書き換える。base は原稿の版。空にしたら段落を消す */
export function editBlock(slug: string, n: number, text: string, base: string) {
  rewrite(
    draftFile(slug),
    (md) => {
      const { blocks, offset } = parseDraft(md)
      const b = blocks[n - 1]
      if (!b) throw invalid(`段落 ${n} はありません`)
      const start = offset + b.start
      let end = offset + b.end
      let next = text.trim()
      if (!next) {
        // 段落を消すときは、後ろの空行も一緒に詰める
        while (md[end] === '\n') end++
        return md.slice(0, start) + md.slice(end)
      }
      return md.slice(0, start) + next + md.slice(end)
    },
    base,
  )
}

/** front matter の項目を書き換える。null や空の配列を渡した項目は消す。本文には触らない */
export function setMeta(slug: string, patch: Record<string, unknown>) {
  rewrite(draftFile(slug), (md) => {
    const { meta, offset } = parseDraft(md)
    const next = { ...meta }
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k]
      else next[k] = v
    }
    return `---\n${yamlText(next)}---\n${md.slice(offset).replace(/^\n?/, '\n')}`
  })
}

/** note のエディタに貼る本文 */
export function pasteText(slug: string): string {
  const md = readText(draftFile(slug))
  if (md === null) throw invalid('原稿がありません')
  return toPasteText(md).text ?? toPasteText(md)
}

/** 置き場の名前を変える。すでにあれば -2, -3 を付ける。決まった名前を返す */
export function renameDraft(from: string, wanted: string): string {
  if (!SLUG.test(wanted)) throw invalid('名前は半角の英小文字・数字・ハイフンにしてください')
  if (from === wanted) return from
  let name = wanted
  for (let i = 2; existsSync(noteDir(name)); i++) name = `${wanted}-${i}`
  renameSync(noteDir(from), noteDir(name))
  return name
}

/** 公開済みの記事を原稿に写す。made/ に構成や聴衆役の記録があれば一緒に戻す。決まった名前を返す */
export function reviseFromArchive(archiveDir: string, wanted: string, made: string | null): string {
  let name = wanted
  for (let i = 2; existsSync(noteDir(name)); i++) name = `${wanted}-${i}`
  mkdirSync(noteDir(name), { recursive: true })
  if (made && existsSync(made)) for (const f of ['outline.yaml', 'readers.yaml', 'feedback.yaml', 'reads']) if (existsSync(join(made, f))) cpSync(join(made, f), join(noteDir(name), f), { recursive: true })
  if (existsSync(join(archiveDir, 'assets'))) cpSync(join(archiveDir, 'assets'), join(noteDir(name), 'assets'), { recursive: true })
  writeText(draftFile(name), readText(join(archiveDir, 'index.md'))!)
  return name
}

export const existingDraftNames = () => (existsSync(places.notes) ? readdirSync(places.notes) : [])

export function checkBase(slug: string, base: string) {
  if (versionOf(readText(draftFile(slug))) !== base) throw conflict()
}
