// 記事の部品 (rebuild.md 4.3)。中身は原稿 (<置き場>/notes/<slug>/index.md) と構成 (outline.yaml)。単位は段落 (ADR-0046)。
//
// 段落は、本文を空行で分けたまとまり。コードの囲み (```) は中に空行があっても 1 つにまとめる。
// 見出し・画像・埋め込みも 1 つの段落として数える。番号は本文の頭から 1 始まり。
// 書き戻すときは、その段落の範囲だけを置き換える。front matter とほかの段落には触らない。
// 公開済みの記事は、アーカイブ (articles/note/) を読むだけにし、改稿は原稿に写してから直す (ADR-0047)
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { Block, BlockKind, Finding, NoteBody, PasteText, Section, SectionChars, SurveyItem, Thread } from '../../shared/api.ts'
import { UNIT_KINDS } from '../../shared/api.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { draftStats, lintDraft, splitFrontMatter } from '../../../../tools/notes/src/lint.mjs'
// @ts-expect-error JS のモジュール (型が無い)
import { toPasteText } from '../../../../tools/notes/src/paste.mjs'
import { places, shownDir } from '../infra/config.ts'
import { conflict, invalid } from '../infra/errors.ts'
import { reveal } from '../infra/reveal.ts'
import { readText, readVersioned, rewrite, versionOf, writeText, yamlText } from '../infra/files.ts'
import { archiveAsset, archiveDir, archiveOfSlug, slugOfArchive } from '../domain/archive.ts'
import { retarget } from '../domain/threads.ts'
import type { AnchorFields } from '../domain/threads.ts'
import type { WorkRef } from '../domain/work.ts'
import type { Media } from './types.ts'

export const SLUG = /^[a-z0-9][a-z0-9-]*$/
export const draftDir = (slug: string) => join(places.notes, slug)
export const draftFile = (slug: string) => join(places.notes, slug, 'index.md')
const outlineFile = (slug: string) => join(places.notes, slug, 'outline.yaml')
const feedbackFile = (slug: string) => join(places.notes, slug, 'feedback.yaml')
export const hasDraft = (slug: string | null | undefined): slug is string => !!slug && SLUG.test(slug) && existsSync(draftFile(slug))

/** 段落の書き出し。指摘の位置を付け直すときの目印にする。空白を除いた先頭 20 字 */
export const headOf = (text: string) => text.replace(/\s+/g, '').slice(0, 20)

const kindOf = (text: string): BlockKind =>
  /^#{1,6} /.test(text) ? 'heading' : /^(!\[|\[!\[)/.test(text) ? 'image' : /^```/.test(text) ? 'code' : /^https?:\/\/\S+$/.test(text) ? 'embed' : /^> /.test(text) ? 'quote' : /^([-*+] |\d+\. )/.test(text) ? 'list' : /^<!--/.test(text) ? 'comment' : 'prose'

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
    return { n: i + 1, kind: kindOf(text), text, head: headOf(text), start: b.start, end: b.end }
  })
}

/** 原稿を読む。front matter は YAML として読み、本文は段落に分ける */
function parseDraft(md: string) {
  const { fm, body } = splitFrontMatter(md) as { fm: string | null; body: string }
  let meta: Record<string, any> = {}
  try {
    meta = fm ? (YAML.parse(fm) ?? {}) : {}
  } catch {}
  return { meta, fm, body, offset: md.length - body.length, blocks: splitBlocks(body) }
}

/** lint の検査結果を、本文の抜粋 (at) を含む段落に寄せる。寄せられないものは記事全体 (n: null) */
function lintBlocks(md: string, blocks: Block[]): Finding[] {
  // lint は段落の Markdown のリンクを外して比べるので、こちらも同じ形にそろえてから探す
  const plain = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<([^>\s]+)>/g, '$1').replace(/\\(.)/g, '$1')
  const texts = blocks.map((b) => plain(b.text))
  return lintDraft(md).map((f: any) => {
    const i = f.at ? texts.findIndex((t) => t.includes(f.at) || t.replace(/^#{1,6} /, '').includes(f.at)) : -1
    return { severity: f.severity, id: f.id, message: f.message, n: i >= 0 ? blocks[i].n : null }
  })
}

// ---------------------------------------------------------------- 構成 (outline.yaml)

/** 地の文として数える段落。見出し・画像・埋め込み・コード・コメントは数えない (lint の proseBlocks とそろえる) */
const PROSE = new Set(['prose', 'quote', 'list'])
const visible = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s/g, '').length

/** 原稿を見出し (##) で区切り、区切りごとの地の文の字数を数える。先頭は「冒頭」 */
function sectionChars(blocks: Block[]): SectionChars[] {
  const out: SectionChars[] = [{ title: '冒頭', n: null, chars: 0 }]
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

/** 構成を読む。無ければ空。先頭が「冒頭」でなければ足す */
function readOutline(slug: string) {
  const { text, version } = readVersioned(outlineFile(slug))
  let raw: any[] = []
  try {
    raw = text ? (YAML.parse(text)?.sections ?? []) : []
  } catch {}
  const sections: Section[] = raw.map((x) => ({ title: String(x.title ?? ''), point: String(x.point ?? ''), grain: x.grain === '密' ? '密' : '粗', budget: Number(x.budget) || 0 }))
  if (sections.length && sections[0].title !== '冒頭') sections.unshift({ title: '冒頭', point: '', grain: '粗', budget: 0 })
  return { exists: text !== null, sections, version }
}

// ---------------------------------------------------------------- front matter と画像

/** front matter の項目を書き換える。null や空の配列を渡した項目は消す。本文には触らない */
function setMeta(slug: string, patch: Record<string, unknown>, base?: string) {
  rewrite(draftFile(slug), (md) => {
    const { meta, offset, fm } = parseDraft(md)
    if (base !== undefined && versionOf(fm ?? '') !== base) throw conflict()
    const next = { ...meta }
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k]
      else next[k] = v
    }
    return `---\n${yamlText(next)}---\n${md.slice(offset).replace(/^\n?/, '\n')}`
  })
}

function listAssets(slug: string) {
  const dir = join(draftDir(slug), 'assets')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .sort()
    .map((f) => `assets/${f}`)
}

// ---------------------------------------------------------------- 原稿を作る・改稿する

/** 原稿を作る。front matter には企画のタイトルを入れる。本文は空で始める */
export function createDraft(slug: string, title: string) {
  if (!SLUG.test(slug)) throw invalid('slug は半角の英小文字・数字・ハイフンで入力してください (例: line-api-expert-thanks)')
  if (existsSync(draftDir(slug))) throw invalid(`原稿「${slug}」はもうあります`)
  if (archiveOfSlug(slug)) throw invalid(`「${slug}」は公開済みの記事で使っています。別の slug にしてください`)
  mkdirSync(draftDir(slug), { recursive: true })
  writeText(draftFile(slug), `---\n${yamlText({ title: title || '無題' })}---\n\n`)
}

/**
 * 公開済みの記事を、原稿に写す (ADR-0047)。アーカイブの index.md と assets/ を <置き場>/notes/<slug>/ に写し、
 * front matter に revises を残す。アーカイブは読むだけで書き換えない。すでに同じ slug の原稿があれば、何もしない
 */
export function reviseFromArchive(name: string) {
  const slug = slugOfArchive(name)
  if (!SLUG.test(slug)) throw invalid(`「${name}」から slug を読めません`)
  if (hasDraft(slug)) return { slug, created: false }
  const from = archiveDir(name)
  mkdirSync(draftDir(slug), { recursive: true })
  if (existsSync(join(from, 'assets'))) cpSync(join(from, 'assets'), join(draftDir(slug), 'assets'), { recursive: true })
  writeText(draftFile(slug), readText(join(from, 'index.md'))!)
  setMeta(slug, { revises: name })
  return { slug, created: true }
}

/**
 * 指摘の位置を付け直す関数を作る (ADR-0046)。番号の段落の書き出しが同じならそのまま。
 * 違えば、同じ書き出しの段落を探す。見つからなければ、先頭 8 字が同じ段落。それも無ければ記事全体 ("*")
 */
function reanchor(blocks: Block[]) {
  return ({ para, head }: { para: number; head?: string }): { para: number | '*'; head?: string } => {
    if (blocks[para - 1]?.head === head) return { para, head }
    const hit = blocks.find((b) => b.head === head) ?? (head && head.length >= 8 ? blocks.find((b) => b.head.startsWith(head.slice(0, 8))) : null)
    return hit ? { para: hit.n, head: hit.head } : { para: '*' }
  }
}

// ---------------------------------------------------------------- 聴衆役

/** 記事のアンケート。発表の 8 項目と同じ意図を、記事の言葉に置き換える (design.md 5 章) */
const SURVEY: SurveyItem[] = [
  { key: 'got', group: '届いたか', label: '読みに来た目的を果たせた' },
  { key: 'trouble', group: '届いたか', label: '自分の悩みに触れていた' },
  { key: 'insight', group: '届いたか', label: '新しい見方を得た' },
  { key: 'follow', group: '分かったか', label: '最後まで迷わずに読めた' },
  { key: 'hook', group: '分かったか', label: '冒頭で読み進めたくなった' },
  { key: 'convinced', group: '動くか', label: '主張に納得した' },
  { key: 'action', group: '動くか', label: '読み終えて、やってみようと思うことがある' },
  { key: 'recommend', group: '総合', label: '同じ立場の人に勧めたい' },
]

/** 記事の本文を、段落の番号付きで書き出す。画像は説明だけ、コメントは渡さない */
function paragraphs(blocks: Block[]) {
  return blocks
    .filter((b) => b.kind !== 'comment')
    .map((b) => {
      const alt = b.text.match(/^\[?!\[([^\]]*)\]/)?.[1]
      if (b.kind === 'image') return `【${b.n}】[画像${alt ? `: ${alt}` : ''}]`
      if (b.kind === 'embed') return `【${b.n}】[埋め込み: ${b.text}]`
      return `【${b.n}】${b.text}`
    })
    .join('\n\n')
}

function readerPrompt(persona: any, why: string, title: string, blocks: Block[]) {
  const items = SURVEY.map((q, i) => `  ${i + 1}. ${q.key}: ${q.label}`).join('\n')
  const kinds = Object.entries(UNIT_KINDS)
    .map(([k, v]) => `${k} (${v})`)
    .join(' / ')
  return [
    'あなたは、次のプロフィールの人物として、note の記事を読みに来ています。SNS のタイムラインか note のおすすめで、この記事のタイトルを見つけて開きました。',
    '',
    `${persona.name}（${persona.label}）`,
    `どんな人か: ${persona.who}`,
    `悩み: ${persona.troubles}`,
    `知っていること・知らないこと: ${persona.knows}`,
    `引っかかりやすい点: ${persona.pushback}`,
    `書き手のことを: ${persona.knows_speaker ? '前から知っている' : '今日初めて知った'}`,
    why ? `なぜ読みに来たか: ${why}` : '',
    '',
    'これから、その記事の本文を渡します。【】の中の数字は段落の番号です。見出しも 1 つの段落として数えます。',
    'あなたはこの題材について、プロフィールに書いてある以上のことを知りません。知らないことを推測で補わないでください。',
    'スマートフォンで、上から 1 度だけ読むものとして扱ってください。退屈になったら、そこで読むのをやめてかまいません。やめた所も感想に書いてください。',
    'ファイルの読み書きや検索などの道具は使わず、下の内容だけを根拠に答えてください。',
    '',
    `タイトル: ${title}`,
    '',
    paragraphs(blocks),
    '',
    '読み終えたあとのアンケートに、この人物として正直に答えてください。遠慮や励ましは要りません。',
    '',
    '1) 次の 8 項目に、1 (まったく当てはまらない) 〜 5 (とても当てはまる) の点と、理由を 1 行で。',
    items,
    '2) message: この記事がいちばん伝えたかったことは何だと思ったかを、1 文で。',
    '3) wish: ここがこうなっていたらもっと良かった、を 1 つだけ。いちばん効くものを。',
    `4) notes: 段落へのピンポイントな感想を、大事な順に 12 件まで。para には【】の中の番号、kind には ${kinds} のどれかを入れます。記事全体への感想は para を 0 にします。良かった所も、あれば入れてください。`,
    '',
    '答えは次の JSON だけにしてください。前後に説明やコードブロックを付けないでください。',
    '{"scores":{"got":{"score":3,"reason":"…"},"trouble":{"score":3,"reason":"…"},"insight":{"score":3,"reason":"…"},"follow":{"score":3,"reason":"…"},"hook":{"score":3,"reason":"…"},"convinced":{"score":3,"reason":"…"},"action":{"score":3,"reason":"…"},"recommend":{"score":3,"reason":"…"}},"message":"…","wish":"…","notes":[{"para":1,"kind":"word","text":"…"}]}',
  ]
    .filter((l) => l !== '')
    .join('\n')
    .replace(/\n(タイトル:|これから、|読み終えたあと|1\) |答えは)/g, '\n\n$1')
}

// ---------------------------------------------------------------- 部品

const need = (ref: WorkRef): string => {
  if (!hasDraft(ref.draft)) throw invalid('原稿がありません。先に原稿を作ってください')
  return ref.draft
}
const read = (slug: string) => parseDraft(readText(draftFile(slug)) ?? '')

const THREADS_HEAD = [
  '# 指摘のスレッド (ADR-0040・ADR-0046)。記事の原稿への指摘と、その往復を 1 本にまとめる。studio の画面が読み書きし、Claude Code も直接直す。',
  '#   para: 段落の番号 (本文の頭から 1 始まり。見出し・画像も 1 つと数える)。記事全体への指摘は "*"',
  '#   head: 段落の書き出し (空白を除いた先頭 20 字)。本文を直して番号がずれたら、これで付け直す',
  '#   by・replies・ball・closed は発表と同じ',
  '',
].join('\n')

export const note: Media = {
  kind: 'note',
  words: { work: 'note の記事', oneLiner: '芯', audience: '読者' },
  threadsHeader: THREADS_HEAD,
  readersHeader: '# 聴衆役の読み手 (ADR-0039・ADR-0046)。persona は personas/ の id。why は、なぜこの記事を読みに来たか\n',
  survey: SURVEY,

  home: (ref) => (hasDraft(ref.draft) ? draftDir(ref.draft) : null),
  watchDirs: (ref) => (hasDraft(ref.draft) ? [draftDir(ref.draft)] : []),

  async body(ref) {
    if (!hasDraft(ref.draft)) return null
    const slug = ref.draft
    const { text, version } = readVersioned(draftFile(slug))
    const md = text ?? ''
    const { meta, fm, blocks } = parseDraft(md)
    const view: NoteBody = {
      kind: 'note',
      slug,
      dir: shownDir(draftDir(slug)),
      file: shownDir(draftFile(slug)),
      title: String(meta.title ?? ''),
      tags: meta.hashtags ?? [],
      eyecatch: meta.eyecatch ?? null,
      revises: meta.revises ?? null,
      blocks: blocks.map(({ n, kind, text, head }) => ({ n, kind, text, head })),
      lint: lintBlocks(md, blocks),
      stats: draftStats(md),
      sections: sectionChars(blocks),
      assets: listAssets(slug),
      outline: readOutline(slug),
      version,
      metaVersion: versionOf(fm ?? ''),
    }
    return view
  },
  bodyTitle: (ref) => (hasDraft(ref.draft) ? String(read(ref.draft).meta.title ?? '') : (ref.archive?.title ?? null)),
  oneLinerFromBody: () => '',

  async setTitle(ref, { orig, title }) {
    if (!hasDraft(ref.draft)) return false
    const cur = String(read(ref.draft).meta.title ?? '')
    if (cur !== orig) throw conflict('タイトルが、ほかで変更されています', cur)
    setMeta(ref.draft, { title })
    return true
  },

  editUnit(ref, unit, { orig, text }) {
    const slug = need(ref)
    const n = Number(unit)
    if (!Number.isInteger(n) || n < 1) throw invalid(`段落「${unit}」はありません`)
    let after: Span[] = []
    rewrite(draftFile(slug), (md) => {
      const { offset, body, blocks } = parseDraft(md)
      const b = blocks[n - 1]
      // 画面が読んだときの段落と違えば保存しない (Claude Code が同時に直したときに上書きしないため)
      if (!b || b.text !== orig) throw conflict('この段落は、ほかで変更されています。画面を読み込み直してから直してください')
      const next = String(text ?? '').replace(/\s+$/, '').replace(/^\n+/, '')
      // 消すときは、後ろの空行もまとめて詰める
      const tail = next ? b.end : body.slice(b.end).match(/^\n*/)![0].length + b.end
      const newBody = body.slice(0, b.start) + next + body.slice(tail)
      after = splitBlocks(newBody)
      return md.slice(0, offset) + newBody
    })
    // 直した段落の指摘は、新しい書き出しで持ち直す。消したら記事全体へ。ほかは書き出しで付け直す
    const gone = !String(text ?? '').trim()
    const rest = reanchor(after)
    retarget(feedbackFile(slug), THREADS_HEAD, (t) => (t.para === n ? (gone || !after[t.para - 1] ? { para: '*' } : { para: t.para, head: after[t.para - 1].head }) : rest(t)))
  },

  appendUnit(ref, text) {
    const slug = need(ref)
    const t = String(text ?? '').trim()
    if (!t) throw invalid('段落の文が要ります')
    rewrite(draftFile(slug), (md) => `${md.replace(/\s*$/, '')}\n\n${t}\n`)
  },

  editOutline(ref, op) {
    const slug = need(ref)
    if (op.op !== 'replace') throw invalid('記事の構成は、見出しの並びをまとめて直します')
    const clean = (op.sections ?? []).map((x, i) => ({
      title: i === 0 ? '冒頭' : String(x.title ?? '').trim(),
      point: String(x.point ?? '').trim(),
      grain: x.grain === '密' ? '密' : '粗',
      budget: Math.max(0, Math.round(Number(x.budget) || 0)),
    }))
    writeText(outlineFile(slug), OUTLINE_HEAD + yamlText({ sections: clean }), op.base)
  },

  editMeta(ref, { base, tags, eyecatch }) {
    const slug = need(ref)
    const patch: Record<string, unknown> = {}
    if (tags !== undefined) patch.hashtags = (tags ?? []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)
    if (eyecatch !== undefined) patch.eyecatch = eyecatch || null
    setMeta(slug, patch, base)
  },

  anchor(ref, at): AnchorFields {
    const slug = need(ref)
    if (!('para' in at)) throw invalid('記事の指摘の位置は、段落の番号 (para) で指します')
    if (at.para === '*') return { para: '*' }
    const b = read(slug).blocks[Number(at.para) - 1]
    if (!b) throw invalid(`段落 ${at.para} はありません`)
    return { para: b.n, head: b.head }
  },
  anchorOfNote: (n) => (n.para !== undefined ? { para: n.para, ...(n.head ? { head: n.head } : {}) } : { para: '*' }),

  beforeView(ref) {
    // Claude Code が本文を直して段落の番号がずれていたら、指摘を書き出しで付け直す
    if (hasDraft(ref.draft)) retarget(feedbackFile(ref.draft), THREADS_HEAD, reanchor(read(ref.draft).blocks))
  },

  readPlan(ref) {
    const slug = need(ref)
    const { meta, blocks } = read(slug)
    const title = String(meta.title ?? '')
    return {
      dir: draftDir(slug),
      survey: SURVEY,
      prompt: (persona, why) => readerPrompt(persona, why, title, blocks),
      notes: (raw) =>
        raw.map((n) => {
          const b = blocks.find((x) => x.n === Number(n.para))
          return { para: b ? b.n : '*', ...(b ? { head: b.head } : {}), kind: UNIT_KINDS[n.kind] ? n.kind : 'unconvinced', text: String(n.text ?? '') }
        }),
      meta: { paragraphs: blocks.length },
    }
  },

  draftForAsk: (ref) => (hasDraft(ref.draft) ? readText(draftFile(ref.draft)) : null),

  handoff(ref, threads) {
    const list = threads.filter((t) => t.ball === 'Claude')
    const own = list.filter((t) => t.by !== '聴衆役').length
    const dir = hasDraft(ref.draft) ? shownDir(draftDir(ref.draft)) : ''
    // 依頼文は短くし、直し方と feedback.yaml の書き方は skill の側に任せる (rebuild.md 5 章)
    return [
      `${dir}/feedback.yaml に、Claude の番の指摘が ${list.length} 件あります（話者から ${own} 件、聴衆役から ${list.length - own} 件）。原稿は ${dir}/index.md です。`,
      'writing-note skill の Phase 5（studio の指摘を受けて直す）に従って直してください。',
    ].join('\n')
  },

  trashItems: (ref) => (hasDraft(ref.draft) ? [{ from: draftDir(ref.draft), into: 'notes' }] : []),
  beforeTrash: async () => {},
  repoFiles: () => [],

  paste(ref): PasteText {
    return toPasteText(readText(draftFile(need(ref))))
  },
  openAssets(ref) {
    const slug = need(ref)
    reveal(join(draftDir(slug), existsSync(join(draftDir(slug), 'assets')) ? 'assets' : ''))
  },
  assetFile(ref, rel) {
    if (rel.includes('..')) return null
    if (hasDraft(ref.draft)) {
      const file = join(draftDir(ref.draft), rel)
      if (existsSync(file)) return file
    }
    return ref.archive ? archiveAsset(ref.archive.dir, rel) : null
  },

  summary(ref) {
    const draft = hasDraft(ref.draft)
      ? (() => {
          const md = readText(draftFile(ref.draft!)) ?? ''
          const { blocks } = parseDraft(md)
          const stats = draftStats(md)
          return { slug: ref.draft!, chars: stats.chars, paragraphs: stats.paragraphs, blocks: blocks.length, outline: readOutline(ref.draft!).sections.length }
        })()
      : null
    const a = ref.archive
    return {
      talk: null,
      draft,
      // eyecatch は assets/… の相対パス
      cover: a?.eyecatch ? `/api/works/${encodeURIComponent(ref.key)}/${a.eyecatch}` : null,
      date: a?.publishedAt ?? ref.brief?.fields?.date ?? null,
      event: ref.brief?.fields?.event ?? null,
      tags: a?.tags ?? [],
    }
  },
}

