// 記事の読みの面 (ADR-0046)。発表の読みの面と同じ骨組みで、聴衆役に原稿を「note の記事」として読んでもらう。
// 上がアンケート、下があなた宛ての指摘の一覧。読み手は personas/ のプリセットから選ぶ (<原稿>/readers.yaml)
import { useMemo, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { BarActions, BarSummary } from '../work/FaceBar'
import { cn } from '../lib/utils'
import { draftApi, type Draft } from '../lib/note'
import type { Reading } from '../lib/talk'
import { Survey } from '../talk/Reads'

const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function NoteReadsView({ data, reading, onJump }: { data: Draft; reading: Reading | null; onJump: (n: number | null) => void }) {
  const api = useMemo(() => draftApi(data.key), [data.key])
  const [picked, setPicked] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const read = data.reads.find((r) => r.id === picked) ?? data.reads.at(-1) ?? null
  const prev = read ? (data.reads.filter((r) => r.id < read.id).at(-1) ?? null) : null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto grid max-w-[1400px] gap-8 py-5">
        <section className="grid gap-4">
          <BarSummary>
            <span>AI が演じる読み手 {data.readers.length} 人が、note で見つけた記事として原稿を読んだ結果です。</span>
          </BarSummary>
          <BarActions>
              {data.reads.length > 1 &&
                data.reads.map((r) => (
                  <Button key={r.id} size="xs" variant={r.id === read?.id ? 'default' : 'outline'} onClick={() => setPicked(r.id)}>
                    {r.id} 回目・{when(r.at)}
                  </Button>
                ))}
              <Button size="sm" disabled={!!reading || data.readers.length === 0} onClick={() => api.read()} title="いまの原稿を、まっさらな読み手に読んでもらいます。数分かかります">
                {reading ? <Loader2 className="animate-spin" /> : <Users />}
                {reading ? `読んでもらっています… ${reading.done} / ${reading.total} 人` : read ? 'もう一度読んでもらう' : '読んでもらう'}
              </Button>
          </BarActions>

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
            <Survey survey={data.survey} oneLiner={data.oneLiner} read={read} prev={prev} />
          ) : (
            <p className="rounded-lg border border-dashed bg-background p-8 text-center text-muted-foreground">まだ読んでもらっていません。読み手を選んで「読んでもらう」を押すと、読み手が原稿を読み、アンケートと段落への感想を返します。</p>
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
