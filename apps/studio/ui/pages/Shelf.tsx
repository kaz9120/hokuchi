// 積み上げ。出したものを日付順に並べる。公開と社内はバッジで分ける
import { ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Heading, Input, Skeleton, ToggleGroup, ToggleGroupItem } from 'takibi-design-system'
import type { ShelfItem } from '../../shared/types'
import { api, useLoad } from '../lib/api'
import { link } from '../lib/router'

type Filter = 'all' | 'note' | 'talk' | 'internal'

export function Shelf() {
  const { data, error } = useLoad(api.shelf, [])
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const items = useMemo(
    () =>
      (data ?? []).filter((i) => {
        if (filter === 'internal' ? i.scope !== 'internal' : filter !== 'all' && i.kind !== filter) return false
        return !q || i.title.includes(q) || (i.event ?? '').includes(q)
      }),
    [data, filter, q],
  )
  const months = useMemo(() => {
    const m = new Map<string, ShelfItem[]>()
    for (const i of items) {
      const k = i.date.slice(0, 7) || '日付なし'
      m.set(k, [...(m.get(k) ?? []), i])
    }
    return [...m]
  }, [items])
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Heading level={1} size="xl">
            積み上げ
          </Heading>
          <span className="text-sm text-fg-muted tabular-nums">{items.length}件</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ToggleGroup variant="segmented" size="sm" value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} aria-label="絞り込み">
              <ToggleGroupItem value="all">すべて</ToggleGroupItem>
              <ToggleGroupItem value="note">記事</ToggleGroupItem>
              <ToggleGroupItem value="talk">発表</ToggleGroupItem>
              <ToggleGroupItem value="internal">社内</ToggleGroupItem>
            </ToggleGroup>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="題・イベントで探す" aria-label="探す" className="w-48" />
          </div>
        </div>
        {error && <p className="text-danger">{error}</p>}
        {!data && <Skeleton className="h-48" />}
        {months.map(([month, list]) => (
          <section key={month} className="flex flex-col gap-3">
            <Heading level={2} size="base" className="text-fg-muted">
              {month.replace('-', '年')}月
            </Heading>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((i) => (
                <ShelfCard key={i.key} item={i} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function ShelfCard({ item: i }: { item: ShelfItem }) {
  const body = (
    <>
      <div className="aspect-[1280/670] overflow-hidden rounded-t-lg bg-surface-sunken">{i.cover ? <img src={i.cover} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center p-4 text-center text-sm text-fg-subtle">{i.title}</div>}</div>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{i.kind === 'note' ? '記事' : '発表'}</Badge>
          {i.scope === 'internal' && <Badge variant="info">社内</Badge>}
          <span className="text-xs text-fg-muted tabular-nums">{i.date}</span>
        </div>
        <span className="line-clamp-2 text-sm font-medium text-fg-strong">{i.title}</span>
        {i.event && <span className="truncate text-xs text-fg-muted">{i.event}</span>}
      </div>
    </>
  )
  const cls = 'motion-press-surface flex h-full flex-col rounded-lg border border-line-subtle bg-surface-raised shadow-rim hover:border-line-strong'
  return (
    <li>
      {i.workId ? (
        <a {...link(`/works/${i.workId}`)} className={cls}>
          {body}
        </a>
      ) : i.url ? (
        <a href={i.url} target="_blank" rel="noreferrer" className={cls}>
          {body}
          <ExternalLink className="sr-only" aria-label="別のタブで開く" />
        </a>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}
