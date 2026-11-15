// 記事の「原稿」の面。段落ごとに読み、その場で直すか、段落を指して話す。
// lint の指摘は段落の横に、見出しごとの字数と目安は上に出す
import { TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Textarea, cn, toast } from 'takibi-design-system'
import type { Block, Finding, NoteView } from '../../shared/types'
import { api, fileUrl } from '../lib/api'
import type { WorkCtx } from '../pages/Work'
import { Advance, Frame, PointButton, Section } from './common'
import { Readers } from './Readers'

export function NoteDraft({ ctx }: { ctx: WorkCtx }) {
  const note = ctx.view.note
  if (!note) return null
  const errors = note.findings.filter((f) => f.level !== 'info').length
  return (
    <Frame
      ctx={ctx}
      title="原稿"
      lead={`伝えたいこと: ${ctx.view.work.decided.core ?? '未定'}`}
      footer={<Advance ctx={ctx} action="to-publish" label="公開の準備へ" disabled={!note.blocks.length} hint={note.blocks.length ? `${note.total}字${errors ? `・lint の指摘 ${errors}件` : ''}` : undefined} />}
    >
      <Wave note={note} />
      <Section title="本文" hint={note.blocks.length ? '段落を押すと直せます' : ctx.locked ? 'Claude が書いています。書けた段落から出ます' : 'まだ原稿はありません'}>
        <ol className="flex flex-col">
          {note.blocks.map((b) => (
            <Paragraph key={`${b.n}-${b.head}`} ctx={ctx} block={b} note={note} findings={note.findings.filter((f) => f.n === b.n)} />
          ))}
        </ol>
        {note.findings.some((f) => f.n === null) && (
          <ul className="flex flex-col gap-1 text-sm text-fg-muted">
            {note.findings
              .filter((f) => f.n === null)
              .map((f, i) => (
                <li key={i}>
                  <FindingBadge f={f} /> {f.message}
                </li>
              ))}
          </ul>
        )}
      </Section>
      <Readers ctx={ctx} />
    </Frame>
  )
}

/** 見出しごとの実際の字数と、構成の目安 */
function Wave({ note }: { note: NoteView }) {
  if (!note.chars.length || !note.blocks.length) return null
  const max = Math.max(...note.chars.map((c) => c.chars), ...note.outline.map((o) => o.budget), 1)
  return (
    <Section title="見出しごとの字数" hint="濃い棒が実際、枠が構成の目安">
      <ul className="flex flex-col gap-1.5">
        {note.chars.map((c, i) => {
          const o = note.outline.find((x) => x.title === c.title)
          const over = o && o.grain === '粗' && c.chars > Math.max(o.budget, 150)
          return (
            <li key={i} className="grid grid-cols-[minmax(0,12rem)_1fr_4rem] items-center gap-3 text-sm">
              <span className="truncate text-fg-muted">
                {c.title}
                {o?.grain === '密' && <span className="ml-1 text-brand">厚</span>}
              </span>
              <span className="relative h-3 rounded-sm bg-surface-sunken">
                {o && <span className="absolute inset-y-0 left-0 rounded-sm border border-line-strong" style={{ width: `${(o.budget / max) * 100}%` }} />}
                <span className={cn('absolute inset-y-0.5 left-0 rounded-sm', over ? 'bg-warning' : o?.grain === '密' ? 'bg-brand' : 'bg-fg-subtle')} style={{ width: `${(c.chars / max) * 100}%` }} />
              </span>
              <span className={cn('text-right tabular-nums', over ? 'text-warning' : 'text-fg-muted')}>{c.chars}字</span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function FindingBadge({ f }: { f: Finding }) {
  return <Badge variant={f.level === 'error' ? 'danger' : f.level === 'warn' ? 'warning' : 'neutral'}>{f.level === 'error' ? '直す' : f.level === 'warn' ? '注意' : '参考'}</Badge>
}

function Paragraph({ ctx, block: b, note, findings }: { ctx: WorkCtx; block: Block; note: NoteView; findings: Finding[] }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(b.text)
  useEffect(() => setText(b.text), [b.text])
  const label = b.kind === 'heading' ? `見出し「${b.text.replace(/^#+\s*/, '').slice(0, 20)}」` : `段落 ${b.n}`
  const save = async () => {
    if (text === b.text) return setEditing(false)
    try {
      ctx.set(await api.paragraph(ctx.id, b.n, text, note.version))
      setEditing(false)
    } catch (e) {
      // ほかで変わっていたら、打った文は残したまま知らせる。読み直してから貼り直せる
      toast.add({ title: String((e as Error).message), description: '打った文は欄に残しています。コピーしてから読み直してください', type: 'error' })
    }
  }
  return (
    <li className="group relative grid grid-cols-1 gap-2 border-b border-line-subtle py-3 last:border-0 md:grid-cols-[1fr_14rem]">
      <div className="min-w-0">
        {editing ? (
          <Textarea autoFocus rows={Math.max(2, Math.ceil(text.length / 40))} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Escape' && (setText(b.text), setEditing(false))} aria-label={`${label}を直す`} />
        ) : (
          <button type="button" disabled={ctx.locked} onClick={() => setEditing(true)} className="block w-full cursor-text rounded-md px-2 py-1 text-left hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent">
            <Rendered ctx={ctx} block={b} />
          </button>
        )}
      </div>
      <div className="flex flex-col items-start gap-1.5 text-sm">
        {findings.map((f, i) => (
          <p key={i} className="flex items-start gap-1.5 text-fg-muted">
            <FindingBadge f={f} />
            <span>{f.message}</span>
          </p>
        ))}
        <PointButton ctx={ctx} anchor={{ ref: `p${b.n}`, label, quote: b.text.replace(/\s+/g, ' ').slice(0, 30) }} className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100" />
      </div>
    </li>
  )
}

function Rendered({ ctx, block: b }: { ctx: WorkCtx; block: Block }) {
  if (b.kind === 'heading') return <span className="text-xl font-semibold text-fg-strong">{b.text.replace(/^#+\s*/, '')}</span>
  if (b.kind === 'image') {
    const src = b.text.match(/\]\(([^)\s]+)/)?.[1]
    const cap = b.text.split('\n')[1]?.replace(/^\*|\*$/g, '')
    return (
      <span className="flex flex-col gap-1">
        {src && <img src={src.startsWith('http') ? src : fileUrl(ctx.id, src)} alt="" className="max-h-72 w-auto self-start rounded-md border border-line-subtle" />}
        {cap && <span className="text-sm text-fg-muted">{cap}</span>}
      </span>
    )
  }
  if (b.kind === 'embed') return <span className="text-sm text-info underline">{b.text}</span>
  if (b.kind === 'comment') return <span className="text-sm text-fg-subtle">{b.text}</span>
  return (
    <span className="whitespace-pre-wrap text-base leading-8 text-fg">
      {b.text}
      {b.chars > 120 && (
        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-warning">
          <TriangleAlert className="size-3" aria-hidden />
          {b.chars}字
        </span>
      )}
    </span>
  )
}
