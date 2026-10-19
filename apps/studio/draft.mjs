// 記事の原稿 (ADR-0046)。<HOKUCHI_PRIVATE>/notes/<slug>/index.md を、段落を単位に読み書きする。
//
// 段落は、本文を空行で分けたまとまり。コードの囲み (```) は中に空行があっても 1 つにまとめる。
// 見出し・画像・埋め込みも 1 つの段落として数える。番号は本文の頭から 1 始まり。
// 書き戻すときは、その段落の範囲だけを置き換える。front matter とほかの段落には触らない。
// 構成 (outline.yaml)・front matter の書き換え・改稿 (ADR-0047) もここが持つ。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { draftStats, lintDraft, splitFrontMatter } from '../../tools/notes/src/lint.mjs'
import { PRIVATE } from './store.mjs'

export const NOTES = join(PRIVATE, 'notes')
export const draftDir = (slug) => join(NOTES, slug)
export const draftFile = (slug) => join(NOTES, slug, 'index.md')
export const hasDraft = (slug) => !!slug && existsSync(draftFile(slug))
export const SLUG = /^[a-z0-9][a-z0-9-]*$/

/** 段落の書き出し。指摘の位置を付け直すときの目印にする。空白を除いた先頭 20 字 */
export const headOf = (text) => text.replace(/\s+/g, '').slice(0, 20)

const kindOf = (text) =>
  /^#{1,6} /.test(text) ? 'heading' : /^(!\[|\[!\[)/.test(text) ? 'image' : /^```/.test(text) ? 'code' : /^https?:\/\/\S+$/.test(text) ? 'embed' : /^> /.test(text) ? 'quote' : /^([-*+] |\d+\. )/.test(text) ? 'list' : /^<!--/.test(text) ? 'comment' : 'prose'

/** 本文を段落に分ける。start と end は本文の中の位置 (end は段落の最後の文字の次) */
export function splitBlocks(body) {
  const blocks = []
  const lines = body.split('\n')
  let pos = 0
  let cur = null
  let fence = null
  const close = () => {
    if (cur) blocks.push(cur)
    cur = null
  }
  for (const line of lines) {
    const end = pos + line.length
    if (fence) {
      cur.end = end
      if (line.startsWith(fence)) fence = null
    } else if (line.trim() === '') {
      close()
    } else {
      if (!cur) cur = { start: pos, end }
      else cur.end = end
      const f = line.match(/^(`{3,})/)
      if (f) fence = f[1]
    }
    pos = end + 1
  }
  close()
  return blocks.map((b, i) => {
    const text = body.slice(b.start, b.end)
    return { n: i + 1, kind: kindOf(text), text, head: headOf(text), start: b.start, end: b.end }
  })
}

/** 原稿を読む。front matter は YAML として読み、本文は段落に分ける */
export function parseDraft(md) {
  const { fm, body } = splitFrontMatter(md)
  let meta = {}
  try {
    meta = fm ? (YAML.parse(fm) ?? {}) : {}
  } catch {}
  return { meta, body, offset: md.length - body.length, blocks: splitBlocks(body) }
}

/** lint の検査結果を、本文の抜粋 (at) を含む段落に寄せる。寄せられないものは記事全体 (n: null) */
export function lintBlocks(md, blocks) {
  // lint は段落の Markdown のリンクを外して比べるので、こちらも同じ形に揃えてから探す
  const plain = (t) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<([^>\s]+)>/g, '$1').replace(/\\(.)/g, '$1')
  const texts = blocks.map((b) => plain(b.text))
  return lintDraft(md).map((f) => {
    const i = f.at ? texts.findIndex((t) => t.includes(f.at) || t.replace(/^#{1,6} /, '').includes(f.at)) : -1
    return { severity: f.severity, id: f.id, message: f.message, n: i >= 0 ? blocks[i].n : null }
  })
}

/** 画面に渡す原稿の様子 */
export function readDraft(slug) {
  const md = readFileSync(draftFile(slug), 'utf8')
  const { meta, blocks } = parseDraft(md)
  return {
    title: String(meta.title ?? ''),
    tags: meta.hashtags ?? [],
    eyecatch: meta.eyecatch ?? null,
    revises: meta.revises ?? null,
    blocks: blocks.map(({ n, kind, text, head }) => ({ n, kind, text, head })),
    lint: lintBlocks(md, blocks),
    stats: draftStats(md),
    sections: sectionChars(blocks),
    assets: listAssets(slug),
  }
}

// ---------------------------------------------------------------- 構成 (outline.yaml)

/** 地の文として数える段落。見出し・画像・埋め込み・コード・コメントは数えない (lint の proseBlocks と揃える) */
const PROSE = new Set(['prose', 'quote', 'list'])
const visible = (t) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s/g, '').length

/** 原稿を見出し (##) で区切り、区切りごとの地の文の字数を数える。先頭は「冒頭」 */
export function sectionChars(blocks) {
  const out = [{ title: '冒頭', n: null, chars: 0 }]
  for (const b of blocks) {
    if (b.kind === 'heading' && /^## /.test(b.text)) out.push({ title: b.text.replace(/^##\s+/, '').trim(), n: b.n, chars: 0 })
    else if (PROSE.has(b.kind)) out[out.length - 1].chars += visible(b.text)
  }
  return out
}

const OUTLINE_HEAD = [
  '# 記事の構成 (ADR-0046)。studio の構成タブが読み書きし、Claude Code も直接直す。',
  '#   sections: 見出しの並び。先頭は「冒頭」で、point がフック (冒頭に置く場面)',
  '#   title: 見出し (原稿の ## と同じ文字)。point: その見出しで伝えること (1 行)',
  '#   grain: 密 か 粗。密は 2 つまで (writing-note の somitsu.md)。budget: 字数の予算 (空白を除く)',
  '',
].join('\n')

export const outlineFile = (slug) => join(NOTES, slug, 'outline.yaml')

/** 構成を読む。無ければ空。先頭が「冒頭」でなければ足す */
export function readOutline(slug) {
  const file = outlineFile(slug)
  let sections = []
  try {
    sections = existsSync(file) ? (YAML.parse(readFileSync(file, 'utf8'))?.sections ?? []) : []
  } catch {}
  sections = sections.map((x) => ({ title: String(x.title ?? ''), point: String(x.point ?? ''), grain: x.grain === '密' ? '密' : '粗', budget: Number(x.budget) || 0 }))
  if (sections.length && sections[0].title !== '冒頭') sections.unshift({ title: '冒頭', point: '', grain: '粗', budget: 0 })
  return { exists: existsSync(file), sections }
}

/** 構成を丸ごと書き換える */
export function saveOutline(slug, sections) {
  const clean = sections.map((x, i) => ({ title: i === 0 ? '冒頭' : String(x.title ?? '').trim(), point: String(x.point ?? '').trim(), grain: x.grain === '密' ? '密' : '粗', budget: Math.max(0, Math.round(Number(x.budget) || 0)) }))
  writeFileSync(outlineFile(slug), OUTLINE_HEAD + YAML.stringify({ sections: clean }, { lineWidth: 0 }))
}

// ---------------------------------------------------------------- front matter と画像

/** front matter の項目を書き換える。null を渡した項目は消す。本文には触らない */
export function setMeta(slug, patch) {
  const file = draftFile(slug)
  const md = readFileSync(file, 'utf8')
  const { meta, offset } = parseDraft(md)
  const next = { ...meta }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k]
    else next[k] = v
  }
  writeFileSync(file, `---\n${YAML.stringify(next, { lineWidth: 0 })}---\n${md.slice(offset).replace(/^\n?/, '\n')}`)
}

/** 原稿の assets/ にある画像 */
export function listAssets(slug) {
  const dir = join(NOTES, slug, 'assets')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .sort()
    .map((f) => `assets/${f}`)
}

// ---------------------------------------------------------------- 改稿 (ADR-0047)

/**
 * 公開済みの記事を、原稿に写す。アーカイブ (articles/note/<公開日>-<slug>/) の index.md と assets/ を
 * <置き場>/notes/<slug>/ に写し、front matter に revises を残す。アーカイブは読むだけで書き換えない。
 * すでに同じ slug の原稿があれば、何もせずにその slug を返す
 */
export function reviseFromArchive(archiveDir, name) {
  const slug = name.slice(11)
  if (!SLUG.test(slug)) throw new Error(`「${name}」から slug を読めません`)
  if (hasDraft(slug)) return { slug, created: false }
  mkdirSync(draftDir(slug), { recursive: true })
  if (existsSync(join(archiveDir, 'assets'))) cpSync(join(archiveDir, 'assets'), join(draftDir(slug), 'assets'), { recursive: true })
  writeFileSync(draftFile(slug), readFileSync(join(archiveDir, 'index.md'), 'utf8'))
  setMeta(slug, { revises: name })
  return { slug, created: true }
}

/**
 * 段落 n を text に置き換える。orig は画面が読んだときの段落で、今の段落と違えば保存しない
 * (Claude Code が同時に直したときに上書きしないため)。text が空なら段落を消す。空行を挟めば段落が分かれる。
 * 戻り値は { before, after } の段落の一覧 (指摘の付け直しに使う)
 */
export function replaceBlock(slug, n, orig, text) {
  const file = draftFile(slug)
  const md = readFileSync(file, 'utf8')
  const { offset, body, blocks } = parseDraft(md)
  const b = blocks[n - 1]
  if (!b || b.text !== orig) throw new Error('この段落は、ほかで変更されています。画面を読み込み直してから直してください')
  const next = text.replace(/\s+$/, '').replace(/^\n+/, '')
  // 消すときは、後ろの空行もまとめて詰める
  const tail = next ? b.end : (body.slice(b.end).match(/^\n*/)[0].length + b.end)
  const newBody = body.slice(0, b.start) + next + body.slice(tail)
  writeFileSync(file, md.slice(0, offset) + newBody)
  return { before: blocks, after: splitBlocks(newBody) }
}

/** 本文の末尾に段落を足す */
export function appendBlock(slug, text) {
  const file = draftFile(slug)
  const md = readFileSync(file, 'utf8')
  const t = text.trim()
  if (!t) return
  writeFileSync(file, `${md.replace(/\s*$/, '')}\n\n${t}\n`)
}

/**
 * 指摘の位置を付け直す関数を作る (ADR-0046)。番号の段落の書き出しが同じならそのまま。
 * 違えば、同じ書き出しの段落を探す。見つからなければ、先頭 8 字が同じ段落。それも無ければ記事全体 ("*")
 */
export function reanchor(blocks) {
  return ({ para, head }) => {
    if (blocks[para - 1]?.head === head) return { para, head }
    const hit = blocks.find((b) => b.head === head) ?? (head && head.length >= 8 ? blocks.find((b) => b.head.startsWith(head.slice(0, 8))) : null)
    return hit ? { para: hit.n, head: hit.head } : { para: '*' }
  }
}

/** 原稿を作る。front matter には企画のタイトルを入れる。本文は空で始める */
export function createDraft(slug, title) {
  if (!SLUG.test(slug)) throw new Error('slug は半角の英小文字・数字・ハイフンで入力してください (例: line-api-expert-thanks)')
  if (existsSync(draftDir(slug))) throw new Error(`原稿「${slug}」はもうあります`)
  mkdirSync(draftDir(slug), { recursive: true })
  writeFileSync(draftFile(slug), `---\n${YAML.stringify({ title: title || '無題' }, { lineWidth: 0 })}---\n\n`)
}
