// 読みの面。聴衆役に読んでもらった結果を見て、あなたが答える指摘に答える。
// 上がアンケート (どこが弱いかを数字で見る)、下が指摘の一覧 (ここで答えきる)。
// slide:ology の「同僚に見せて、要点を押さえているかを評価してもらう」(p.54) に当たる
import { useMemo, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BarActions, BarSummary } from '../work/FaceBar'
import { cn } from '@/lib/utils'
import type { Read, Reading, Talk, TalkApi } from '@/lib/talk'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** 点の色。低いほど目立たせる */
const tone = (score: number) => (score <= 2 ? 'bg-red-100 text-red-900' : score < 3.5 ? 'bg-amber-100 text-amber-900' : score < 4.5 ? 'bg-emerald-50 text-emerald-900' : 'bg-emerald-200 text-emerald-950')
const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ReadsView({ data, api, reading, picker }: { data: Talk; api: TalkApi; reading: Reading | null; picker: React.ReactNode }) {
  const [picked, setPicked] = useState<number | null>(null)
  const read = data.reads.find((r) => r.id === picked) ?? data.reads.at(-1) ?? null
  const prev = read ? (data.reads.filter((r) => r.id < read.id).at(-1) ?? null) : null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto grid max-w-[1400px] gap-8 py-5">
        <section className="grid gap-4">
          <BarSummary>
            <span>聴衆役 {data.readers.length} 人が、絵コンテの画面と話すことだけを読みます。</span>
          </BarSummary>
          <BarActions>
              {data.reads.length > 1 &&
                data.reads.map((r) => (
                  <Button key={r.id} size="xs" variant={r.id === read?.id ? 'default' : 'outline'} onClick={() => setPicked(r.id)}>
                    {r.id} 回目・{when(r.at)}
                  </Button>
                ))}
              <Button size="sm" disabled={!!reading || data.readers.length === 0} onClick={() => api.read()} title="初見の聴衆役に、いまの絵コンテを読んでもらいます。数分かかります">
                {reading ? <Loader2 className="animate-spin" /> : <Users />}
                {reading ? `読んでもらっています… ${reading.done} / ${reading.total} 人` : read ? 'もう一度読んでもらう' : '読んでもらう'}
              </Button>
          </BarActions>
          {picker}
          {reading?.error && <p className="text-sm text-destructive">{reading.error}</p>}

          {read ? <Survey survey={data.survey} oneLiner={data.oneLiner} read={read} prev={prev} /> : <p className="rounded-lg border border-dashed bg-background p-8 text-center text-muted-foreground">まだ読んでもらっていません。「読んでもらう」を押すと、聴衆役が絵コンテを読み、アンケートとコマへの感想を返します。</p>}
        </section>

      </div>
    </div>
  )
}

/** アンケートの結果。行を選ぶと、その項目に付けた理由を読める。記事の読みの面でも使う */
export function Survey({ survey, oneLiner, read, prev }: { survey: Talk['survey']; oneLiner: string; read: Read; prev: Read | null }) {
  const rows = useMemo(
    () =>
      survey.map((q) => {
        const now = mean(read.readers.map((r) => r.scores[q.key]?.score ?? 0))
        const before = prev ? mean(prev.readers.map((r) => r.scores[q.key]?.score ?? 0)) : null
        return { ...q, now, diff: before === null ? null : now - before }
      }),
    [survey, read, prev],
  )
  // 最初は、いちばん点の低い項目を開いておく
  const [open, setOpen] = useState<string>(() => [...rows].sort((a, b) => a.now - b.now)[0]?.key ?? '')
  const row = rows.find((r) => r.key === open)
  return (
    <div className="grid items-start gap-4 min-[1400px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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
            <div className="text-xs font-medium text-muted-foreground">「{row.label}」の理由</div>
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
          <div className="mb-2 text-xs font-medium text-muted-foreground">いちばん伝えたいことは何だと思ったか</div>
          <div className="mb-2 rounded-md bg-muted px-2.5 py-1.5 leading-relaxed">
            <span className="mr-2 text-xs text-muted-foreground">あなたが伝えたいこと</span>
            {oneLiner}
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
        {read.failed.length > 0 && <p className="text-xs text-destructive">回答できなかった聴衆役: {read.failed.join(' / ')}</p>}
      </div>
    </div>
  )
}
