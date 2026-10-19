// 余白の指摘 (段 3。design.md 4 章)。Google ドキュメントのコメントと同じ置き方にする。
// 行 (コマ・段落) の高さは指摘で変えない。指摘のカードは行の右の余白に重ねて置き、前のカードと重なるときだけ下にずらす。
// 「指摘を書く」は、行にカーソルを乗せたときだけ余白に出す。発表のコマの面と、記事の原稿の面で使う
import { useLayoutEffect, useRef, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { author, mine, type Thread, type ThreadApi } from '@/lib/talk'
import { Compose, ThreadCard } from './Threads'

/** 1 か所で、最初から見せる聴衆役の感想の数。多いところは「ほか n 件」に畳み、余白が下にずれ続けないようにする */
const READERS_SHOWN = 2

/** 余白に置くもの 1 か所分。id は行の印 (<Anchor id>) と同じにする */
export type MarginItem = { id: string; threads: Thread[]; extra?: React.ReactNode; onSend: (text: string) => void }

/** 行の余白の列に置く印。カードはこの高さに揃える。行にカーソルを乗せると「指摘を書く」が出る */
export function Anchor({ id, onWrite }: { id: string; onWrite: (id: string) => void }) {
  return (
    <div data-anchor={id} className="relative min-h-6">
      <button onClick={() => onWrite(id)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
        <MessageSquarePlus className="size-3.5" /> 指摘を書く
      </button>
    </div>
  )
}

/**
 * 余白の層。container (行を並べた箱。position: relative) の右端に重ね、各カードを印の高さに置く。
 * 前のカードと重なるときだけ下にずらす。行やカードの大きさが変わったら置き直す
 */
export function MarginLayer({ container, items, api, kinds, composing, setComposing, placeholder }: { container: React.RefObject<HTMLDivElement | null>; items: MarginItem[]; api: ThreadApi; kinds: Record<string, string>; composing: string | null; setComposing: (id: string | null) => void; placeholder: string }) {
  const layer = useRef<HTMLDivElement>(null)
  const shown = items.filter((i) => i.threads.length > 0 || i.extra || composing === i.id)
  useLayoutEffect(() => {
    // 行を並べた箱は、層の親から取る。親の ref は、子のこの effect より後に付くことがある
    // (面を切り替えて開いたとき、ref が空のまま一度も置けず、カードが先頭に重なっていた)
    const l = layer.current
    const root = l?.parentElement ?? container.current
    if (!root || !l) return
    let frame = 0
    const place = () => {
      const base = root.getBoundingClientRect().top
      let bottom = -Infinity
      for (const a of root.querySelectorAll<HTMLElement>('[data-anchor]')) {
        const el = l.querySelector<HTMLElement>(`[data-for="${CSS.escape(a.dataset.anchor!)}"]`)
        if (!el) continue
        const top = Math.max(Math.round(a.getBoundingClientRect().top - base), bottom + 8)
        if (el.style.top !== `${top}px`) el.style.top = `${top}px`
        bottom = top + el.offsetHeight
      }
      // 箱の高さは変えない (最後のカードがはみ出しても、スクロールの範囲には入る)。高さを変えると、絵が読み込まれて行が伸びたことに気づけない
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    place()
    const ro = new ResizeObserver(later)
    ro.observe(root)
    l.querySelectorAll('[data-for]').forEach((e) => ro.observe(e))
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  })
  return (
    <div ref={layer} className="pointer-events-none absolute inset-y-0 right-0 w-[300px] min-[1400px]:w-[340px]">
      {shown.map((i) => (
        <div key={i.id} data-for={i.id} className="group/card pointer-events-auto absolute inset-x-0 grid gap-2 transition-[top] duration-200">
          {i.extra}
          <MarginThreads threads={i.threads} api={api} kinds={kinds} />
          {composing === i.id ? (
            <Compose
              autoFocus
              placeholder={placeholder}
              onCancel={() => setComposing(null)}
              onSend={(t) => {
                i.onSend(t)
                setComposing(null)
              }}
            />
          ) : (
            i.threads.length > 0 && (
              <button onClick={() => setComposing(i.id)} className="flex items-center gap-1 justify-self-start rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100">
                <MessageSquarePlus className="size-3.5" /> 指摘を書く
              </button>
            )
          )}
        </div>
      ))}
    </div>
  )
}

/** 書いている途中の欄 (どの行の余白で書いているか)。面ごとに 1 つ */
export const useComposing = () => useState<string | null>(null)

/** 1 か所の指摘。あなたが答える件を先頭に、聴衆役の感想は詰めて、済んだ件は畳む */
function MarginThreads({ threads, api, kinds }: { threads: Thread[]; api: ThreadApi; kinds: Record<string, string> }) {
  const [showDone, setShowDone] = useState(false)
  const [showReaders, setShowReaders] = useState(false)
  const yours = threads.filter(mine)
  const own = threads.filter((t) => t.ball === 'Claude' && t.by !== '聴衆役')
  const readers = threads.filter((t) => t.by === '聴衆役' && (t.ball === 'Claude' || t.closed === '良かった点'))
  const finished = threads.filter((t) => t.ball === 'none' && t.closed !== '良かった点')
  return (
    <div className="grid content-start gap-2">
      {yours.map((t) => (
        <ThreadCard key={t.id} thread={t} api={api} kinds={kinds} />
      ))}
      {own.map((t) => (
        <ThreadCard key={t.id} thread={t} api={api} kinds={kinds} />
      ))}
      {readers.length > 0 && (
        <div className="grid gap-1">
          {(showReaders ? readers : readers.slice(0, READERS_SHOWN)).map((t) => (
            <ReaderNote key={t.id} thread={t} api={api} kinds={kinds} />
          ))}
          {readers.length > READERS_SHOWN && (
            <button className="justify-self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowReaders((v) => !v)}>
              {showReaders ? '聴衆役の感想を畳む' : `聴衆役の感想 ほか ${readers.length - READERS_SHOWN} 件`}
            </button>
          )}
        </div>
      )}
      {finished.length > 0 && (
        <button className="justify-self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowDone((v) => !v)}>
          解決済み {finished.length} 件を{showDone ? '隠す' : '表示'}
        </button>
      )}
      {showDone && finished.map((t) => <ThreadCard key={t.id} thread={t} api={api} kinds={kinds} />)}
    </div>
  )
}

/** 聴衆役の感想。数が多いので 1 件を小さく見せ、押すと開く */
function ReaderNote({ thread, api, kinds }: { thread: Thread; api: ThreadApi; kinds: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const good = thread.kind === 'good'
  if (open)
    return (
      <div className="relative">
        <ThreadCard thread={thread} api={api} kinds={kinds} />
        <button className="absolute top-1 right-1 rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => setOpen(false)} aria-label="閉じる">
          <X className="size-3" />
        </button>
      </div>
    )
  return (
    <button onClick={() => setOpen(true)} className={cn('rounded-md border-l-2 px-2 py-1 text-left text-xs leading-relaxed hover:bg-accent', good ? 'border-emerald-400' : 'border-muted-foreground/40')}>
      <span className={cn('mr-1.5 font-medium', good ? 'text-emerald-700' : 'text-foreground')}>
        {author(thread)}・{kinds[thread.kind ?? ''] ?? '感想'}
      </span>
      <span className="line-clamp-2 text-muted-foreground">{thread.text}</span>
    </button>
  )
}

