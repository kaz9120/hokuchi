// 原稿の面 (ADR-0046)。記事の本文を上から読み、段落ごとにその場で直し、指摘を書く。
// 発表のコマの面と同じ並びにする。真ん中に段落、右の余白にその段落への検査と指摘。見出しの目次は、レールの「原稿」の子に出す。
// いちばん上の帯は記事全体で、段落に寄せられない検査と、記事全体への指摘を置く (docs/design.md の「原稿」)
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { setReading } from '../lib/router'
import { BarSummary } from '../work/FaceBar'
import { draftApi, headingLevel, tocOf, type Block, type Draft, type DraftApi, type Finding } from '../lib/note'
import type { Thread } from '../lib/talk'
import { Margin } from '../talk/Koma'

const PLACEHOLDER = '表現でも中身でも、気になったことを自由に入力'

export function DraftView({ data, focus, seq }: { data: Draft; focus: string | null; seq: number }) {
  const api = useMemo(() => draftApi(data.key), [data.key])
  const scroller = useRef<HTMLDivElement>(null)
  const byPara = useMemo(() => {
    const m = new Map<number | '*', Thread[]>()
    for (const t of data.threads) {
      const k = t.para ?? '*'
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [data.threads])
  const lintBy = useMemo(() => {
    const m = new Map<number | null, Finding[]>()
    for (const f of data.lint) m.set(f.n, [...(m.get(f.n) ?? []), f])
    return m
  }, [data.lint])
  const toc = useMemo(() => tocOf(data), [data])

  // レールで見出しを選んだら (URL の場所が変わったら)、その段落へ。最初の 1 回は飛ばずに動かす
  const moved = useRef(false)
  useEffect(() => {
    if (focus === null) return
    const smooth = moved.current
    moved.current = true
    const n = Number(focus) || 0
    const t = setTimeout(() => document.getElementById(n ? `para-${n}` : 'draft-top')?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }), smooth ? 0 : 150)
    return () => clearTimeout(t)
  }, [focus, seq])

  // いま読んでいる見出しを、レールの目次と URL に映す。画面の上から 1/4 の線を越えた最後の段落を、読んでいる段落とする
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const line = root.getBoundingClientRect().top + root.clientHeight / 4
        let n = 0
        root.querySelectorAll<HTMLElement>('[id^="para-"]').forEach((el) => {
          if (el.getBoundingClientRect().top <= line) n = Number(el.id.replace('para-', ''))
        })
        setReading('draft', String([...toc].reverse().find((h) => h.n <= n)?.n ?? 0))
      })
    }
    root.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('scroll', update)
    }
  }, [toc])

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pr-6 pb-40 pl-12">
      <div className="mx-auto max-w-[1180px]">
        <section id="draft-top" className="grid scroll-mt-2 grid-cols-[minmax(0,1fr)_300px] gap-6 border-b py-6 min-[1400px]:grid-cols-[minmax(0,1fr)_340px] min-[1400px]:gap-8">
          <div>
            <BarSummary>
              <span>
                {data.stats.chars.toLocaleString()} 字・{data.stats.paragraphs} 段落・文の長さの中央値 {data.stats.medianSentence} 字
              </span>
              {data.tags.length > 0 && <span>{data.tags.map((t) => `#${t}`).join(' ')}</span>}
            </BarSummary>
            <h1 className="text-2xl font-semibold leading-snug">{data.title || '無題'}</h1>
          </div>
          <div className="grid content-start gap-3">
            <Checks findings={lintBy.get(null) ?? []} title="記事全体の検査" />
            <Margin threads={byPara.get('*') ?? []} api={api} kinds={data.noteKinds} label="記事全体に指摘を追加" placeholder={PLACEHOLDER} onSend={(text) => api.open('*', text)} />
          </div>
        </section>

        {data.blocks.length === 0 && <p className="py-8 text-muted-foreground">本文はまだありません。下の欄から書き始めるか、Claude Code に下書きを頼んでください。</p>}

        {data.blocks.map((b) => (
          <Row key={b.n} block={b} api={api} kinds={data.noteKinds} findings={lintBy.get(b.n) ?? []} threads={byPara.get(b.n) ?? []} />
        ))}

        <AddParagraph api={api} open={data.blocks.length === 0} />
      </div>
    </div>
  )
}

/** 段落 1 つ。真ん中に本文 (その場で直せる)、右の余白に検査と指摘 */
function Row({ block, api, kinds, findings, threads }: { block: Block; api: DraftApi; kinds: Record<string, string>; findings: Finding[]; threads: Thread[] }) {
  // 見出しは「## 」を外して見せ、保存のときに付け直す
  const prefix = block.kind === 'heading' ? block.text.match(/^#{1,6}\s+/)![0] : ''
  const shown = block.text.slice(prefix.length)
  const [text, setText] = useState(shown)
  // ほかで直されたら (Claude Code・409 で読み直したとき)、欄も読み直す
  useEffect(() => setText(shown), [block.text])
  const dirty = text !== shown
  // 失敗したときは、works.ts が読み直して知らせる
  const save = async () => {
    if (!dirty) return
    const mine = text
    // 保存できなかったら (409 など)、読み直した段落の上に、書いた文を未保存のまま残す
    if ((await api.saveBlock(block.n, block.text, mine.trim() ? prefix + mine : '')) === undefined) setTimeout(() => setText(mine), 0)
  }
  const level = headingLevel(block)
  return (
    <section id={`para-${block.n}`} className={cn('group grid scroll-mt-2 grid-cols-[minmax(0,1fr)_300px] gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_340px] min-[1400px]:gap-8', block.kind === 'heading' ? 'pt-8 pb-2' : 'py-2')}>
      <div className="relative min-w-0">
        <span className="absolute top-2 -left-7 w-5 text-right text-[11px] text-muted-foreground/50 tabular-nums" title={`段落 ${block.n}`}>
          {block.n}
        </span>
        {block.kind === 'image' && <ImagePreview block={block} api={api} />}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          spellCheck={false}
          className={cn(
            'field-sizing-content w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 outline-none hover:border-border focus:border-ring focus:bg-background',
            block.kind === 'heading' ? (level <= 2 ? 'text-xl font-semibold' : 'text-lg font-semibold') : 'text-[16px] leading-[1.9]',
            (block.kind === 'code' || block.kind === 'image' || block.kind === 'comment') && 'font-mono text-[13px] leading-relaxed text-muted-foreground',
            block.kind === 'embed' && 'text-sm text-sky-700',
            block.kind === 'quote' && 'border-l-muted-foreground/30 text-muted-foreground',
          )}
        />
        {dirty && <div className="px-2 text-xs text-muted-foreground">未保存です。欄の外を押すと保存します（空にすると段落を削除します）</div>}
      </div>
      <div className="grid content-start gap-2">
        {findings.length > 0 && <Checks findings={findings} />}
        <Margin threads={threads} api={api} kinds={kinds} label="段落に指摘を追加" placeholder={PLACEHOLDER} onSend={(t) => api.open(block.n, t)} />
      </div>
    </section>
  )
}

/** 画像の段落は、元の Markdown の上に絵を出す */
function ImagePreview({ block, api }: { block: Block; api: DraftApi }) {
  const src = block.text.match(/\]\(([^)\s]+)/)?.[1]
  if (!src) return null
  return <img src={/^https?:/.test(src) ? src : api.asset(src)} alt="" className="mb-1 ml-2 max-h-72 rounded-md border" />
}

const SEVERITY = {
  error: { label: '要修正', tone: 'bg-red-500' },
  warn: { label: '注意', tone: 'bg-amber-500' },
  info: { label: '参考', tone: 'bg-slate-400' },
}

/** lint の検査結果。人の指摘とは混ぜず、直せば消える目印として出す */
function Checks({ findings, title }: { findings: Finding[]; title?: string }) {
  if (findings.length === 0) return title ? <p className="text-xs text-muted-foreground">{title}: 問題はありません</p> : null
  return (
    <div className="grid gap-1 rounded-md bg-muted/60 px-2.5 py-2 text-xs leading-relaxed">
      {title && <div className="font-medium text-muted-foreground">{title}</div>}
      {findings.map((f, i) => (
        <div key={i} className="flex gap-2" title={f.id}>
          <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', SEVERITY[f.severity].tone)} />
          <span>
            <span className="mr-1.5 text-muted-foreground">{SEVERITY[f.severity].label}</span>
            {f.message}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 本文の末尾に段落を足す。Ctrl+Enter (Mac は ⌘+Enter) でも追加できる */
function AddParagraph({ api, open: initial }: { api: DraftApi; open: boolean }) {
  const [open, setOpen] = useState(initial)
  const [text, setText] = useState('')
  const add = async () => {
    if (!text.trim()) return
    await api.append(text)
    setText('')
  }
  if (!open)
    return (
      <Button variant="ghost" size="sm" className="mt-6 text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus /> 段落を追加
      </Button>
    )
  return (
    <div className="mt-6 grid max-w-[calc(100%-324px)] gap-2 min-[1400px]:max-w-[calc(100%-372px)]">
      <textarea
        autoFocus
        value={text}
        rows={3}
        placeholder="本文を入力（空行を入れると段落が分かれます）"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            add()
          }
        }}
        className="field-sizing-content min-h-20 w-full resize-none rounded-md border bg-background px-3 py-2 text-[16px] leading-[1.9] outline-none focus:border-ring"
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button size="sm" disabled={!text.trim()} onClick={add}>
          追加
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          閉じる
        </Button>
        <span>⌘+Enter でも追加できます</span>
      </div>
    </div>
  )
}

/** 原稿がまだ無い記事。slug を決めて原稿を作る。タイトルは企画から入れる */
export function CreateDraft({ title, onCreate }: { title: string; onCreate: (slug: string) => Promise<void> }) {
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ok = /^[a-z0-9][a-z0-9-]*$/.test(slug)
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await onCreate(slug)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto grid max-w-xl gap-5 rounded-lg border bg-background p-6">
        <div>
          <h2 className="text-lg font-semibold">原稿を作成</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">原稿は公開リポジトリの外に保存します。段落ごとに読んで直し、指摘を書けるようになります。</p>
        </div>
        <div className="grid gap-1.5">
          <div className="text-sm font-medium">タイトル</div>
          <div className="text-sm">{title || '無題'}</div>
          <div className="text-xs text-muted-foreground">企画のタイトルを、原稿のタイトルに入れます。</div>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="slug" className="text-sm font-medium">
            slug
          </label>
          <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && ok && create()} placeholder="例: line-api-expert-thanks" className="font-mono" />
          <div className="text-xs text-muted-foreground">半角の英小文字・数字・ハイフンで入力します。原稿のフォルダ名と、公開後のアーカイブの名前になります。</div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="justify-self-start" disabled={!ok || busy} onClick={create}>
          原稿を作成
        </Button>
      </div>
    </div>
  )
}
