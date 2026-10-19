// studio のホーム (ADR-0040・ADR-0043・ADR-0045)。ネタ帳と、発表と記事の一覧を並べ、新しく始める。
// 一覧は、企画シートのある作品と、企画シートの無い公開物 (note の記事・サイトに載る発表) を 1 つにまとめる。
// 状態は 進み具合 (下書き・完成) と公開範囲 (非公開・公開) の 2 つの軸。下書きは「次にやること」のカード、完成は表紙の絵のカードで見せる
import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, go, type HomeData, type Item, type Progress, type TalkItem, type Visibility, type WorkItem } from '@/lib/api'
import { KIND_LABEL, STAGES, stageStatus, type Kind } from '@/lib/stages'
import { CreateMenu } from './CreateMenu'
import { PROGRESS_OPTIONS, StateBadges, VISIBILITY_OPTIONS } from './status'

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const reload = () => api.home().then(setData)
  useEffect(() => {
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

  const start = async (kind: Kind, seedId?: string) => {
    const brief = await api.createWork(kind, seedId)
    go(`/works/${brief.id}`)
  }

  if (!data) return <div className="p-10 text-muted-foreground">読み込み中…</div>
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <div className="font-semibold">hokuchi studio</div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={data.siteUrl} target="_blank" rel="noreferrer">
                サイトを開く
              </a>
            </Button>
            <CreateMenu onPick={start} />
          </div>
        </div>
      </header>

      {/* ネタ → 下書き → 非公開・公開 の順に、上から下へ。一覧は公開した記事で長くなるので、ネタ帳を上に置く */}
      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-8">
        <Seeds data={data} onSaved={reload} onStart={start} />
        <Works items={data.items} />
        <p className="text-xs text-muted-foreground">企画シート・ネタ帳・非公開の発表は、公開リポジトリの外（{data.privateDir}）に保存しています。</p>
      </main>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">{children}</h2>
}

/** 発表の日まで、あと何日か */
const daysTo = (date: string | null) => (date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null)

/**
 * 下書きの作品 1 枚。いまどこにいて、次に何をするかを言う。
 * 公開済みの記事を改稿しているとき (ADR-0047) は、公開のバッジのまま下書きのカードで見せ、企画と構成は飛ばす
 */
function WorkCard({ work, visibility = 'private' }: { work: WorkItem; visibility?: Visibility }) {
  const revising = visibility === 'public'
  const next = STAGES.find((s) => !s.later && stageStatus(s, work) !== 'done')
  const t = work.talkInfo
  const days = daysTo(t?.date ?? (work.fields.date as string | undefined) ?? null)
  const d = work.draftInfo
  // 次にやること。企画が残っていれば企画、絵コンテがあれば、答える指摘 → 読んでもらう → コマを読む の順。
  // 記事は、原稿が無ければ原稿を作る、あれば答える指摘 → 原稿を読んで直す (ADR-0046)
  const at = (tab: string) => `/works/${work.id}#${tab}`
  const todo = next && !revising
    ? { text: `企画の「${next.title[work.kind]}」を書く`, href: at(next.key), label: '企画を開く' }
    : work.kind === 'note'
      ? !d
        ? { text: '原稿を作成する', href: at('draft'), label: '原稿を開く' }
        : d.outline === 0 && !revising
          ? { text: '構成（見出しの並びと、密にする場所）を決める', href: at('outline'), label: '構成を開く' }
          : d.blocks === 0
            ? { text: '本文を書く（Claude Code に下書きを頼む）', href: at('draft'), label: '原稿を開く' }
            : d.mine > 0
              ? { text: `あなた宛ての指摘が ${d.mine} 件`, href: at('reads'), label: '返信する' }
              : d.reads === 0
                ? { text: '聴衆役に読んでもらう', href: at('reads'), label: '読みを開く' }
                : { text: revising ? '直した記事で、note を更新する' : 'タイトル・タグ・見出し画像を決めて公開する', href: at('publish'), label: '公開を開く' }
    : !t
      ? { text: 'Claude Code に絵コンテを頼む', href: `/works/${work.id}`, label: '企画を開く' }
      : t.mine > 0
        ? { text: `あなた宛ての指摘が ${t.mine} 件`, href: `/works/${work.id}#reads`, label: '返信する' }
        : t.reads === 0
          ? { text: '聴衆役に読んでもらう', href: `/works/${work.id}#reads`, label: '読みを開く' }
          : { text: 'コマを読んで、話すことを直す', href: `/works/${work.id}#koma`, label: 'コマを開く' }
  const meta = [t?.event ?? (work.fields.event as string | undefined), t?.date, days === 0 ? '今日' : days !== null && days > 0 ? `あと ${days} 日` : null].filter(Boolean) as string[]
  return (
    <Card className="h-full gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[work.kind]}</Badge>
          <StateBadges progress="draft" visibility={visibility} />
          {/* 項目の途中で折り返さない (「あと / 12 日」のように割れないように) */}
          <span className="flex min-w-0 flex-wrap text-xs text-muted-foreground">
            {meta.length
              ? meta.map((s, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {i > 0 && '・'}
                    {s}
                  </span>
                ))
              : `${work.updatedAt.slice(0, 10)} 更新`}
          </span>
        </div>
        <CardTitle className="text-base">{work.title || '無題'}</CardTitle>
        <CardDescription className="line-clamp-2">{work.fields.oneLiner || '伝えたいことは未定'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {t && (
          <div className="text-xs text-muted-foreground">
            {t.scenes} シーン・{t.states} コマ・聴衆役の読み {t.reads} 回
          </div>
        )}
        {d && (
          <div className="text-xs text-muted-foreground">
            {d.chars.toLocaleString()} 字・{d.paragraphs} 段落
          </div>
        )}
        <div className="text-sm">
          <span className="mr-2 text-xs text-muted-foreground">次にやること</span>
          {todo.text}
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <a href={todo.href}>{todo.label}</a>
          </Button>
          {t && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/works/${work.id}#flow`}>流れを見る</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** 企画を持たない、作りかけの発表 */
function DraftTalkCard({ talk }: { talk: TalkItem }) {
  return (
    <Card className="h-full gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">発表</Badge>
          <StateBadges progress="draft" visibility="private" />
          <span className="text-xs text-muted-foreground">{[talk.event, talk.date].filter(Boolean).join('・')}</span>
        </div>
        <CardTitle className="text-base">{talk.title}</CardTitle>
        <CardDescription>
          {talk.scenes} シーン・{talk.states} コマ
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <Button size="sm" asChild>
          <a href={`/talks/${encodeURIComponent(talk.slug)}`}>コマを開く</a>
        </Button>
      </CardContent>
    </Card>
  )
}

/** ネタ帳。思いついたらすぐ書き、発表か記事にする */
function Seeds({ data, onSaved, onStart }: { data: HomeData; onSaved: () => void; onStart: (kind: Kind, seedId: string) => void }) {
  const [happening, setHappening] = useState('')
  const [why, setWhy] = useState('')
  const add = async () => {
    if (!happening.trim()) return
    await api.saveSeed({ happening: happening.trim(), why: why.trim() })
    setHappening('')
    setWhy('')
    onSaved()
  }
  // Enter で書き留める (Shift+Enter で改行。IME の確定の Enter は送らない)
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      add()
    }
  }
  // 毎日開く画面なので、書き留める欄は 1 行に収め、一覧を押し下げすぎないようにする
  return (
    <section>
      <SectionTitle>ネタ帳</SectionTitle>
      <Card className="gap-2 py-3">
        <CardContent className="grid gap-2 px-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Lightbulb className="size-4" /> ネタをメモする
            </span>
            <span className="text-xs text-muted-foreground">なぜそう感じたかも書くと、あとで発表や記事にしやすくなります。</span>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto] md:items-start">
            <Textarea value={happening} onChange={(e) => setHappening(e.target.value)} onKeyDown={onKey} placeholder="気になったこと" rows={1} className="min-h-9" />
            <Input value={why} onChange={(e) => setWhy(e.target.value)} onKeyDown={onKey} placeholder="なぜそう感じたか（任意）" />
            <Button onClick={add} disabled={!happening.trim()}>
              <Plus /> 追加
            </Button>
          </div>
        </CardContent>
      </Card>
      {data.seeds.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.seeds.map((s) => (
            <Card key={s.id} className="gap-2 py-3">
              <CardContent className="grid gap-2 px-4">
                <div className="text-sm whitespace-pre-wrap">{s.happening}</div>
                {s.why && <div className="text-xs text-muted-foreground">なぜ: {s.why}</div>}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{s.createdAt.slice(0, 10)}</span>
                  {(s.workIds?.length ?? 0) > 0 && <Badge variant="outline">作品 {s.workIds!.length} 本</Badge>}
                  <div className="ml-auto flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => onStart('talk', s.id)}>
                      発表にする
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => onStart('note', s.id)}>
                      記事にする
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

const KIND_FILTERS: { value: 'all' | Kind; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'talk', label: '発表' },
  { value: 'note', label: '記事' },
]
type Filter = { kind: 'all' | Kind; progress: 'all' | Progress; visibility: 'all' | Visibility }

/**
 * 発表と記事の一覧。種類・進み具合・公開範囲で絞り込み、タイトル・タグ・イベントで探せる。
 * 並びはサーバが決める (下書きが上、そのあとは日付の新しい順)
 */
function Works({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<Filter>({ kind: 'all', progress: 'all', visibility: 'all' })
  const [q, setQ] = useState('')
  const hit = (i: Item) => !q || i.title.includes(q) || (i.event ?? '').includes(q) || i.tags.some((t: string) => t.includes(q))
  const fits = (i: Item, f: Filter) => (f.kind === 'all' || i.kind === f.kind) && (f.progress === 'all' || i.progress === f.progress) && (f.visibility === 'all' || i.visibility === f.visibility)
  const shown = useMemo(() => items.filter((i: Item) => hit(i) && fits(i, filter)), [items, q, filter])
  // 絞り込みの数は、ほかの絞り込みと検索を効かせたうえで、その値を選んだときの数にする
  const count = (change: Partial<Filter>) => items.filter((i: Item) => hit(i) && fits(i, { ...filter, ...change })).length
  const set = (change: Partial<Filter>) => setFilter((f: Filter) => ({ ...f, ...change }))
  return (
    <section>
      <SectionTitle>発表と記事</SectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs value={filter.kind} onValueChange={(v: string) => set({ kind: v as 'all' | Kind })}>
          <TabsList>
            {KIND_FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label} ({count({ kind: f.value })})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={filter.progress} onValueChange={(v: string) => set({ progress: v as 'all' | Progress })}>
          <TabsList>
            {PROGRESS_OPTIONS.map((o) => (
              <TabsTrigger key={o.value} value={o.value}>
                {o.label} ({count({ progress: o.value })})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={filter.visibility} onValueChange={(v: string) => set({ visibility: v as 'all' | Visibility })}>
          <TabsList>
            {VISIBILITY_OPTIONS.map((o) => (
              <TabsTrigger key={o.value} value={o.value}>
                {o.label} ({count({ visibility: o.value })})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-64">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="タイトル・タグ・イベントで検索" className="pl-8" />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{items.length === 0 ? 'まだ発表も記事もありません。右上の「作成」か、ネタ帳から始めましょう。' : '条件に合う作品はありません。'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((i: Item) =>
            i.progress === 'draft' && i.work ? <WorkCard key={i.key} work={i.work} visibility={i.visibility} /> : i.progress === 'draft' && i.talk ? <DraftTalkCard key={i.key} talk={i.talk} /> : <CoverCard key={i.key} item={i} />,
          )}
        </div>
      )}
    </section>
  )
}

/** 完成した作品の 1 枚。表紙の絵 (発表は表紙のスライド、記事は見出し画像) を出す */
function CoverCard({ item }: { item: Item }) {
  const { work, talk, note } = item
  // 発表は作品の画面 (無ければトークの画面)、公開した記事は読む画面、記事の作品は企画の画面を開く
  const href = item.kind === 'talk' ? (work ? `/works/${work.id}` : `/talks/${encodeURIComponent(talk!.slug)}`) : note ? `/notes/${encodeURIComponent(note.dir)}` : `/works/${work!.id}`
  const image = talk ? `${talk.siteUrl}og.png` : note?.eyecatch
  return (
    <a href={href} className="block">
      <Card className="h-full gap-2 overflow-hidden py-0 transition-colors hover:border-foreground/30">
        {image ? <img src={image} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-muted" />}
        <div className="grid gap-1.5 px-3 pb-3">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">{KIND_LABEL[item.kind]}</Badge>
            <StateBadges progress={item.progress} visibility={item.visibility} />
            <span className="truncate text-xs text-muted-foreground">{[item.date, item.event].filter(Boolean).join('・')}</span>
          </div>
          <div className="line-clamp-2 text-sm font-medium">{item.title || '無題'}</div>
          <div className="text-xs text-muted-foreground">{talk ? `${talk.scenes} シーン・${talk.states} コマ` : note ? `${note.chars.toLocaleString()} 字` : ''}</div>
        </div>
      </Card>
    </a>
  )
}
