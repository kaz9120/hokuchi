// コマの面 (ADR-0040)。絵コンテを上から読み、話すことを直し、指摘を書く。
// 絵コンテ用紙と同じ並びにする。1 行が 1 コマで、左に絵、真ん中に話すこと、右の余白にそのコマへの指摘。
// 左のレールは目次。あなたが答える指摘があるシーンに印を付ける
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { author, mine, mmss, sceneSeconds, type Scene, type Talk, type TalkApi, type Thread } from '@/lib/talk'
import { NewThread, ThreadCard } from './Threads'

type Pick = { scene: string; state: number }

export function KomaView({ data, thumbs, api, focus }: { data: Talk; thumbs: number; api: TalkApi; focus: string | null }) {
  const { board } = data
  const scroller = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<string>(focus ?? board.scenes[0]?.id ?? '')
  const [playing, setPlaying] = useState<Pick | null>(null)
  // 絵の作り方 (Claude への指示) は、話者が読むものではないので、見たいときだけ出す
  const [showHow, setShowHow] = useState(false)
  const chapters = useMemo(() => [...new Set(board.scenes.map((s) => s.chapter ?? ''))], [board])
  const byScene = useMemo(() => {
    const m = new Map<string, Thread[]>()
    for (const t of data.threads) m.set(t.scene, [...(m.get(t.scene) ?? []), t])
    return m
  }, [data.threads])

  const jump = useCallback((id: string, smooth = true) => {
    document.getElementById(`scene-${id}`)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
    history.replaceState(null, '', `#koma/${id}`)
    setCurrent(id)
  }, [])
  // URL で指定されたシーンへ。絵が読み込まれて高さが決まってから動かす
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => jump(focus, false), 150)
    return () => clearTimeout(t)
  }, [focus, jump])

  // いま読んでいるシーンを、レールに映す
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setCurrent(top.target.id.replace('scene-', ''))
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    )
    root.querySelectorAll('[id^="scene-"]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [board.scenes.length])

  // 再生中は ← → で前後のコマへ
  const order = useMemo(() => board.scenes.flatMap((s) => s.states.map((_, i) => ({ scene: s.id, state: i }))), [board])
  const move = useCallback(
    (d: 1 | -1) =>
      setPlaying((p) => {
        if (!p) return p
        const i = order.findIndex((o) => o.scene === p.scene && o.state === p.state)
        return order[Math.max(0, Math.min(order.length - 1, i + d))] ?? p
      }),
    [order],
  )

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)]">
      <nav className="flex min-h-0 flex-col border-r bg-background text-sm">
        <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {chapters.map((ch) => (
          <div key={ch} className="mb-2">
            <div className="px-4 py-1 text-xs font-semibold text-muted-foreground">{ch}</div>
            {board.scenes
              .filter((s) => (s.chapter ?? '') === ch)
              .map((s) => {
                const n = (byScene.get(s.id) ?? []).filter(mine).length
                return (
                  <button key={s.id} onClick={() => jump(s.id)} className={cn('flex w-full items-center gap-2 px-4 py-1 text-left hover:bg-accent', current === s.id && 'bg-accent font-medium')}>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {n > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white" title={`あなたが答える指摘が ${n} 件`}>
                        {n}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground" title="絵コンテには、絵をどう作るかの指示が Claude 向けに書いてあります">
          <input type="checkbox" checked={showHow} onChange={(e) => setShowHow(e.target.checked)} /> 絵の作り方（Claude への指示）も見る
        </label>
      </nav>

      <div ref={scroller} className="min-h-0 overflow-y-auto scroll-smooth px-6 pb-40">
        <div className="mx-auto max-w-[1340px]">
          {board.scenes.map((s) => (
            <SceneSheet key={s.id} scene={s} data={data} thumbs={thumbs} api={api} showHow={showHow} threads={byScene.get(s.id) ?? []} onPlay={(state) => setPlaying({ scene: s.id, state })} />
          ))}
        </div>
      </div>

      {playing && <Player data={data} pick={playing} position={order.findIndex((o) => o.scene === playing.scene && o.state === playing.state) + 1} total={order.length} move={move} close={() => setPlaying(null)} />}
    </div>
  )
}

/** 1 シーン。見出しと、コマの行 */
function SceneSheet({ scene, data, thumbs, api, showHow, threads, onPlay }: { scene: Scene; data: Talk; thumbs: number; api: TalkApi; showHow: boolean; threads: Thread[]; onPlay: (state: number) => void }) {
  const implemented = data.scenes.some((x) => x.id === scene.id)
  const whole = threads.filter((t) => !t.state)
  return (
    <section id={`scene-${scene.id}`} className="scroll-mt-2 border-b py-6 last:border-0">
      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">{scene.title}</h2>
            <span className="text-xs text-muted-foreground">
              {scene.chapter}・約 {mmss(sceneSeconds(scene))}
            </span>
          </div>
          {scene.meta['伝えること'] && <p className="mt-1 text-sm text-muted-foreground">{scene.meta['伝えること']}</p>}
        </div>
        <Margin threads={whole} api={api} kinds={data.noteKinds} label="このシーン全体に指摘を書く" onSend={(text) => api.open(scene.id, null, text)} />
      </div>
      <div className="mt-4 grid gap-5">
        {scene.states.map((_, i) => (
          <KomaRow
            key={i}
            scene={scene}
            index={i}
            api={api}
            kinds={data.noteKinds}
            showHow={showHow}
            thumb={implemented && thumbs > 0 ? api.thumb(scene.id, i, thumbs) : null}
            threads={threads.filter((t) => t.state === i + 1)}
            onPlay={() => onPlay(i)}
          />
        ))}
      </div>
    </section>
  )
}

/** コマ 1 つ。絵・話すこと・右の余白に指摘 */
function KomaRow({ scene, index, api, kinds, showHow, thumb, threads, onPlay }: { scene: Scene; index: number; api: TalkApi; kinds: Record<string, string>; showHow: boolean; thumb: string | null; threads: Thread[]; onPlay: () => void }) {
  const state = scene.states[index]
  const [notes, setNotes] = useState(scene.notes[index] ?? '')
  const [saved, setSaved] = useState(scene.notes[index] ?? '')
  useEffect(() => {
    setNotes(scene.notes[index] ?? '')
    setSaved(scene.notes[index] ?? '')
  }, [scene.notes[index]])
  const save = () => {
    if (notes === saved) return
    api.saveNotes(scene.id, index, notes)
    setSaved(notes)
  }
  return (
    <div className="grid grid-cols-[340px_minmax(0,1fr)_360px] gap-6">
      <button onClick={onPlay} className="group relative block self-start overflow-hidden rounded-md border bg-muted" title="この絵に変わる動きを見る">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center text-sm text-muted-foreground">絵はまだ</div>}
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-foreground/85 px-2 text-xs font-semibold leading-5 text-background">{index + 1}</span>
        <span className="absolute inset-0 hidden place-items-center bg-foreground/25 text-background group-hover:grid">
          <span className="flex items-center gap-1 rounded-full bg-foreground/85 px-3 py-1 text-sm">
            <Play className="size-3.5" /> 動きを見る
          </span>
        </span>
      </button>

      <div className="min-w-0">
        <textarea
          value={notes}
          placeholder="話すこと"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={save}
          className="field-sizing-content min-h-16 w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-[15px] leading-[1.85] outline-none hover:border-border focus:border-ring focus:bg-background"
        />
        <div className="px-2 text-xs text-muted-foreground">{notes !== saved ? '書きかけです。欄の外を押すと保存します' : null}</div>
        {(showHow || !thumb) && (
          <p className="mt-1 border-l-2 px-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mr-2 font-medium">絵の作り方</span>
            {state.screen}
          </p>
        )}
      </div>

      <Margin threads={threads} api={api} kinds={kinds} label="このコマに指摘を書く" onSend={(text) => api.open(scene.id, index + 1, text)} />
    </div>
  )
}

/** 右の余白。あなたが答える件を先頭に、聴衆役の感想は詰めて、済んだ件は畳む */
function Margin({ threads, api, kinds, label, onSend }: { threads: Thread[]; api: TalkApi; kinds: Record<string, string>; label: string; onSend: (text: string) => void }) {
  const [showDone, setShowDone] = useState(false)
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
          {readers.map((t) => (
            <ReaderNote key={t.id} thread={t} api={api} kinds={kinds} />
          ))}
        </div>
      )}
      {finished.length > 0 && (
        <button className="justify-self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowDone((v) => !v)}>
          済んだ件 {finished.length} {showDone ? 'を畳む' : 'を見る'}
        </button>
      )}
      {showDone && finished.map((t) => <ThreadCard key={t.id} thread={t} api={api} kinds={kinds} />)}
      <NewThread label={label} onSend={onSend} />
    </div>
  )
}

/** 聴衆役の感想。数が多いので 1 件を小さく見せ、押すと開く */
function ReaderNote({ thread, api, kinds }: { thread: Thread; api: TalkApi; kinds: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const good = thread.kind === 'good'
  if (open)
    return (
      <div className="relative">
        <ThreadCard thread={thread} api={api} kinds={kinds} />
        <button className="absolute top-1 right-1 rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => setOpen(false)} aria-label="畳む">
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

/** コマの絵を押したときの再生。その絵に変わる動きを大きく見せる。← → で前後のコマ、Esc で閉じる */
function Player({ data, pick, position, total, move, close }: { data: Talk; pick: Pick; position: number; total: number; move: (d: 1 | -1) => void; close: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const scene = data.board.scenes.find((s) => s.id === pick.scene)
  const go = (play: boolean) => frame.current?.contentWindow?.postMessage({ type: 'stage:goto', scene: pick.scene, step: pick.state, play }, '*')
  useEffect(() => {
    go(true)
  }, [pick.scene, pick.state])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [move, close])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/70 p-6" onClick={close}>
      <div className="w-[min(1180px,94vw)] rounded-xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto aspect-video max-h-[70vh] overflow-hidden rounded-md bg-black">
          <iframe ref={frame} src={data.stageUrl} title="再生" className="size-full border-0" onLoad={() => setTimeout(() => go(false), 300)} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => move(-1)}>
            ← 前のコマ
          </Button>
          <Button variant="outline" size="sm" onClick={() => go(true)}>
            <Play /> もう一度
          </Button>
          <Button variant="outline" size="sm" onClick={() => move(1)}>
            次のコマ →
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {position} / {total}
          </span>
          <span className="text-sm font-medium">
            {scene?.title}・コマ {pick.state + 1}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={close}>
            閉じる（Esc）
          </Button>
        </div>
        <p className="mt-2 max-h-24 overflow-auto text-sm leading-relaxed text-muted-foreground">{scene?.notes[pick.state]}</p>
      </div>
    </div>
  )
}
