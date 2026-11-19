// 作品の画面。左が会話、右が「いまのステップで見て決めるもの」。上にステップの並び。
// 進む操作は右の面の終わりに 1 つだけ置く。Claude が作業中は、右の面は読むだけにする
import { ArrowLeft, Check, ChevronDown, Loader2, MoreHorizontal, TriangleAlert, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToggleGroup, ToggleGroupItem, AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Badge, Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Skeleton, Step, Steps, cn, toast } from 'takibi-design-system'
import type { Anchor, ChatEntry, WorkView } from '../../shared/types'
import { STEPS, STEP_LABEL } from '../../shared/types'
import { Composer } from '../components/Composer'
import { Markdown } from '../components/Markdown'
import { api, fileUrl, useEvents, useLoad } from '../lib/api'
import { link, navigate } from '../lib/router'
import { Panel } from '../panels/Panel'

export type WorkCtx = {
  view: WorkView
  id: string
  /** Claude が作業中なら true。右の面は読むだけにする */
  locked: boolean
  set: (v: WorkView) => void
  /** 「ここについて話す」 */
  point: (a: Anchor) => void
  press: (action: string, payload?: unknown) => Promise<void>
}

export function WorkPage({ id }: { id: string }) {
  const { data, error, set, reload } = useLoad(() => api.work(id), [id])
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [pane, setPane] = useState<'chat' | 'panel'>('panel')
  useEvents(id, { work: (v: WorkView) => set(v), open: () => reload() })
  useEffect(() => setAnchors([]), [id])
  if (error) return <p className="p-8 text-danger">{error}</p>
  if (!data) return <Skeleton className="m-8 h-96" />
  const view = data
  const locked = view.turn === 'claude'
  const ctx: WorkCtx = {
    view,
    id,
    locked,
    set,
    point: (a) => {
      setAnchors((list) => (list.some((x) => x.ref === a.ref) ? list : [...list, a]))
      toast.add({ title: `${a.label} を会話の欄に付けました` })
    },
    press: async (action, payload) => {
      try {
        set(await api.press(id, action, payload))
      } catch (e) {
        toast.add({ title: String((e as Error).message), type: 'error' })
      }
    },
  }
  // Claude が話して答えることを求めている (画面のボタンでは済まない)
  const talkAsk = view.turn === 'you' && /話/.test(view.ask)
  const steps = STEPS[view.work.kind]
  const current = view.work.shipped && !view.work.revising && !view.work.reworking ? steps.length : steps.indexOf(view.work.step)
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line-subtle bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
          <a {...link('/')} className="motion-press flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg" aria-label="やることに戻る">
            <ArrowLeft className="size-4" aria-hidden />
          </a>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <Badge>{view.work.kind === 'note' ? '記事' : '発表'}</Badge>
              {view.work.kind === 'talk' && <Badge variant={view.work.decided.scope === 'public' ? 'brand' : 'info'}>{view.work.decided.scope === 'public' ? '公開' : '社内'}</Badge>}
              {view.revising && <Badge variant="warning">改稿中</Badge>}
              {view.work.reworking && <Badge variant="warning">手直し中</Badge>}
              {view.work.dropped && <Badge variant="danger">やめた</Badge>}
            </div>
            <h1 className="truncate text-lg font-semibold text-fg-strong">{view.work.title || view.note?.title || '無題'}</h1>
          </div>
          <Steps current={current} className="order-last min-w-[280px] flex-1 basis-full lg:order-none lg:basis-0">
            {steps.map((s) => (
              <Step key={s} title={STEP_LABEL[s]} />
            ))}
          </Steps>
          <WorkMenu ctx={ctx} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5 border-b border-line-subtle px-4 py-2 lg:hidden">
        <ToggleGroup variant="segmented" size="sm" value={[pane]} onValueChange={(v) => v[0] && setPane(v[0] as 'chat' | 'panel')} aria-label="表示">
          <ToggleGroupItem value="panel">{STEP_LABEL[view.work.step]}</ToggleGroupItem>
          <ToggleGroupItem value="chat">
            会話{anchors.length ? `（${anchors.length}）` : ''}
            {talkAsk && pane !== 'chat' && <span className="ml-1 size-2 rounded-full bg-brand" aria-label="Claude が聞いています" />}
          </ToggleGroupItem>
        </ToggleGroup>
        {/* 狭い画面では会話の下の「あなたの番」が隠れるので、ここにも出す */}
        {pane !== 'chat' && view.turn === 'you' && !ctx.locked && (
          talkAsk ? (
            <button type="button" className="motion-press text-center text-sm text-brand underline-offset-2 hover:underline" onClick={() => setPane('chat')}>
              あなたの番: {view.ask}（会話で答える）
            </button>
          ) : (
            <p className="text-center text-sm text-brand">あなたの番: {view.ask}</p>
          )
        )}
      </div>
      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr]">
        <div className={cn('min-h-0 lg:flex', pane === 'chat' ? 'flex' : 'hidden')}>
          <Conversation ctx={ctx} anchors={anchors} setAnchors={setAnchors} />
        </div>
        <section className={cn('min-h-0 overflow-y-auto border-line-subtle lg:block lg:border-l', pane === 'panel' ? 'block' : 'hidden')} aria-label="いまのステップ">
          <Panel ctx={ctx} />
        </section>
      </div>
    </div>
  )
}

function WorkMenu({ ctx }: { ctx: WorkCtx }) {
  const { view } = ctx
  const w = view.work
  const [dropping, setDropping] = useState(false)
  return (
    <div className="ml-auto flex items-center gap-3">
      <AlertDialog open={dropping} onOpenChange={setDropping}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この作品をやめますか</AlertDialogTitle>
            <AlertDialogDescription>Claude の作業を止め、原稿はごみ箱（hokuchi-private/trash/）に移します。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>やめない</AlertDialogClose>
            <Button variant="danger" onClick={() => void ctx.press('drop').then(() => navigate('/'))}>
              やめる
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {view.costUsd > 0 && <span className="hidden text-sm text-fg-subtle tabular-nums sm:inline" title="この作品で Claude に使った費用">${view.costUsd.toFixed(2)}</span>}
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="icon" aria-label="作品の操作" />}>
          <MoreHorizontal aria-hidden />
        </MenuTrigger>
        <MenuContent align="end">
          {w.kind === 'talk' && !w.dropped && (w.decided.scope === 'public' ? !w.shipped && <MenuItem onClick={() => void ctx.press('set-scope', { scope: 'internal' })}>社内の発表にする</MenuItem> : <MenuItem onClick={() => void ctx.press('set-scope', { scope: 'public' })}>公開する発表にする</MenuItem>)}
          {w.kind === 'note' && w.shipped && !view.revising && <MenuItem onClick={() => void ctx.press('revise')}>改稿する</MenuItem>}
          {!w.shipped && !w.dropped && w.step !== 'core' && <MenuItem disabled={ctx.locked} onClick={() => void ctx.press('step-back')}>前のステップに戻る</MenuItem>}
          {w.kind === 'talk' && !w.shipped && !w.dropped && w.step !== 'core' && (
            <MenuItem disabled={ctx.locked} onClick={() => void ctx.press('allow-parts')}>
              部品を直すのを許す（次の 1 回だけ）
            </MenuItem>
          )}
          {w.kind === 'talk' && talkReady(view) && <MenuItem disabled={ctx.locked} onClick={() => void ctx.press('export')}>1 つの HTML と PDF に書き出す</MenuItem>}
          {!w.dropped && w.decided.core && (
            <MenuItem onClick={() => void api.derive(w.id).then(({ id }) => navigate(`/works/${id}`))}>{w.kind === 'talk' ? '同じ材料で記事も書く' : '同じ材料で発表も作る'}</MenuItem>
          )}
          {view.revising && <MenuItem onClick={() => void ctx.press('cancel-revise')}>改稿をやめる</MenuItem>}
          {w.note?.url && (
            <MenuItem onClick={() => window.open(w.note!.url, '_blank')}>note で開く</MenuItem>
          )}
          {!w.shipped && !w.dropped && (
            <>
              <MenuSeparator />
              <MenuItem variant="danger" onClick={() => setDropping(true)}>
                この作品をやめる
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  )
}

// ---------------------------------------------------------------- 会話

function Conversation({ ctx, anchors, setAnchors }: { ctx: WorkCtx; anchors: Anchor[]; setAnchors: (a: Anchor[]) => void }) {
  const { view, id } = ctx
  const list = useRef<HTMLDivElement>(null)
  const live = view.live
  const stick = useRef(true)
  useEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [view.chat.length, live.text, live.tools.length])
  const last = view.chat.at(-1)
  const lastError = last?.tone === 'error'
  return (
    <section className="flex min-h-0 w-full flex-col" aria-label="Claude との会話">
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {view.chat.map((c) => (
          <Message key={c.id} entry={c} id={id} />
        ))}
        {live.state === 'running' && (
          <div className="flex flex-col gap-2">
            {live.text ? (
              <div className="rounded-lg bg-surface-raised px-3 py-2">
                <Markdown text={live.text} />
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="size-4 animate-spin text-brand motion-reduce:animate-none" aria-hidden />
              <span className="truncate">{live.tools.at(-1) ?? '考えています'}</span>
            </div>
          </div>
        )}
        {live.state === 'queued' && <p className="text-sm text-fg-muted">ほかの作品で Claude が作業中なので、順番を待っています</p>}
        {live.queuedText && (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-sm">
            <p className="text-fg-muted">
              {live.held ? '前の作業が止まったので、次の文を送らずに残しています: ' : '終わったら送る: '}
              <span className="text-fg">{live.queuedText.slice(0, 160)}</span>
            </p>
            {live.held && !ctx.locked && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void ctx.press('send-held')}>
                  この文を送る
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void ctx.press('drop-held')}>
                  捨てる
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-line-subtle p-3">
        <div className={cn('mb-2 flex items-start gap-2 text-sm', ctx.locked ? 'text-fg-muted' : lastError ? 'text-danger' : 'text-brand')} aria-live="polite">
          {ctx.locked ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /> : lastError ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : view.turn === 'shipped' ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden />}
          <span className={view.turn === 'shipped' ? 'text-success' : ''}>{ctx.locked ? view.ask : view.turn === 'shipped' || view.turn === 'dropped' ? view.ask : `あなたの番: ${view.ask}`}</span>
          {lastError && !ctx.locked && (
            <Button size="sm" variant="secondary" className="ml-auto shrink-0" onClick={() => void (last?.retry ? ctx.press(last.retry.action, last.retry.payload) : ctx.press('retry'))}>
              {last?.retry?.label ?? '続けてもらう'}
            </Button>
          )}
        </div>
        <Composer
          running={ctx.locked}
          quiet
          disabled={!!view.work.dropped}
          anchors={anchors}
          onRemoveAnchor={(ref) => setAnchors(anchors.filter((a) => a.ref !== ref))}
          rows={3}
          placeholder={view.work.dropped ? 'やめた作品です' : '話す・貼る・指した場所について伝える'}
          onStop={() => void api.stop(id)}
          onSend={async ({ text, files, anchors: a, mode }) => {
            ctx.set(await api.say(id, { text, files, anchors: a, mode }))
            setAnchors([])
          }}
        />
      </div>
    </section>
  )
}

function Message({ entry: c, id }: { entry: ChatEntry; id: string }) {
  if (c.role === 'system')
    return (
      <p className={cn('flex items-start gap-2 whitespace-pre-wrap text-sm', c.tone === 'error' ? 'text-danger' : c.tone === 'step' ? 'text-success' : 'text-fg-muted')}>
        {c.tone === 'error' && <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
        {c.text}
      </p>
    )
  if (c.role === 'you')
    return (
      <div className="ml-8 flex flex-col gap-2 self-end rounded-lg bg-brand-soft px-3 py-2">
        {c.anchors?.length ? (
          <div className="flex flex-wrap gap-1">
            {c.anchors.map((a) => (
              <span key={a.ref} className="rounded bg-surface-hover px-1.5 text-xs text-fg-muted">
                {a.label}
              </span>
            ))}
          </div>
        ) : null}
        {c.text && <LongText text={c.text} />}
        {c.files?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {c.files.map((f) => (
              <img key={f} src={fileUrl(id, f)} alt="" className="h-14 rounded border border-line-subtle object-cover" />
            ))}
          </div>
        ) : null}
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      {c.tools?.length ? (
        <details className="text-sm text-fg-subtle">
          <summary className="flex cursor-pointer items-center gap-1.5 hover:text-fg-muted">
            <Wrench className="size-3.5" aria-hidden />
            {c.tools.length}回の作業
          </summary>
          <ul className="mt-1 ml-5 list-disc">
            {c.tools.map((t, i) => (
              <li key={i} className="truncate">
                {t}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="rounded-lg bg-surface-raised px-3 py-2">
        <Markdown text={c.text} />
      </div>
    </div>
  )
}

const talkReady = (v: WorkView) => !!v.talk?.exists

/** 長い発言は 12 行で畳み、押すと全部出す */
function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.split('\n').length > 12 || text.length > 600
  return (
    <div className="flex flex-col gap-1">
      <p className={cn('whitespace-pre-wrap text-base text-fg', !open && long && 'line-clamp-[12]')}>{text}</p>
      {long && (
        <button type="button" className="flex items-center gap-1 self-start text-sm text-fg-muted hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          {open ? '畳む' : '全部読む'}
        </button>
      )}
    </div>
  )
}
