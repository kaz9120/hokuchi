// 記事の読みの面 (ADR-0046)。発表の読みの面と同じ骨組みで、聴衆役に原稿を「note の記事」として読んでもらう。
// 先頭で読んでもらう人を選び (work/Readers.tsx)、その下にアンケート。指摘は受信箱で扱う
import { useMemo, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { BarActions, BarSummary } from '../work/FaceBar'
import { draftApi, type Draft } from '../lib/note'
import type { Reading } from '../lib/talk'
import { Survey } from '../talk/Reads'

const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function NoteReadsView({ data, reading, picker }: { data: Draft; reading: Reading | null; picker: React.ReactNode }) {
  const api = useMemo(() => draftApi(data.key), [data.key])
  const [picked, setPicked] = useState<number | null>(null)
  const read = data.reads.find((r) => r.id === picked) ?? data.reads.at(-1) ?? null
  const prev = read ? (data.reads.filter((r) => r.id < read.id).at(-1) ?? null) : null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto grid max-w-[1400px] gap-8 py-5">
        <section className="grid gap-4">
          <BarSummary>
            <span>AI が演じる {data.readers.length} 人が、note で見つけた記事として原稿を読みます。</span>
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

          {picker}

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
