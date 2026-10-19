// studio のホーム (段 5。rebuild.md 6 章・棚卸しの 3.7。話者の決定: 「いま・積み上げ」)。
// 上が「いま」(下書き・完成・改稿中)、下が「積み上げ」(公開。月で区切る)。vision.md の「ネタ → … → 積み上げる」の両端を上下に置く。
// カードは 1 種類: 表紙 (無ければ伝えたいことを大きく) + 種類 + 状態 1 語 + タイトル + 1 行 (下書きは次にやること、公開済みは日付とイベント)。
// ネタは帯の 1 行で書き留め、一覧は「いま」の下に畳む。絞り込みは「すべて・発表・記事」と検索だけ
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ExternalLink, Lightbulb, Search } from 'lucide-react'
import type { HomeData, HomeItem, Kind, Seed } from '../shared/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { notify } from '@/lib/notice'
import { navigate, onLinkClick, workHref, type Face } from '@/lib/router'
import { KIND_LABEL, STAGES, stageStatus } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { CreateMenu } from './CreateMenu'
import { StateLabel } from './status'

const PLAN = STAGES.filter((s) => !s.later)

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const reload = () => api.home().then(setData)
  useEffect(() => {
    document.title = 'hokuchi studio'
    reload()
    // 置き場が変わったら (Claude Code が企画や原稿を直したときも) 読み直す
    let timer: number | undefined
    const es = new EventSource('/api/events?home=1')
    es.addEventListener('home', () => {
      clearTimeout(timer)
      timer = window.setTimeout(reload, 300)
    })
    return () => es.close()
  }, [])
  const start = async (kind: Kind, seedId?: string) => navigate(workHref(await api.createWork(kind, seedId)))

  // いま: 日が迫っている発表を先に (近い順)、次に作りかけを触った順、完成は最後
  const now = useMemo(() => {
    const list = data?.items.filter((i) => i.state.word !== '公開') ?? []
    const rank = (i: HomeItem) => {
      const d = i.kind === 'talk' ? daysTo(i.date) : null
      return i.state.word === '完成' ? 2 : d !== null && d >= 0 ? 0 : 1
    }
    return [...list].sort((x, y) => rank(x) - rank(y) || (rank(x) === 0 ? (daysTo(x.date) ?? 0) - (daysTo(y.date) ?? 0) : (y.updatedAt ?? '').localeCompare(x.updatedAt ?? '')))
  }, [data])
  const done = useMemo(() => data?.items.filter((i) => i.state.word === '公開') ?? [], [data])

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <div className="shrink-0 font-semibold">hokuchi studio</div>
          <SeedInput onSaved={reload} />
          <div className="flex shrink-0 items-center gap-2">
            {data && (
              <Button variant="ghost" size="sm" asChild>
                <a href={data.siteUrl} target="_blank" rel="noreferrer" title="公開しているスライドのサイト (slides.y-kaz.com) を開きます">
                  スライドのサイト <ExternalLink />
                </a>
              </Button>
            )}
            <CreateMenu onPick={start} />
          </div>
        </div>
      </header>

      {!data ? (
        <div className="p-10 text-muted-foreground">読み込み中…</div>
      ) : (
        <main className="mx-auto grid max-w-6xl gap-12 px-6 py-8">
          <section className="grid gap-4">
            <SectionHead title="いま" note={`${now.length} 本`} />
            {now.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">作っているものはありません。右上の「作成」か、ネタから始めます。</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {now.map((i) => (
                  <WorkCard key={i.key} item={i} />
                ))}
              </div>
            )}
            <Seeds seeds={data.seeds} onStart={start} />
          </section>
          <Stack items={done} />
        </main>
      )}
    </div>
  )
}

function SectionHead({ title, note, children }: { title: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <span className="text-sm text-muted-foreground tabular-nums">{note}</span>}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- ネタ

/** 帯の 1 行で、ネタを書き留める。Enter で追加 */
function SeedInput({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('')
  const add = async () => {
    const t = text.trim()
    if (!t) return
    await api.saveSeed({ happening: t })
    setText('')
    notify('ネタを書き留めました。「いま」の下にあるネタから、発表や記事を作成できます。')
    onSaved()
  }
  return (
    <div className="relative min-w-0 flex-1">
      <Lightbulb className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void add()}
        placeholder="気になったことを書き留める（Enter）"
        aria-label="ネタを書き留める"
        className="pl-8"
      />
    </div>
  )
}

/** ネタの一覧。「いま」の下に畳んでおく */
function Seeds({ seeds, onStart }: { seeds: Seed[]; onStart: (kind: Kind, seedId: string) => void }) {
  const [open, setOpen] = useState(false)
  if (seeds.length === 0) return null
  return (
    <div className="grid gap-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} /> ネタ {seeds.length} 件
      </button>
      {open && (
        <div className="grid animate-in gap-2 fade-in-0 sm:grid-cols-2 lg:grid-cols-3">
          {seeds.map((s) => (
            <div key={s.id} className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
              <p className="whitespace-pre-wrap">{s.happening}</p>
              {s.why && <p className="text-xs text-muted-foreground">なぜ: {s.why}</p>}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {s.createdAt.slice(0, 10)}
                  {(s.workIds?.length ?? 0) > 0 && `・作品 ${s.workIds!.length} 本`}
                </span>
                <Button size="xs" variant="ghost" className="ml-auto" onClick={() => onStart('talk', s.id)}>
                  発表にする
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onStart('note', s.id)}>
                  記事にする
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 積み上げ

const FILTERS: { value: 'all' | Kind; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'talk', label: '発表' },
  { value: 'note', label: '記事' },
]

/** 公開したもの。月で区切り、新しい月から並べる */
function Stack({ items }: { items: HomeItem[] }) {
  const [kind, setKind] = useState<'all' | Kind>('all')
  const [q, setQ] = useState('')
  const hit = (i: HomeItem) => !q || i.title.includes(q) || (i.event ?? '').includes(q) || i.tags.some((t) => t.includes(q))
  const shown = items.filter((i) => hit(i) && (kind === 'all' || i.kind === kind))
  const months = useMemo(() => {
    const m = new Map<string, HomeItem[]>()
    for (const i of shown) {
      const key = (i.date ?? i.updatedAt ?? '').slice(0, 7) || '日付なし'
      m.set(key, [...(m.get(key) ?? []), i])
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [shown])
  return (
    <section className="grid gap-4">
      <SectionHead title="積み上げ" note={`${items.length} 本`}>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex rounded-md bg-muted p-0.5">
            {FILTERS.map((f) => (
              <button key={f.value} role="tab" aria-selected={kind === f.value} onClick={() => setKind(f.value)} className={cn('rounded px-3 py-1 text-sm text-muted-foreground', kind === f.value && 'bg-background font-medium text-foreground shadow-sm')}>
                {f.label} <span className="tabular-nums">{items.filter((i) => hit(i) && (f.value === 'all' || i.kind === f.value)).length}</span>
              </button>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル・タグ・イベントで探す" className="pl-8" />
          </div>
        </div>
      </SectionHead>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{items.length ? '条件に合うものはありません。' : 'まだ公開したものはありません。'}</p>}
      {months.map(([month, list]) => (
        <div key={month} className="grid gap-3">
          <h3 className="flex items-baseline gap-2 border-b pb-1 text-sm font-medium">
            {/^\d{4}-\d{2}$/.test(month) ? `${month.slice(0, 4)}年${Number(month.slice(5))}月` : month}
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{list.length} 本</span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((i) => (
              <WorkCard key={i.key} item={i} compact />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------- カード

/** 発表の日まで、あと何日か */
const daysTo = (date: string | null) => (date && /^\d{4}-\d{2}-\d{2}/.test(date) ? Math.ceil((new Date(`${date.slice(0, 10)}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null)

/** 下書きの、次にやることと、その面。改稿中は企画と構成を飛ばす */
function nextOf(i: HomeItem): { text: string; face: Face; place?: string } {
  const revising = i.state.word === '改稿中'
  if (i.state.word === '完成') return { text: '公開の手順を確かめる', face: 'publish' }
  const stage = i.brief && !revising ? PLAN.find((s) => stageStatus(s, i.brief!) !== 'done') : undefined
  if (stage) return { text: `企画の「${stage.title[i.kind]}」を書く`, face: 'plan', place: stage.key }
  const { mine, reads } = i.counts
  if (i.kind === 'talk') {
    if (!i.talk) return { text: 'Claude Code に絵コンテを頼む', face: 'plan', place: 'oneLiner' }
    if (mine) return { text: `あなた宛ての指摘が ${mine} 件`, face: 'koma' }
    if (!reads) return { text: '聴衆役に読んでもらう', face: 'reads' }
    return { text: 'コマを読んで、話すことを直す', face: 'koma' }
  }
  const d = i.draft
  if (!d) return { text: '原稿を作る', face: 'draft' }
  if (!d.outline && !revising) return { text: '構成（見出しの並び）を決める', face: 'outline' }
  if (!d.blocks) return { text: 'Claude Code に下書きを頼む', face: 'plan', place: 'oneLiner' }
  if (mine) return { text: `あなた宛ての指摘が ${mine} 件`, face: 'draft' }
  if (!reads) return { text: '聴衆役に読んでもらう', face: 'reads' }
  return { text: revising ? '直した記事で、note を更新する' : 'タイトル・タグ・見出し画像を決めて公開する', face: 'publish' }
}

function WorkCard({ item: i, compact = false }: { item: HomeItem; compact?: boolean }) {
  const [broken, setBroken] = useState(false)
  const published = i.state.word === '公開'
  const next = published ? null : nextOf(i)
  const href = next ? workHref(i.key, next.face, next.place) : workHref(i.key)
  const days = i.kind === 'talk' && !published ? daysTo(i.date) : null
  const when = [i.date, i.event].filter(Boolean).join('・')
  const cover = i.cover && !broken ? i.cover : null
  return (
    <a href={href} onClick={(e) => onLinkClick(e, href)} className="group grid content-start overflow-hidden rounded-lg border bg-background transition-[border-color,box-shadow] hover:border-foreground/30 hover:shadow-sm">
      <div className="relative aspect-video overflow-hidden border-b bg-muted">
        {cover ? (
          <img src={cover} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          // 表紙の無いものは、伝えたいことを表紙の代わりに大きく出す
          <div className={cn('flex size-full items-center p-5', compact ? 'text-sm' : 'text-lg', 'leading-snug font-semibold text-foreground/80')}>
            <span className={cn(compact ? 'line-clamp-4' : 'line-clamp-4', !i.oneLiner && 'font-normal text-muted-foreground')}>{i.oneLiner || (published ? i.title : '伝えたいことは未定')}</span>
          </div>
        )}
      </div>
      <div className={cn('grid gap-1.5', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{KIND_LABEL[i.kind]}</span>
          {!published && <StateLabel state={i.state} />}
          {days !== null && <span className={cn('ml-auto whitespace-nowrap', days >= 0 && days <= 14 && 'font-medium text-foreground')}>{days > 0 ? `あと ${days} 日` : days === 0 ? '今日' : `${i.date} に発表`}</span>}
        </div>
        <div className={cn('line-clamp-2 font-medium', compact ? 'text-sm' : 'text-base')}>{i.title || '無題'}</div>
        {next ? (
          <div className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
            <span className="text-xs">次に:</span>
            <span className="truncate">{next.text}</span>
            <ChevronRight className="size-3.5 shrink-0" />
          </div>
        ) : (
          <div className="truncate text-xs text-muted-foreground">{when}</div>
        )}
      </div>
    </a>
  )
}
