// studio のホーム (ADR-0040)。作っているもの・ネタ帳・公開したものを並べ、新しく始める。
// 発表 1 本は、作品 1 枚で見せる。作っている途中の発表は、公開したものの側には出さない
import { useEffect, useMemo, useState } from 'react'
import { FileText, Lightbulb, Plus, Presentation, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, go, type HomeData, type TalkInfo, type TalkItem } from '@/lib/api'
import { KIND_LABEL, STAGES, stageStatus, type Brief, type Kind } from '@/lib/stages'

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const reload = () => api.home().then(setData)
  useEffect(() => {
    reload()
  }, [])

  const start = async (kind: Kind, seedId?: string) => {
    const brief = await api.createWork(kind, seedId)
    go(`/works/${brief.id}`)
  }

  if (!data) return <div className="p-10 text-muted-foreground">読み込み中…</div>
  // 作品に紐づいておらず、まだ公開していない発表。作っているものとして出す
  const drafts = data.talks.filter((t) => !t.public && !t.linked)
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <div>
            <div className="font-semibold">hokuchi studio</div>
            <div className="text-xs text-muted-foreground">発信の準備</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={data.siteUrl} target="_blank" rel="noreferrer">
                サイトを見る
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => start('talk')}>
              <Presentation /> 新しい発表
            </Button>
            <Button size="sm" onClick={() => start('note')}>
              <FileText /> 新しい記事
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-8">
        <section>
          <SectionTitle>作っているもの</SectionTitle>
          {data.works.length + drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだありません。右上の「新しい発表」「新しい記事」か、下のネタ帳から始められます。</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.works.map((w) => (
                <WorkCard key={w.id} work={w} />
              ))}
              {drafts.map((t) => (
                <DraftTalkCard key={t.slug} talk={t} />
              ))}
            </div>
          )}
        </section>

        <Seeds data={data} onSaved={reload} onStart={start} />

        <Published data={data} />

        <p className="text-xs text-muted-foreground">作品の企画シートとネタ帳は、公開リポジトリの外 ({data.privateDir}) に置いています。</p>
      </main>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground">{children}</h2>
}

/** 発表の日まで、あと何日か */
const daysTo = (date: string | null) => (date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null)

/** 作っているもの 1 枚。いまどこにいて、次に何をするかを言う */
function WorkCard({ work }: { work: Brief & { talkInfo?: TalkInfo } }) {
  const next = STAGES.find((s) => !s.later && stageStatus(s, work) !== 'done')
  const t = work.talkInfo
  const days = daysTo(t?.date ?? (work.fields.date as string | undefined) ?? null)
  // 次にやること。企画が残っていれば企画、絵コンテがあれば、答える指摘 → 読んでもらう → コマを読む の順
  const todo = next
    ? { text: `企画の「${next.title[work.kind]}」を書く`, href: `/works/${work.id}#${next.key}`, label: '企画を開く' }
    : !t
      ? { text: work.kind === 'talk' ? '絵コンテを、ターミナルの Claude Code に頼む' : '構成と本文は、これから画面を作ります', href: `/works/${work.id}`, label: '企画を開く' }
      : t.mine > 0
        ? { text: `あなたが答える指摘が ${t.mine} 件`, href: `/works/${work.id}#reads`, label: '指摘に答える' }
        : t.reads === 0
          ? { text: '聴衆役に読んでもらう', href: `/works/${work.id}#reads`, label: '読みを開く' }
          : { text: 'コマを読んで、話すことを直す', href: `/works/${work.id}#koma`, label: 'コマを開く' }
  return (
    <Card className="h-full gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[work.kind]}</Badge>
          <span className="text-xs text-muted-foreground">
            {[t?.event ?? (work.fields.event as string | undefined), t?.date, days !== null && days >= 0 ? `あと ${days} 日` : null].filter(Boolean).join('・') || `${work.updatedAt.slice(0, 10)} 更新`}
          </span>
        </div>
        <CardTitle className="text-base">{work.title || 'タイトル未定'}</CardTitle>
        <CardDescription className="line-clamp-2">{work.fields.oneLiner || '伝えたいことは、まだ決めていません'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {t && (
          <div className="text-xs text-muted-foreground">
            {t.scenes} 場面・{t.states} コマ・聴衆役の読み {t.reads} 回
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
          <span className="text-xs text-muted-foreground">{[talk.event, talk.date].filter(Boolean).join('・')}</span>
        </div>
        <CardTitle className="text-base">{talk.title}</CardTitle>
        <CardDescription>
          {talk.scenes} 場面・{talk.states} コマ
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
  return (
    <section>
      <SectionTitle>ネタ帳</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="size-4" /> ネタを書き留める
            </CardTitle>
            <CardDescription>思いついたらすぐ書き留めます。なぜそう感じたかまで書いておくと、あとで発表や記事にしやすくなります。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 px-4">
            <Textarea value={happening} onChange={(e) => setHappening(e.target.value)} placeholder="あったこと・引っかかったこと" rows={3} />
            <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="なぜそう感じたか (任意)" />
            <Button size="sm" onClick={add} disabled={!happening.trim()} className="justify-self-start">
              <Plus /> 書き留める
            </Button>
          </CardContent>
        </Card>
        <div className="grid content-start gap-2">
          {data.seeds.length === 0 && <p className="text-sm text-muted-foreground">まだありません。</p>}
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
      </div>
    </section>
  )
}

/** 公開したもの。発表と note の記事を切り替えて、検索できる。作っている途中の発表は出さない */
function Published({ data }: { data: HomeData }) {
  const [q, setQ] = useState('')
  const notes = useMemo(() => data.notes.filter((n) => !q || n.title.includes(q) || n.tags.some((t) => t.includes(q))), [data.notes, q])
  const talks = useMemo(() => data.talks.filter((t) => t.public && (!q || t.title.includes(q) || (t.event ?? '').includes(q))), [data.talks, q])
  return (
    <section>
      <SectionTitle>公開したもの</SectionTitle>
      <Tabs defaultValue="notes">
        <div className="flex items-center gap-3">
          <TabsList>
            <TabsTrigger value="notes">note ({data.notes.length})</TabsTrigger>
            <TabsTrigger value="talks">発表 ({data.talks.filter((t) => t.public).length})</TabsTrigger>
          </TabsList>
          <div className="relative ml-auto w-64">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル・タグで探す" className="pl-8" />
          </div>
        </div>
        <TabsContent value="notes" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {notes.map((n) => (
              <a key={n.dir} href={`/notes/${encodeURIComponent(n.dir)}`} className="block">
                <Card className="h-full gap-2 overflow-hidden py-0 transition-colors hover:border-foreground/30">
                  {n.eyecatch ? <img src={n.eyecatch} alt="" loading="lazy" className="aspect-[1280/670] w-full object-cover" /> : <div className="aspect-[1280/670] bg-muted" />}
                  <div className="grid gap-1 px-3 pb-3">
                    <div className="line-clamp-2 text-sm font-medium">{n.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {n.publishedAt} ・ {n.chars.toLocaleString()} 字
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="talks" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {talks.map((t) => (
              <a key={t.slug} href={`/talks/${encodeURIComponent(t.slug)}`} className="block">
                <Card className="h-full gap-2 overflow-hidden py-0 transition-colors hover:border-foreground/30">
                  <img src={`${t.siteUrl}og.png`} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                  <div className="grid gap-1 px-3 pb-3">
                    <div className="text-xs text-muted-foreground">{t.date}</div>
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.event ? `${t.event} ・ ` : ''}
                      {t.scenes} 場面・{t.states} コマ
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
