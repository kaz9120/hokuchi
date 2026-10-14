// 読みの面 (ADR-0039・ADR-0040)。聴衆役に読んでもらった結果を見て、あなたが答える指摘に答える。
// 上がアンケート (どこが弱いかを数字で見る)、下が指摘の一覧 (ここで答えきる)。
// slide:ology の「同僚に見せて、要点を押さえているかを評価してもらう」(p.54) に当たる
import { useMemo, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { forClaude, mine, where, type Read, type Talk, type TalkApi, type Thread } from '@/lib/talk'
import { ThreadCard } from './Threads'
import { Handoff } from './Handoff'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** 点の色。低いほど目立たせる */
const tone = (score: number) => (score <= 2 ? 'bg-red-100 text-red-900' : score < 3.5 ? 'bg-amber-100 text-amber-900' : score < 4.5 ? 'bg-emerald-50 text-emerald-900' : 'bg-emerald-200 text-emerald-950')
const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ReadsView({ data, api, reading, onJump }: { data: Talk; api: TalkApi; reading: Talk['reading']; onJump: (scene: string) => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const read = data.reads.find((r) => r.id === picked) ?? data.reads.at(-1) ?? null
  const prev = read ? (data.reads.filter((r) => r.id < read.id).at(-1) ?? null) : null
  const yours = data.threads.filter(mine)
  const claude = data.threads.filter(forClaude)
  const finished = data.threads.filter((t) => t.ball === 'none' && t.closed !== '良かった点')
  const [showDone, setShowDone] = useState(false)
  const order = (list: Thread[]) => [...list].sort((a, b) => data.board.scenes.findIndex((s) => s.id === a.scene) - data.board.scenes.findIndex((s) => s.id === b.scene) || (a.state ?? 0) - (b.state ?? 0))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto grid max-w-[1400px] gap-8 py-5">
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">聴衆役の読み</h2>
            <span className="text-sm text-muted-foreground">AI が演じる聴衆 {data.readers.length} 人に、絵コンテの画面と話すことだけを渡して、読んでもらった結果です。</span>
            <div className="ml-auto flex items-center gap-2">
              {data.reads.length > 1 &&
                data.reads.map((r) => (
                  <Button key={r.id} size="xs" variant={r.id === read?.id ? 'default' : 'outline'} onClick={() => setPicked(r.id)}>
                    {r.id} 回目・{when(r.at)}
                  </Button>
                ))}
              {yours.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => document.getElementById('yours')?.scrollIntoView({ behavior: 'smooth' })}>
                  あなたが答える指摘 {yours.length} 件へ ↓
                </Button>
              )}
              <Button size="sm" disabled={!!reading || data.readers.length === 0} onClick={() => api.read()} title="いまの絵コンテを、まっさらな読み手に読んでもらいます。数分かかります">
                {reading ? <Loader2 className="animate-spin" /> : <Users />}
                {reading ? `読んでもらっています… ${reading.done} / ${reading.total} 人` : read ? 'もう一度読んでもらう' : '読んでもらう'}
              </Button>
            </div>
          </div>
          {reading?.error && <p className="text-sm text-destructive">{reading.error}</p>}

          {read ? <Survey data={data} read={read} prev={prev} /> : <p className="rounded-lg border border-dashed bg-background p-8 text-center text-muted-foreground">まだ読んでもらっていません。「読んでもらう」を押すと、読み手が絵コンテを読んで、アンケートとコマへの感想を返します。</p>}
        </section>

        <section id="yours" className="grid scroll-mt-4 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">あなたが答える指摘</h2>
            <span className="rounded-full bg-amber-500 px-2 text-sm font-semibold text-white">{yours.length}</span>
            <span className="text-sm text-muted-foreground">Claude が確かめたいことと、あなたの判断が要る指摘です。答えると、Claude の番になります。</span>
            <div className="ml-auto">
              <Handoff data={data} />
            </div>
          </div>
          {yours.length === 0 && <p className="text-sm text-muted-foreground">いま、あなたが答える指摘はありません。</p>}
          <div className="grid items-start gap-2 lg:grid-cols-2">
            {order(yours).map((t) => (
              <ThreadCard key={t.id} quiet thread={t} api={api} kinds={data.noteKinds} place={where(t, data.board)} onJump={() => onJump(t.scene)} />
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <button className="justify-self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowDone((v) => !v)}>
            Claude が直す指摘 {claude.length} 件と、済んだ件 {finished.length} 件{showDone ? 'を畳む' : 'を見る'}
          </button>
          {showDone && (
            <div className="grid gap-2 lg:grid-cols-2">
              {order([...claude, ...finished]).map((t) => (
                <ThreadCard key={t.id} thread={t} api={api} kinds={data.noteKinds} place={where(t, data.board)} onJump={() => onJump(t.scene)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** アンケートの結果。行を選ぶと、その項目に付けた理由を読める */
function Survey({ data, read, prev }: { data: Talk; read: Read; prev: Read | null }) {
  const rows = useMemo(
    () =>
      data.survey.map((q) => {
        const now = mean(read.readers.map((r) => r.scores[q.key]?.score ?? 0))
        const before = prev ? mean(prev.readers.map((r) => r.scores[q.key]?.score ?? 0)) : null
        return { ...q, now, diff: before === null ? null : now - before }
      }),
    [data.survey, read, prev],
  )
  // 最初は、いちばん点の低い項目を開いておく
  const [open, setOpen] = useState<string>(() => [...rows].sort((a, b) => a.now - b.now)[0]?.key ?? '')
  const row = rows.find((r) => r.key === open)
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="overflow-hidden rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">
                {read.id} 回目・{when(read.at)}（1 当てはまらない 〜 5 当てはまる）
              </th>
              {read.readers.map((r) => (
                <th key={r.persona} className="px-1 py-2 text-center font-medium" title={r.label}>
                  {r.name.replace(/さん$/, '')}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium">平均</th>
              {prev && <th className="px-2 py-2 text-center font-medium">前回比</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((q, i) => (
              <tr key={q.key} onClick={() => setOpen(q.key)} className={cn('cursor-pointer border-b last:border-0 hover:bg-accent/60', open === q.key && 'bg-accent')}>
                <td className="px-3 py-1.5">
                  {(i === 0 || rows[i - 1].group !== q.group) && <span className="mr-2 text-xs text-muted-foreground">{q.group}</span>}
                  {q.label}
                </td>
                {read.readers.map((r) => (
                  <td key={r.persona} className="p-1 text-center">
                    <span className={cn('inline-block w-8 rounded py-0.5 font-medium tabular-nums', tone(r.scores[q.key]?.score ?? 0))}>{r.scores[q.key]?.score ?? '-'}</span>
                  </td>
                ))}
                <td className="px-2 text-center font-semibold tabular-nums">{q.now.toFixed(1)}</td>
                {prev && <td className={cn('px-2 text-center tabular-nums', (q.diff ?? 0) > 0.05 ? 'text-emerald-700' : (q.diff ?? 0) < -0.05 ? 'text-destructive' : 'text-muted-foreground')}>{q.diff === null ? '' : `${q.diff > 0 ? '+' : ''}${q.diff.toFixed(1)}`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {row && (
          <div className="grid gap-1.5 border-t bg-muted/40 p-3 text-sm">
            <div className="text-xs font-medium text-muted-foreground">「{row.label}」に付けた理由</div>
            {read.readers.map((r) => (
              <div key={r.persona} className="grid grid-cols-[5.5em_2em_1fr] gap-2 leading-relaxed">
                <span className="text-muted-foreground">{r.name}</span>
                <span className="font-medium tabular-nums">{r.scores[row.key]?.score}</span>
                <span>{r.scores[row.key]?.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid content-start gap-4">
        <div className="rounded-lg border bg-background p-3 text-sm">
          <div className="mb-2 text-xs font-medium text-muted-foreground">いちばん伝えたかったことは、何だと思ったか</div>
          <div className="mb-2 rounded-md bg-muted px-2.5 py-1.5 leading-relaxed">
            <span className="mr-2 text-xs text-muted-foreground">あなたが伝えたいこと</span>
            {data.work?.oneLiner || data.board.meta['中核メッセージ']}
          </div>
          <div className="grid gap-1.5">
            {read.readers.map((r) => (
              <div key={r.persona} className="grid grid-cols-[5.5em_1fr] gap-2 leading-relaxed">
                <span className="text-muted-foreground">{r.name}</span>
                <span>{r.message}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-background p-3 text-sm">
          <div className="mb-2 text-xs font-medium text-muted-foreground">ここがこうなっていたら、もっと良かった</div>
          <div className="grid gap-1.5">
            {read.readers.map((r) => (
              <div key={r.persona} className="grid grid-cols-[5.5em_1fr] gap-2 leading-relaxed">
                <span className="text-muted-foreground">{r.name}</span>
                <span>{r.wish}</span>
              </div>
            ))}
          </div>
        </div>
        {read.failed.length > 0 && <p className="text-xs text-destructive">読めなかった人がいます: {read.failed.join(' / ')}</p>}
      </div>
    </div>
  )
}
