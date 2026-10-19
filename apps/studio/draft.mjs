// 記事の原稿 (ADR-0046)。<HOKUCHI_PRIVATE>/notes/<slug>/index.md を、段落を単位に読み書きする。
//
// 段落は、本文を空行で分けたまとまり。コードの囲み (```) は中に空行があっても 1 つにまとめる。
// 見出し・画像・埋め込みも 1 つの段落として数える。番号は本文の頭から 1 始まり。
// 書き戻すときは、その段落の範囲だけを置き換える。front matter とほかの段落には触らない。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
    blocks: blocks.map(({ n, kind, text, head }) => ({ n, kind, text, head })),
    lint: lintBlocks(md, blocks),
    stats: draftStats(md),
  }
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
