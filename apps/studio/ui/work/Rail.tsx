// 作品の画面の左のレール (design.md 3 章「作品の画面」)。上から 芯・工程・受け渡し・場 の 4 段。
// ナビは工程の 1 つだけにする。開いている面は子 (企画の段階・シーン・見出し) を開く。工程の段だけがスクロールする
import { useEffect, useRef } from 'react'
import { Check, Circle, CircleDot, Copy } from 'lucide-react'
import type { AudiencePersona, ReaderChoice, WorkView } from '../../shared/api'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { notify } from '@/lib/notice'
import { onLinkClick, useReading, workHref, type Face } from '@/lib/router'
import { mine } from '@/lib/talk'
import { cn } from '@/lib/utils'
import type { Thread } from '@/lib/talk'
import { facesOf, type Child, type FaceItem } from './faces'

/** 発表の日まで、あと何日か */
const daysTo = (date: string | null) => (date && /^\d{4}-\d{2}-\d{2}/.test(date) ? Math.ceil((new Date(`${date.slice(0, 10)}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null)

export function Rail({ view, face, place }: { view: WorkView; face: Face; place: string | null }) {
  const faces = facesOf(view)
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-background">
      <Core view={view} />
      <nav aria-label="工程" className="min-h-0 flex-1 overflow-y-auto border-t px-2 py-3">
        {faces.map((f) => (
          <FaceRow key={f.face} view={view} item={f} active={f.face === face} place={place} />
        ))}
      </nav>
      <Handoff view={view} />
      <Place view={view} />
    </aside>
  )
}

// ---------------------------------------------------------------- 芯

/** 伝えたいことと聴衆。決めていないものは灰色で「未定」 */
function Core({ view }: { view: WorkView }) {
  const people = audienceOf(view)
  const planHref = (stage: string) => workHref(view.key, 'plan', stage)
  // 企画シートの無い作品で、中身からも読めないときは、空欄を 2 つ並べずに 1 行で言う
  if (!view.brief && !view.oneLiner && people.length === 0) return <p className="px-4 pt-4 pb-3 text-sm text-muted-foreground/80">企画シートはありません</p>
  return (
    <div className="grid gap-3 px-4 pt-4 pb-3">
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">伝えたいこと</div>
        <a href={planHref('oneLiner')} onClick={(e) => onLinkClick(e, planHref('oneLiner'))} title="企画の「伝えたいことを 1 文にする」を開く" className={cn('line-clamp-4 text-sm leading-relaxed break-words hover:underline', !view.oneLiner && 'text-muted-foreground/70')}>
          {view.oneLiner || '未定'}
        </a>
      </div>
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">{view.kind === 'talk' ? '聴衆' : '読者'}</div>
        {people.length === 0 ? (
          <span className="text-sm text-muted-foreground/70">未定</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {people.map((p, i) => (
              <Popover key={i}>
                <PopoverTrigger asChild>
                  <button className="block max-w-full truncate rounded-full border px-2 py-0.5 text-xs hover:bg-accent">{p.name.replace(/（.*$/, '')}</button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="grid w-96 gap-2 text-sm leading-relaxed">
                  <div className="font-semibold">{p.name}</div>
                  {p.rows.map(([label, text]) =>
                    text ? (
                      <div key={label}>
                        <div className="text-xs text-muted-foreground">{label}</div>
                        {text}
                      </div>
                    ) : null,
                  )}
                </PopoverContent>
              </Popover>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type Person = { name: string; rows: [string, string][] }
/** 聴衆の正は企画の段階 2 で描いた人 (rebuild.md 4.2)。企画シートが無ければ、読み手 (readers.yaml) を出す */
function audienceOf(view: WorkView): Person[] {
  const b = view.brief
  if (b && view.kind === 'talk') {
    const ps = (b.fields.personas ?? []) as AudiencePersona[]
    const named = ps.filter((p) => p.name || p.who)
    if (named.length)
      return named.map((p, i) => ({
        name: p.name || `${i + 1} 人目`,
        rows: [
          ['どんな人か', p.who],
          ['なぜここにいるか', p.why],
          ['困っていること', p.trouble],
          ['出そうな反論', p.pushback],
        ],
      }))
  }
  if (b && view.kind === 'note' && b.fields.readerWho) {
    const who = String(b.fields.readerWho)
    return [{ name: who.split('\n')[0].slice(0, 24) + (who.length > 24 ? '…' : ''), rows: [['誰に届けたいか', who], ['困っていること', String(b.fields.readerTrouble ?? '')], ['知っていること', String(b.fields.readerKnows ?? '')]] }]
  }
  return view.readers.map((r: ReaderChoice) => ({
    name: r.name,
    rows: [
      ['どんな人か', `${r.label}。${r.who}`],
      ['悩み', r.troubles],
      ['なぜここにいるか', r.why],
      ['引っかかりやすい点', r.pushback],
    ],
  }))
}

// ---------------------------------------------------------------- 工程

function FaceRow({ view, item, active, place }: { view: WorkView; item: FaceItem; active: boolean; place: string | null }) {
  const href = workHref(view.key, item.face)
  const Icon = item.face === 'plan' && item.done ? Check : active ? CircleDot : Circle
  const row = (
    <span className="flex w-full items-center gap-2">
      <Icon className={cn('size-3.5 shrink-0', item.face === 'plan' && item.done ? 'text-foreground' : active ? 'text-foreground' : 'text-muted-foreground/50')} />
      <span className="flex-1">{item.label}</span>
      {item.count && <span className={cn('text-xs tabular-nums', item.over ? 'text-destructive' : 'text-muted-foreground')}>{item.count}</span>}
    </span>
  )
  return (
    <div className="mb-0.5">
      {item.disabled ? (
        <span title={item.disabled} className="flex cursor-not-allowed items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground/50">
          {row}
        </span>
      ) : (
        <a
          href={href}
          aria-current={active ? 'page' : undefined}
          onClick={(e) => onLinkClick(e, href)}
          className={cn('flex items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent', active && 'bg-accent font-medium')}
        >
          {row}
        </a>
      )}
      {active && item.children.length > 0 && <Children view={view} face={item.face} items={item.children} place={place} />}
    </div>
  )
}

/** 開いている面の子。企画は段階、コマはシーン (章で区切る)、原稿は見出し。読んでいる所を示す */
function Children({ view, face, items, place }: { view: WorkView; face: Face; items: Child[]; place: string | null }) {
  const reading = useReading()
  const here = (reading?.face === face ? reading.place : null) ?? place ?? (face === 'plan' ? items.find((c) => c.status !== 'done')?.place ?? items[0]?.place : items[0]?.place) ?? null
  const box = useRef<HTMLDivElement>(null)
  // 読んでいる所が、レールの見えている範囲から外れたら、見える所まで送る
  useEffect(() => {
    box.current?.querySelector('[aria-current="location"]')?.scrollIntoView({ block: 'nearest' })
  }, [here])
  return (
    <div ref={box} className="relative mt-0.5 mb-2 ml-[15px] animate-in border-l pl-2 fade-in-0 slide-in-from-top-1">
      {items.map((c, i) => {
        const href = workHref(view.key, face, c.place)
        const group = c.group !== undefined && c.group !== items[i - 1]?.group ? c.group : null
        const current = c.place === here
        return (
          <div key={c.place}>
            {group && <div className="mt-2 mb-0.5 truncate px-2 text-[11px] font-medium text-muted-foreground first:mt-0" title={group}>{group}</div>}
            <a
              href={href}
              aria-current={current ? 'location' : undefined}
              onClick={(e) => onLinkClick(e, href)}
              title={c.label}
              className={cn('flex items-center gap-1.5 rounded px-2 py-1 text-[13px] leading-snug text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground', c.level === 3 && 'pl-5', current && 'bg-accent font-medium text-foreground shadow-[inset_2px_0_0_var(--foreground)]')}
            >
              {c.status && (c.status === 'done' ? <Check className="size-3 shrink-0" /> : <span className={cn('size-1.5 shrink-0 rounded-full', c.status === 'doing' ? 'bg-foreground/60' : 'bg-muted-foreground/30')} />)}
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {!!c.mine && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] leading-4 font-semibold text-white" title={`あなた宛ての指摘が ${c.mine} 件`}>{c.mine}</span>}
            </a>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- 受け渡し

/** あなた宛てと Claude への件数。件数は画面の中でここにだけ出す。「Claude へ」は押すと依頼文をコピーする */
function Handoff({ view }: { view: WorkView }) {
  const threads = view.threads.items as Thread[]
  const yours = threads.filter(mine).length
  const claude = view.handoff.count
  if (!view.body) return null
  const readsHref = workHref(view.key, 'reads')
  const copy = async () => {
    await navigator.clipboard.writeText(view.handoff.text)
    notify(`Claude への依頼文をコピーしました（指摘 ${claude} 件）。ターミナルの Claude Code に貼ってください。`)
  }
  return (
    <div className="grid gap-0.5 border-t px-2 py-2">
      <a href={readsHref} onClick={(e) => (onLinkClick(e, readsHref), yours && setTimeout(() => document.getElementById('yours')?.scrollIntoView({ behavior: 'smooth' }), 120))} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent" title="あなたの返事や判断を待っている指摘です">
        <span className="flex-1">あなた宛て</span>
        <span className={cn('min-w-6 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums', yours ? 'bg-amber-500 text-white' : 'text-muted-foreground')}>{yours}</span>
      </a>
      <button disabled={claude === 0} onClick={copy} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:text-muted-foreground" title="Claude の番の指摘を直してもらう依頼文をコピーします">
        <span className="flex-1">Claude へ</span>
        <Copy className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="min-w-6 rounded-full px-1.5 text-center text-xs font-semibold text-muted-foreground tabular-nums">{claude}</span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- 場

/** イベント・日付・持ち時間・あと何日か。記事は公開日。企画と実物の食い違いもここで知らせる */
function Place({ view }: { view: WorkView }) {
  const lines: string[] = []
  let days: number | null = null
  if (view.kind === 'talk') {
    const minutes = view.body?.kind === 'talk' ? (view.body.board.meta['持ち時間'] ?? (view.body.minutes ? `${Math.round(view.body.minutes / 60)} 分` : null)) : ((view.brief?.fields.duration as string | undefined) ?? null)
    days = daysTo(view.date)
    lines.push(...([view.date, minutes].filter(Boolean) as string[]))
  } else if (view.archive) {
    lines.push(`note で公開 ${view.archive.publishedAt}`)
  }
  if (!view.event && lines.length === 0 && view.state.notices.length === 0) return null
  return (
    <div className="grid gap-1 border-t px-4 py-3 text-sm">
      {view.event && <div className="font-medium leading-snug">{view.event}</div>}
      {lines.length > 0 && <div className="text-xs text-muted-foreground">{lines.join('・')}</div>}
      {days !== null && <div className={cn('text-xs', days >= 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{days > 0 ? `あと ${days} 日` : days === 0 ? '今日' : '終わりました'}</div>}
      {view.state.notices.map((n) => (
        <p key={n} className="mt-1 text-xs leading-relaxed text-amber-800">
          {n}
        </p>
      ))}
    </div>
  )
}


