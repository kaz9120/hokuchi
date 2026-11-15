// 右の面に共通の部品。面の枠・進むボタン・伝えたいことを直す案の帯・候補のカード
import { Check, MessageSquarePlus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Callout, CalloutDescription, CalloutTitle, Heading, Input, Textarea, buttonVariants, cn } from 'takibi-design-system'
import type { Anchor, Option } from '../../shared/types'
import type { WorkCtx } from '../pages/Work'

export function Frame({ title, lead, children, footer, ctx }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode; ctx: WorkCtx }) {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <Heading level={2} size="xl">
          {title}
        </Heading>
        {lead && <p className="text-base text-fg-muted">{lead}</p>}
      </div>
      <CoreRevision ctx={ctx} />
      <TrashList ctx={ctx} />
      <fieldset disabled={ctx.locked} className="flex min-w-0 flex-col gap-8">
        {children}
      </fieldset>
      {footer && <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line-subtle bg-surface/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">{footer}</div>}
    </div>
  )
}

export function Section({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Heading level={3} size="lg">
          {title}
        </Heading>
        {hint && <span className="text-sm text-fg-muted">{hint}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  )
}

/** どのステップでも、Claude が「伝えたいことを直す案」を出したら上に出す */
function CoreRevision({ ctx }: { ctx: WorkCtx }) {
  // 確定の前は、直す案を候補のカードに並べる (NotePlan の withRevision)
  const raw = ctx.view.work.step === 'core' ? undefined : ctx.view.proposals.coreRevision
  const rev = raw?.text && raw.text !== ctx.view.work.decided.core ? raw : undefined
  const outline = ctx.view.proposals.outlineRevision
  const map = ctx.view.work.step === 'outline' ? undefined : ctx.view.proposals.mapRevision
  if (!rev?.text && !outline?.length && !map?.length) return null
  return (
    <div className="flex flex-col gap-3">
      {rev?.text && (
        <Callout variant="warning">
          <CalloutTitle>伝えたいことを直す案</CalloutTitle>
          <CalloutDescription>
            <p className="text-fg-muted">いま: {ctx.view.work.decided.core ?? '未定'}</p>
            <p className="mt-1 text-base font-medium text-fg-strong">{rev.text}</p>
            {rev.note && <p className="mt-1 text-sm text-fg-muted">{rev.note}</p>}
            <Button size="sm" className="mt-3" disabled={ctx.locked} onClick={() => void ctx.press('revise-core', { core: rev.text })}>
              伝えたいことをこれに変える
            </Button>
          </CalloutDescription>
        </Callout>
      )}
      {map?.length ? (
        <Callout variant="warning">
          <CalloutTitle>構成（メッセージマップ）を直す案</CalloutTitle>
          <CalloutDescription>
            <ol className="mt-1 list-decimal pl-5 text-sm">
              {map.map((r, i) => (
                <li key={i}>
                  {r.chapter}（{r.weight}）: {r.understand}
                </li>
              ))}
            </ol>
            <Button size="sm" className="mt-3" disabled={ctx.locked} onClick={() => void ctx.press('accept-map')}>
              構成をこれに変える
            </Button>
          </CalloutDescription>
        </Callout>
      ) : null}
      {outline?.length ? (
        <Callout variant="warning">
          <CalloutTitle>構成を直す案</CalloutTitle>
          <CalloutDescription>
            <ol className="mt-1 list-decimal pl-5 text-sm">
              {outline.map((s, i) => (
                <li key={i}>
                  {s.title}（{s.grain === '密' ? '厚く書く' : '短く通る'}・{s.budget}字）: {s.point}
                </li>
              ))}
            </ol>
            <Button size="sm" className="mt-3" disabled={ctx.locked} onClick={() => void ctx.press('accept-outline')}>
              構成をこれに変える
            </Button>
          </CalloutDescription>
        </Callout>
      ) : null}
    </div>
  )
}

/** 候補から 1 つ選ぶ。選んだものは直せる。picked は Claude が「話者が選んだ」と読んだ番号 */
export function Choice({ options, value, onChange, picked, name, editable = true, rows = 2 }: { options: Option[]; value: string; onChange: (v: string) => void; picked?: number; name: string; editable?: boolean; rows?: number }) {
  const [custom, setCustom] = useState(value)
  useEffect(() => setCustom(value), [value])
  const chosen = options.findIndex((o) => o.text === value)
  return (
    <div
      className="flex flex-col gap-2"
      role="radiogroup"
      aria-label={name}
      onKeyDown={(e) => {
        // グループの中は矢印キーで移る (takibi のキーボードの決まり)
        if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !options.length) return
        e.preventDefault()
        const next = (Math.max(chosen, 0) + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length
        onChange(options[next].text)
        ;(e.currentTarget.querySelectorAll('[role=radio]')[next] as HTMLElement)?.focus()
      }}
    >
      {options.map((o, i) => {
        const on = i === chosen
        return (
          <button
            type="button"
            key={i}
            role="radio"
            aria-checked={on}
            tabIndex={on || (chosen < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.text)}
            className={cn('motion-press-surface flex items-start gap-3 rounded-lg border px-4 py-3 text-left', on ? 'border-brand bg-brand-soft' : 'border-line-subtle bg-surface-raised hover:border-line-strong')}
          >
            <span className={cn('mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-brand bg-brand text-fg-on-brand' : 'border-line-strong')}>{on && <Check className="size-3" aria-hidden />}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-base font-medium text-fg-strong">{o.text}</span>
              {o.note && <span className="text-sm text-fg-muted">{o.note}</span>}
              {picked === i && !on && <span className="text-sm text-brand">話した内容から、これを選んだと読みました</span>}
            </span>
          </button>
        )
      })}
      {editable && rows === 1 && (
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => custom !== value && onChange(custom)}
          onKeyDown={(e) => e.key === 'Enter' && custom !== value && onChange(custom)}
          placeholder={options.length ? '選んだものを直すか、自分で書く' : 'まだ候補はありません。自分で書くこともできます'}
          aria-label={`${name}を直す`}
        />
      )}
      {editable && rows > 1 && (
        <Textarea
          rows={rows}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => custom !== value && onChange(custom)}
          placeholder={options.length ? '選んだものを直すか、自分で書く' : 'まだ候補はありません。自分で書くこともできます'}
          aria-label={`${name}を直す`}
        />
      )}
    </div>
  )
}

/** 「ここについて話す」ボタン */
export function PointButton({ ctx, anchor, className }: { ctx: WorkCtx; anchor: Anchor; className?: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className={cn('text-fg-muted', className)} onClick={() => ctx.point(anchor)} disabled={false}>
      <MessageSquarePlus aria-hidden />
      ここについて話す
    </Button>
  )
}

/** 進むボタン。1 画面に 1 つだけ primary にする */
export function Advance({ ctx, action, label, disabled, payload, hint }: { ctx: WorkCtx; action: string; label: string; disabled?: boolean; payload?: () => unknown; hint?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      {hint && <span className="text-sm text-fg-muted">{hint}</span>}
      <Button
        className="ml-auto"
        size="lg"
        disabled={ctx.locked || disabled || busy}
        status={busy ? 'loading' : 'idle'}
        onClick={async () => {
          setBusy(true)
          await ctx.press(action, payload?.())
          setBusy(false)
        }}
      >
        {label}
      </Button>
    </>
  )
}

export const waitingNote = (ctx: WorkCtx) => (ctx.locked ? 'Claude が作業中です。終わると、ここに候補が出ます' : undefined)

/** 外へのリンクを、ボタンの見た目で出す (別のタブで開く) */
export function LinkButton({ href, variant = 'secondary', children }: { href: string; variant?: 'secondary' | 'ghost' | 'primary'; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant }), 'motion-press')}>
      {children}
    </a>
  )
}

/** Claude が要らなくなったと言うファイル。Claude は消せないので、話者が押してごみ箱へ移すか残す */
function TrashList({ ctx }: { ctx: WorkCtx }) {
  const items = ctx.view.proposals.trash ?? []
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <p className="text-sm font-medium text-fg-strong">Claude が要らなくなったと言っているファイル</p>
      <ul className="flex flex-col gap-2">
        {items.map((f, i) => (
          <li key={f.path} className="flex flex-wrap items-center gap-2 text-sm">
            <code className="font-mono text-fg">{f.path}</code>
            {f.note && <span className="text-fg-muted">{f.note}</span>}
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="secondary" disabled={ctx.locked} onClick={() => void ctx.press('trash-file', { index: i })}>
                ごみ箱へ移す
              </Button>
              <Button size="sm" variant="ghost" disabled={ctx.locked} onClick={() => void ctx.press('keep-file', { index: i })}>
                残す
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
