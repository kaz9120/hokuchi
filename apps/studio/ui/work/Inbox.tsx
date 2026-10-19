// 受信箱 (段 3。design.md 4 章)。あなた宛ての指摘を、どの面からでも右から開いて 1 件ずつ裁く。
// 1 件ごとに 返信・解決・見送る の 3 つ。押すとその件は受信箱から外れ、次の件に進む。
// 聴衆役に読んでもらった直後は、聴衆役の感想を先頭の 1 行で受け、まとめて Claude に渡すか見送る。
// feedback.yaml の形と ball・closed の値は変えない (感想を「見た」印は、この画面の手元にだけ持つ)
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { WorkView } from '../../shared/api'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notice'
import { placeOf, toDraft } from '@/lib/note'
import { navigate, workHref } from '@/lib/router'
import { author, mine, threadOps, where, type Thread } from '@/lib/talk'
import { cn } from '@/lib/utils'
import { call, current, reload, workPath } from '@/lib/works'
import { ThreadCard } from '../talk/Threads'

// ---------------------------------------------------------------- 開け閉め

let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
export const openInbox = () => ((open = true), emit())
export const closeInbox = () => ((open = false), emit())
export const toggleInbox = () => ((open = !open), emit())
export const useInboxOpen = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => open,
  )

// ---------------------------------------------------------------- 聴衆役の感想

/** 話者が目を通した読みの回 (作品ごと)。ファイルは変えず、ブラウザの手元にだけ持つ */
const ackKey = (key: string) => `hokuchi-studio:reads-seen:${key}`
function seenRead(key: string) {
  try {
    return Number(localStorage.getItem(ackKey(key)) ?? 0)
  } catch {
    return 0
  }
}
let seenVersion = 0
function markSeen(key: string, id: number) {
  try {
    localStorage.setItem(ackKey(key), String(id))
  } catch {}
  seenVersion++
  emit()
}

/** いちばん新しい読みの、聴衆役の感想のうち Claude の番のもの。話者がまだ目を通していなければ返す */
export function freshReaderNotes(view: WorkView): { read: number; notes: Thread[] } | null {
  const last = view.reads.at(-1)
  if (!last || seenRead(view.key) >= last.id) return null
  const notes = (view.threads.items as Thread[]).filter((t) => t.by === '聴衆役' && t.read === last.id && t.ball === 'Claude')
  return notes.length ? { read: last.id, notes } : null
}
/** 目を通したかどうかが変わったら描き直す */
export const useSeenVersion = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => seenVersion,
  )

/** 指摘をまとめて閉じる。1 件ずつ版を添えて送り、最後に 1 回だけ読み直す */
async function closeAll(key: string, ids: string[], how: '直した' | 'そのままにした') {
  const v = await current(key)
  let failed = 0
  for (const id of ids) {
    const rev = v.threads.items.find((t) => t.id === id)?.rev ?? ''
    await call(`${workPath(key)}/threads/${id}/close`, 'POST', { rev, how }).catch(() => failed++)
  }
  await reload(key).catch(() => {})
  return failed
}

// ---------------------------------------------------------------- 受信箱

export function Inbox({ view }: { view: WorkView }) {
  const isOpen = useInboxOpen()
  useSeenVersion()
  const threads = view.threads.items as Thread[]
  const draft = useMemo(() => toDraft(view), [view])
  const board = view.body?.kind === 'talk' ? view.body.board : null
  const placeLabel = (t: Thread) => (board ? where(t, board) : draft ? placeOf(t, draft) : '')
  const jump = (t: Thread) => {
    if (board) navigate(workHref(view.key, 'koma', t.scene ?? null))
    else navigate(workHref(view.key, 'draft', typeof t.para === 'number' ? String(t.para) : null))
  }
  const order = (list: Thread[]) =>
    board
      ? [...list].sort((a, b) => board.scenes.findIndex((s) => s.id === a.scene) - board.scenes.findIndex((s) => s.id === b.scene) || (a.state ?? 0) - (b.state ?? 0))
      : [...list].sort((a, b) => (a.para === '*' ? 0 : (a.para ?? 0)) - (b.para === '*' ? 0 : (b.para ?? 0)))
  const yours = useMemo(() => order(threads.filter(mine)), [threads])
  const others = useMemo(() => order(threads.filter((t) => !mine(t) && !(t.by === '聴衆役' && t.ball === 'Claude'))), [threads])
  const [index, setIndex] = useState(0)
  const [showOthers, setShowOthers] = useState(false)
  const at = Math.min(index, Math.max(0, yours.length - 1))
  const now = yours[at]
  const api = useMemo(() => threadOps(view.key), [view.key])
  const fresh = freshReaderNotes(view)
  const [peek, setPeek] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement) && closeInbox()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [isOpen])
  if (!isOpen) return null

  const handOver = async () => {
    if (!fresh) return
    await navigator.clipboard.writeText(view.handoff.text)
    markSeen(view.key, fresh.read)
    notify(`聴衆役の感想 ${fresh.notes.length} 件を含めて、Claude への依頼文をコピーしました。ターミナルの Claude Code に貼ってください。`)
  }
  const dropAll = async () => {
    if (!fresh) return
    setBusy(true)
    const failed = await closeAll(view.key, fresh.notes.map((t) => t.id), 'そのままにした')
    markSeen(view.key, fresh.read)
    setBusy(false)
    notify(failed ? `${fresh.notes.length - failed} 件を見送りました。${failed} 件はほかで変更されていたので、残しています。` : `聴衆役の感想 ${fresh.notes.length} 件を見送りました。`, failed ? 'error' : 'info')
  }

  return (
    <aside aria-label="受信箱" className="absolute inset-y-0 right-0 z-30 flex w-[420px] max-w-full animate-in flex-col border-l bg-background shadow-xl duration-200 slide-in-from-right-8 fade-in-0">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-base font-semibold">あなた宛て</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{yours.length} 件</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={closeInbox} aria-label="受信箱を閉じる（Esc）" title="閉じる（Esc）">
          <X />
        </Button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere]">
        {fresh && (
          <div className="grid min-w-0 gap-2 border-b bg-muted/50 px-4 py-3 text-sm">
            <p className="leading-relaxed">
              聴衆役から感想が <span className="font-semibold">{fresh.notes.length} 件</span> 届きました（{fresh.read} 回目の読み）。目を通してから、まとめて扱えます。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handOver} title="依頼文をコピーします。感想は Claude の番のまま残ります">
                Claude に渡す
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={dropAll} title="この回の感想を、直さずに閉じます">
                見送る
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setPeek((v) => !v)}>
                {peek ? '閉じる' : '中身を見る'}
              </Button>
            </div>
            {peek && (
              <ul className="grid max-h-72 min-w-0 gap-1 overflow-x-hidden overflow-y-auto">
                {fresh.notes.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => jump(t)} className={cn('w-full rounded-md border-l-2 px-2 py-1 text-left text-xs leading-relaxed hover:bg-accent', t.kind === 'good' ? 'border-emerald-400' : 'border-muted-foreground/40')}>
                      <span className="mr-1.5 font-medium">
                        {author(t)}・{view.unitKinds[t.kind ?? ''] ?? '感想'}
                      </span>
                      <span className="text-muted-foreground">{placeLabel(t)}</span>
                      <span className="line-clamp-2 text-muted-foreground">{t.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {now ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 px-4 py-4">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <button onClick={() => jump(now)} className="min-w-0 flex-1 truncate text-left font-medium underline-offset-2 hover:underline" title="この場所を開く">
                {placeLabel(now)}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {at + 1} / {yours.length}
              </span>
              <Button variant="ghost" size="icon-xs" disabled={at === 0} onClick={() => setIndex(at - 1)} aria-label="前の件">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-xs" disabled={at >= yours.length - 1} onClick={() => setIndex(at + 1)} aria-label="次の件">
                <ChevronRight />
              </Button>
            </div>
            <ThreadCard key={now.id} thread={now} api={api} kinds={view.unitKinds} quiet />
            {yours.length > 1 && (
              <div className="grid min-w-0 gap-1">
                <div className="text-xs text-muted-foreground">このあとの件</div>
                {yours.map((t, i) =>
                  i === at ? null : (
                    <button key={t.id} onClick={() => setIndex(i)} className="grid min-w-0 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
                      <span className="truncate font-medium">{placeLabel(t)}</span>
                      <span className="truncate text-muted-foreground">{t.replies?.at(-1)?.text ?? t.text}</span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">あなた宛ての指摘はありません。</p>
        )}

        {others.length > 0 && (
          <div className="border-t px-4 py-3">
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowOthers((v) => !v)}>
              {showOthers ? '閉じる' : `Claude の番と済んだ指摘 ${others.length} 件を見る`}
            </button>
            {showOthers && (
              <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                {others.map((t) => (
                  <div key={t.id} className="grid min-w-0 gap-1">
                    <button onClick={() => jump(t)} className="justify-self-start text-xs font-medium hover:underline">
                      {placeLabel(t)}
                    </button>
                    <ThreadCard thread={t} api={api} kinds={view.unitKinds} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
