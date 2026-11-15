// やること。いちばん上で話して始め、その下にあなたの番の作品を並べる。
// Claude が作業中の作品は、短い列にまとめて、いまの作業を 1 行で出す
import { ArrowRight, Loader2, Mic, Presentation, StickyNote, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Badge, Callout, CalloutDescription, CalloutTitle, EmptyState, EmptyStateDescription, EmptyStateTitle, Heading, Skeleton, ToggleGroup, ToggleGroupItem, cn, toast } from 'takibi-design-system'
import type { Card, HomeView, Kind } from '../../shared/types'
import { STEP_LABEL } from '../../shared/types'
import { Composer } from '../components/Composer'
import { api } from '../lib/api'
import { link, navigate } from '../lib/router'

type StartKind = Kind | 'neta'

export function Home({ data, error, reload }: { data: HomeView | null; error: string | null; reload: () => void }) {
  const [kind, setKind] = useState<StartKind>('note')
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[960px] flex-col gap-12 px-4 py-8 md:px-6">
        <section className="flex flex-col gap-3" aria-labelledby="start">
          <Heading level={1} size="xl" id="start">
            話して始める
          </Heading>
          <Composer
            rows={5}
            autoFocus
            placeholder={kind === 'neta' ? '思いついたことを一言で。あとで記事や発表にできます' : '書きたいこと・話したいことを、音声入力でそのまま話すか貼り付けてください。画像も貼れます'}
            sendLabel={kind === 'neta' ? 'ネタ帳に入れる' : kind === 'note' ? '記事を始める' : '発表を始める'}
            leading={
              <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as StartKind)} aria-label="作るもの" size="sm">
                <ToggleGroupItem value="note">
                  <StickyNote aria-hidden />
                  記事
                </ToggleGroupItem>
                <ToggleGroupItem value="talk">
                  <Presentation aria-hidden />
                  発表
                </ToggleGroupItem>
                <ToggleGroupItem value="neta">
                  <Mic aria-hidden />
                  ネタ
                </ToggleGroupItem>
              </ToggleGroup>
            }
            onSend={async ({ text, files }) => {
              if (kind === 'neta') {
                await api.addNeta(text)
                toast.add({ title: 'ネタ帳に入れました' })
                reload()
                return
              }
              const { id } = await api.start(kind, text, files)
              navigate(`/works/${id}`)
            }}
          />
        </section>

        {error && <p className="text-danger">{error}</p>}
        {data && data.uncommitted.count > 0 && (
          <Callout variant="warning">
            <CalloutTitle>記録していない変更が {data.uncommitted.count}件あります</CalloutTitle>
            <CalloutDescription>
              取り込んだ記事や足した学びが、まだ git に記録されていません。
              {data.uncommitted.workId && (
                <a {...link(`/works/${data.uncommitted.workId}`)} className="ml-1 text-brand underline">
                  記録する
                </a>
              )}
            </CalloutDescription>
          </Callout>
        )}
        {!data ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="todo">
              <div className="flex items-baseline gap-2">
                <Heading level={2} size="lg" id="todo">
                  あなたの番
                </Heading>
                <span className="text-sm text-fg-muted tabular-nums">{data.todo.length}件</span>
              </div>
              {data.todo.length === 0 ? (
                <EmptyState variant="compact">
                  <EmptyStateTitle>あなたの番の作品はありません</EmptyStateTitle>
                  <EmptyStateDescription>上の欄で話して、記事か発表を始められます</EmptyStateDescription>
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.todo.map((c) => (
                    <TodoRow key={c.id} card={c} />
                  ))}
                </ul>
              )}
            </section>

            {data.working.length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="working">
                <Heading level={2} size="lg" id="working">
                  Claude が作業中
                </Heading>
                <ul className="flex flex-col gap-1">
                  {data.working.map((c) => (
                    <li key={c.id}>
                      <a {...link(`/works/${c.id}`)} className="motion-press-surface flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-hover">
                        <Loader2 className="size-4 shrink-0 animate-spin text-brand motion-reduce:animate-none" aria-hidden />
                        <span className="truncate font-medium text-fg">{c.title}</span>
                        <span className="truncate text-sm text-fg-muted">{c.doing ?? '考えています'}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.neta.length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="neta">
                <div className="flex items-baseline gap-2">
                  <Heading level={2} size="lg" id="neta">
                    ネタ
                  </Heading>
                  <a {...link('/neta')} className="text-sm text-brand hover:underline">
                    すべて見る（{data.neta.length}件）
                  </a>
                </div>
                <ul className="flex flex-col gap-1">
                  {data.neta.slice(0, 3).map((n) => (
                    <li key={n.file}>
                      <a {...link('/neta')} className="motion-press-surface flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-surface-hover">
                        <span className="text-fg-subtle tabular-nums">{n.at}</span>
                        <span className="truncate text-fg">{n.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TodoRow({ card: c }: { card: Card }) {
  return (
    <li>
      <a {...link(`/works/${c.id}`)} className="motion-press-surface group flex items-center gap-4 rounded-lg border border-line-subtle bg-surface-raised px-4 py-3 shadow-rim hover:border-line-strong">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{c.kind === 'note' ? '記事' : '発表'}</Badge>
            {c.kind === 'talk' && c.scope === 'internal' && <Badge variant="info">社内</Badge>}
            <span className="text-sm text-fg-muted">ステップ: {STEP_LABEL[c.step]}</span>
            {c.date && <span className="text-sm text-fg-muted tabular-nums">{c.date}</span>}
          </div>
          <span className="truncate text-base font-semibold text-fg-strong">{c.title}</span>
          <span className={cn('flex items-center gap-1.5 text-sm', c.failed ? 'text-danger' : 'text-brand')}>
            {c.failed && <TriangleAlert className="size-4" aria-hidden />}
            {c.ask}
          </span>
        </div>
        <ArrowRight className="size-5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
      </a>
    </li>
  )
}
