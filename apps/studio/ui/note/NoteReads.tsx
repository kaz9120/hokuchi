// 記事の読みの面 (ADR-0046)。発表の読みの面と同じ骨組みで、聴衆役に原稿を「note の記事」として読んでもらう。
// 上がアンケート、下があなた宛ての指摘の一覧。読み手は personas/ のプリセットから選ぶ (<原稿>/readers.yaml)
import { useMemo, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { draftApi, draftHandoffText, placeOf, type Draft } from '../lib/note'
import { forClaude, mine, type Reading, type Thread } from '../lib/talk'
import { Survey } from '../talk/Reads'
import { ThreadCard } from '../talk/Threads'
import { HandoffButton } from '../talk/Handoff'

const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function NoteReadsView({ data, reading, onJump }: { data: Draft; reading: Reading | null; onJump: (n: number | null) => void }) {
  const api = useMemo(() => draftApi(data.slug), [data.slug])
  const [picked, setPicked] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const read = data.reads.find((r) => r.id === picked) ?? data.reads.at(-1) ?? null
  const prev = read ? (data.reads.filter((r) => r.id < read.id).at(-1) ?? null) : null
  const yours = data.threads.filter(mine)
  const claude = data.threads.filter(forClaude)
  const finished = data.threads.filter((t) => t.ball === 'none' && t.closed !== '良かった点')
  const [showDone, setShowDone] = useState(false)
  const order = (list: Thread[]) => [...list].sort((a, b) => (a.para === '*' ? 0 : (a.para ?? 0)) - (b.para === '*' ? 0 : (b.para ?? 0)))
  const jump = (t: Thread) => onJump(typeof t.para === 'number' ? t.para : null)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto grid max-w-[1400px] gap-8 py-5">
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">聴衆役の読み</h2>
            <span className="text-sm text-muted-foreground">AI が演じる読み手 {data.readers.length} 人が、note で見つけた記事として原稿を読んだ結果です。</span>
            <div className="ml-auto flex items-center gap-2">
              {data.reads.length > 1 &&
                data.reads.map((r) => (
                  <Button key={r.id} size="xs" variant={r.id === read?.id ? 'default' : 'outline'} onClick={() => setPicked(r.id)}>
                    {r.id} 回目・{when(r.at)}
                  </Button>
                ))}
              {yours.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => document.getElementById('yours')?.scrollIntoView({ behavior: 'smooth' })}>
                  あなた宛て {yours.length} 件へ ↓
                </Button>
              )}
              <Button size="sm" disabled={!!reading || data.readers.length === 0} onClick={() => api.read()} title="いまの原稿を、まっさらな読み手に読んでもらいます。数分かかります">
                {reading ? <Loader2 className="animate-spin" /> : <Users />}
                {reading ? `読んでもらっています… ${reading.done} / ${reading.total} 人` : read ? 'もう一度読んでもらう' : '読んでもらう'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">読み手</span>
            {data.readers.map((p) => (
              <span key={p.id} className="rounded-full border bg-background px-2.5 py-0.5" title={p.who}>
                {p.name}（{p.label}）
              </span>
            ))}
            {data.readers.length === 0 && <span className="text-muted-foreground">まだ選んでいません</span>}
            <Button size="xs" variant="ghost" onClick={() => setChoosing((v) => !v)}>
              {choosing ? '閉じる' : data.readers.length ? '読み手を変更' : '読み手を選ぶ'}
            </Button>
          </div>
          {(choosing || data.readers.length === 0) && <ChooseReaders data={data} onSave={async (ids) => {
            await api.saveReaders(ids.map((persona) => ({ persona, why: data.readers.find((r) => r.id === persona)?.why })))
            setChoosing(false)
          }} />}

          {reading?.error && <p className="text-sm text-destructive">{reading.error}</p>}
          {read ? (
            <Survey survey={data.survey} oneLiner={data.work?.oneLiner ?? ''} read={read} prev={prev} />
          ) : (
            <p className="rounded-lg border border-dashed bg-background p-8 text-center text-muted-foreground">まだ読んでもらっていません。読み手を選んで「読んでもらう」を押すと、読み手が原稿を読み、アンケートと段落への感想を返します。</p>
          )}
        </section>

        <section id="yours" className="grid scroll-mt-4 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">あなた宛ての指摘</h2>
            <span className="rounded-full bg-amber-500 px-2 text-sm font-semibold text-white">{yours.length}</span>
            <span className="text-sm text-muted-foreground">Claude からの確認と、あなたの判断が要る指摘です。返信すると Claude 宛てになります。</span>
            <div className="ml-auto">
              <HandoffButton threads={data.threads} text={draftHandoffText(data)} />
            </div>
          </div>
          {yours.length === 0 && <p className="text-sm text-muted-foreground">あなた宛ての指摘はありません。</p>}
          <div className="grid items-start gap-2 lg:grid-cols-2">
            {order(yours).map((t) => (
              <ThreadCard key={t.id} quiet thread={t} api={api} kinds={data.noteKinds} place={placeOf(t, data)} onJump={() => jump(t)} />
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <button className="justify-self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowDone((v) => !v)}>
            Claude 宛て {claude.length} 件と解決済み {finished.length} 件を{showDone ? '隠す' : '表示'}
          </button>
          {showDone && (
            <div className="grid gap-2 lg:grid-cols-2">
              {order([...claude, ...finished]).map((t) => (
                <ThreadCard key={t.id} thread={t} api={api} kinds={data.noteKinds} place={placeOf(t, data)} onJump={() => jump(t)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** 読み手を選ぶ。personas/ のプリセットから、記事の読者に近い人を選ぶ */
function ChooseReaders({ data, onSave }: { data: Draft; onSave: (ids: string[]) => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(data.readers.map((r) => r.id))
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">記事を読んでもらう人を選びます。企画で描いた読者に近い人を 2〜4 人選ぶと、届いたかどうかが見えやすくなります。</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.personas.map((p) => (
          <label key={p.id} className={cn('flex cursor-pointer gap-2 rounded-md border p-2.5 text-sm hover:bg-accent/60', ids.includes(p.id) && 'border-foreground/50 bg-accent/60')}>
            <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} className="mt-1" />
            <span className="grid gap-0.5">
              <span className="font-medium">
                {p.name}（{p.label}）
              </span>
              <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.who}</span>
            </span>
          </label>
        ))}
      </div>
      <Button size="sm" className="justify-self-start" disabled={ids.length === 0} onClick={() => onSave(ids)}>
        この {ids.length} 人に決める
      </Button>
    </div>
  )
}
