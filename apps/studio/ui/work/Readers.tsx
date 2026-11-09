// 読み手 (聴衆役) を選ぶ。発表も記事も、読みの面の先頭で同じ形で選ぶ。
// 選べるのは、企画の段階 2 で描いた人 (聴衆の正) と、personas/ のプリセット。企画で描いた人は id を brief:<名前> で readers.yaml に書く
import { useState } from 'react'
import type { Persona, WorkView } from '../../shared/api'
import { Button } from '@/components/ui/button'
import { onLinkClick, workHref } from '@/lib/router'
import { cn } from '@/lib/utils'
import { current, send } from '@/lib/works'

export function ReadersPicker({ view }: { view: WorkView }) {
  const fromPlan = view.audiencePersonas
  const chosen = view.readers
  const [open, setOpen] = useState(false)
  const showing = open || chosen.length === 0
  const word = view.kind === 'talk' ? '聴衆' : '読者'
  const planIds = new Set(fromPlan.map((p) => p.id))
  // 企画で描いた人と同じ名前のプリセットを選んでいれば、同じ人として数える
  const missingPlan = fromPlan.length > 0 && !chosen.some((r) => planIds.has(r.id) || fromPlan.some((p) => p.name === r.name))
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">読んでもらう人</span>
        {chosen.map((p) => (
          <span key={p.id} className={cn('rounded-full border bg-background px-2.5 py-0.5', planIds.has(p.id) && 'border-foreground/40')} title={p.who}>
            {p.name}
            <span className="ml-1 text-xs text-muted-foreground">{planIds.has(p.id) ? '企画' : p.label}</span>
          </span>
        ))}
        {chosen.length === 0 && <span className="text-muted-foreground/80">まだ選んでいません</span>}
        {chosen.length > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? '閉じる' : '変更'}
          </Button>
        )}
      </div>
      {missingPlan && !showing && <p className="text-xs text-muted-foreground">企画で描いた{word}が、読んでもらう人に入っていません。「変更」から足せます。</p>}
      {showing && <Choose key={chosen.map((c) => c.id).join()} view={view} onDone={() => setOpen(false)} />}
    </section>
  )
}

function Choose({ view, onDone }: { view: WorkView; onDone: () => void }) {
  const fromPlan = view.audiencePersonas
  const word = view.kind === 'talk' ? '聴衆' : '読者'
  // まだ誰も選んでいなければ、企画で描いた人を選んだ状態から始める
  const [ids, setIds] = useState<string[]>(view.readers.length ? view.readers.map((r) => r.id) : fromPlan.map((p) => p.id))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const save = async () => {
    setBusy(true)
    const v = await current(view.key)
    const whyOf = (id: string) => v.readers.find((r) => r.id === id)?.why || (fromPlan.find((p) => p.id === id) as (Persona & { why?: string }) | undefined)?.why || undefined
    await send(view.key, '/readers', 'PUT', { base: v.readersVersion, readers: ids.map((persona) => ({ persona, why: whyOf(persona) })) })
    setBusy(false)
    onDone()
  }
  const planHref = workHref(view.key, 'plan', 'audience')
  return (
    <div className="grid gap-4 rounded-lg border bg-background p-4">
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">企画で描いた{word}</h3>
        {fromPlan.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fromPlan.map((p) => {
              // 同じ名前のプリセットを選んでいれば、そのプリセットが演じる (二重に選ばない)
              const twin = view.personas.find((x) => x.name === p.name && ids.includes(x.id))
              return <Option key={p.id} p={p} on={ids.includes(p.id) || !!twin} toggle={toggle} disabled={twin ? `プリセットの${twin.name}（${twin.label}）が演じます` : null} />
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            まだ描いていません。
            <a href={planHref} onClick={(e) => onLinkClick(e, planHref)} className="underline underline-offset-2 hover:text-foreground">
              企画の段階 2
            </a>
            で描くと、ここから選べます。
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">プリセットから足す</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {view.personas.map((p) => (
            <Option key={p.id} p={p} on={ids.includes(p.id)} toggle={toggle} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={ids.length === 0 || busy} onClick={save}>
          この {ids.length} 人に決める
        </Button>
        {view.readers.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            キャンセル
          </Button>
        )}
        <span className="text-xs text-muted-foreground">2〜4 人を選ぶと、届いたかどうかが見えやすくなります。</span>
      </div>
    </div>
  )
}

function Option({ p, on, toggle, disabled = null }: { p: Persona; on: boolean; toggle: (id: string) => void; disabled?: string | null }) {
  return (
    <label className={cn('flex cursor-pointer gap-2 rounded-md border p-2.5 text-sm hover:bg-accent/60', on && 'border-foreground/50 bg-accent/60', disabled && 'cursor-default opacity-70 hover:bg-transparent')} title={disabled ?? undefined}>
      <input type="checkbox" checked={on} disabled={!!disabled} onChange={() => toggle(p.id)} className="mt-1" />
      <span className="grid gap-0.5">
        <span className="font-medium">
          {p.name}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{p.label}</span>
        </span>
        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{disabled ?? p.who}</span>
      </span>
    </label>
  )
}
