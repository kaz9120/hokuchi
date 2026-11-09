// コマの面。絵コンテを上から読み、話すことを直し、指摘を書く。
// 絵コンテ用紙と同じ並びにする。1 行が 1 コマで、左に絵、真ん中に話すこと、右の余白にそのコマへの指摘。
// シーンの目次は、作品の画面のレールの「コマ」の子に出す (読んでいるシーンを setReading で知らせる)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setReading } from '@/lib/router'
import { BarActions, BarSummary } from '../work/FaceBar'
import { mmss, sceneSeconds, type Scene, type Talk, type TalkApi, type Thread } from '@/lib/talk'
import { Anchor, MarginLayer, useComposing, type MarginItem } from './Margin'

type Pick = { scene: string; state: number }

export function KomaView({ data, thumbs, api, focus, seq }: { data: Talk; thumbs: number; api: TalkApi; focus: string | null; seq: number }) {
  const { board } = data
  const scroller = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState<Pick | null>(null)
  // 絵の作り方 (Claude への指示) は、話者が読むものではないので、見たいときだけ出す
  const [showHow, setShowHow] = useState(false)
  const byScene = useMemo(() => {
    const m = new Map<string, Thread[]>()
    for (const t of data.threads) m.set(t.scene, [...(m.get(t.scene) ?? []), t])
    return m
  }, [data.threads])

  // レールでシーンを選んだら (URL の場所が変わったら)、そのシーンへ。最初の 1 回は絵の高さが決まってから、飛ばずに動かす
  const moved = useRef(false)
  useEffect(() => {
    if (!focus) return
    const smooth = moved.current
    moved.current = true
    const t = setTimeout(() => document.getElementById(`scene-${focus}`)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }), smooth ? 0 : 150)
    return () => clearTimeout(t)
  }, [focus, seq])

  // いま読んでいるシーンを、レールの目次と URL に映す (履歴には積まない)。面の上から 120px の線を越えた最後のシーンを、読んでいるシーンとする
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const line = root.getBoundingClientRect().top + 120
        let here: string | null = null
        root.querySelectorAll<HTMLElement>('[id^="scene-"]').forEach((el) => {
          if (here === null || el.getBoundingClientRect().top <= line) here = el.id.replace('scene-', '')
        })
        if (here) setReading('koma', here)
      })
    }
    root.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('scroll', update)
    }
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

  // 余白の指摘。シーン全体は <scene>:*、コマは <scene>:<番号> の印に置く
  const sheet = useRef<HTMLDivElement>(null)
  const [composing, setComposing] = useComposing()
  const marginItems = useMemo<MarginItem[]>(
    () =>
      board.scenes.flatMap((s) => {
        const ts = byScene.get(s.id) ?? []
        return [
          { id: `${s.id}:*`, threads: ts.filter((t) => !t.state), onSend: (text: string) => void api.open(s.id, null, text) },
          ...s.states.map((_, i) => ({ id: `${s.id}:${i + 1}`, threads: ts.filter((t) => t.state === i + 1), onSend: (text: string) => void api.open(s.id, i + 1, text) })),
        ]
      }),
    [board, byScene, api],
  )

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 pb-40">
      <div ref={sheet} className="relative mx-auto max-w-[1340px]">
        <BarSummary>
          <span>
            {board.scenes.length} シーン・{order.length} コマ
          </span>
        </BarSummary>
        <BarActions>
          <Button size="sm" variant={showHow ? 'secondary' : 'ghost'} aria-pressed={showHow} onClick={() => setShowHow((v) => !v)} title="Claude 向けに書いた絵の指示を、コマごとに表示します">
            {showHow ? '絵の指示を隠す' : '絵の指示を表示'}
          </Button>
        </BarActions>
        {board.scenes.map((s) => (
          <SceneSheet key={s.id} scene={s} data={data} thumbs={thumbs} api={api} showHow={showHow} onWrite={setComposing} onPlay={(state) => setPlaying({ scene: s.id, state })} />
        ))}
        <MarginLayer container={sheet} items={marginItems} api={api} kinds={data.noteKinds} composing={composing} setComposing={setComposing} placeholder="話す内容でも見た目でも、気になったことを自由に入力" />
      </div>

      {playing && <Player data={data} pick={playing} position={order.findIndex((o) => o.scene === playing.scene && o.state === playing.state) + 1} total={order.length} move={move} close={() => setPlaying(null)} />}
    </div>
  )
}

/** 1 シーン。見出しと、コマの行 */
function SceneSheet({ scene, data, thumbs, api, showHow, onWrite, onPlay }: { scene: Scene; data: Talk; thumbs: number; api: TalkApi; showHow: boolean; onWrite: (id: string) => void; onPlay: (state: number) => void }) {
  const implemented = data.scenes.some((x) => x.id === scene.id)
  return (
    <section id={`scene-${scene.id}`} className="scroll-mt-2 border-b py-6 last:border-0">
      <div className="group/row grid grid-cols-[minmax(0,1fr)_300px] gap-5 min-[1400px]:grid-cols-[minmax(0,1fr)_340px] min-[1400px]:gap-6">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">{scene.title}</h2>
            <span className="text-xs text-muted-foreground">
              {scene.chapter}・約 {mmss(sceneSeconds(scene))}
            </span>
          </div>
          {scene.meta['伝えること'] && <p className="mt-1 text-sm text-muted-foreground">{scene.meta['伝えること']}</p>}
        </div>
        <Anchor id={`${scene.id}:*`} onWrite={onWrite} />
      </div>
      <div className="mt-4 grid gap-5">
        {scene.states.map((_, i) => (
          <KomaRow
            key={i}
            scene={scene}
            index={i}
            api={api}
            showHow={showHow}
            thumb={implemented && thumbs > 0 ? api.thumb(scene.id, i, thumbs) : null}
            shooting={implemented && thumbs === 0}
            onWrite={onWrite}
            onPlay={() => onPlay(i)}
          />
        ))}
      </div>
    </section>
  )
}

/** コマ 1 つ。絵・話すこと・右の余白に指摘 */
function KomaRow({ scene, index, api, showHow, thumb, shooting, onWrite, onPlay }: { scene: Scene; index: number; api: TalkApi; showHow: boolean; thumb: string | null; shooting: boolean; onWrite: (id: string) => void; onPlay: () => void }) {
  const state = scene.states[index]
  const [notes, setNotes] = useState(scene.notes[index] ?? '')
  const [saved, setSaved] = useState(scene.notes[index] ?? '')
  useEffect(() => {
    setNotes(scene.notes[index] ?? '')
    setSaved(scene.notes[index] ?? '')
  }, [scene.notes[index]])
  const save = async () => {
    if (notes === saved) return
    const mine = notes
    setSaved(mine)
    // 保存できなかったら (409 など)、読み直した中身の上に、書いた文を未保存のまま残す
    if ((await api.saveNotes(scene.id, index, mine)) === undefined) setTimeout(() => setNotes(mine), 0)
  }
  return (
    <div className="group/row grid grid-cols-[280px_minmax(0,1fr)_300px] gap-5 min-[1400px]:grid-cols-[340px_minmax(0,1fr)_340px] min-[1400px]:gap-6">
      <button onClick={onPlay} className="group/play relative block self-start overflow-hidden rounded-md border bg-muted" title="このコマの動きを再生">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <div className={cn('grid aspect-video place-items-center text-sm text-muted-foreground', shooting && 'animate-pulse')}>{shooting ? '絵を撮っています…' : '絵はまだありません'}</div>}
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-foreground/85 px-2 text-xs font-semibold leading-5 text-background">{index + 1}</span>
        <span className="absolute inset-0 hidden place-items-center bg-foreground/25 text-background group-hover/play:grid">
          <span className="flex items-center gap-1 rounded-full bg-foreground/85 px-3 py-1 text-sm">
            <Play className="size-3.5" /> 再生
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
        <div className="px-2 text-xs text-muted-foreground">{notes !== saved ? '未保存です。欄の外を押すと保存します' : null}</div>
        {(showHow || (!thumb && !shooting)) && (
          <p className="mt-1 border-l-2 px-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mr-2 font-medium">Claude への絵の指示</span>
            {state.screen}
          </p>
        )}
      </div>

      <Anchor id={`${scene.id}:${index + 1}`} onWrite={onWrite} />
    </div>
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
            <Play /> もう一度再生
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
