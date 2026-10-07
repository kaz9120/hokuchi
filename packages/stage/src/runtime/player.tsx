// ライブ再生・発表者ビュー・一覧・ノートを読むモード
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { H, W, panT } from './config'
import { nextPos, progress, useFit, useKeys, useNav, type Pos } from './nav'
import { SceneView, Stage, StaticFrame } from './scene'
import type { TalkDef } from './types'

/**
 * 動くステージ。前後のシーンも画面の外に組み立てておく「フィルムの帯」で、シーンが変わるとカメラだけが横にパンする。
 * 切り替わる瞬間にシーンを組み立てないので、画像のデコードや Web フォントの読み込みが動きに重ならない。
 * 前のシーンは最後の状態、次のシーンは最初の状態で待たせる (順に送れば、そのまま続きになる)。
 * ブランド枠はパンの外に留まる。
 */
function LiveStage({ talk, pos }: { talk: TalkDef; pos: Pos }) {
  const i = pos.scene
  const scene = talk.scenes[i]
  const { Frame } = talk.theme
  // パンの最中は、出ていくシーンと入ってくるシーンだけを置く。隣のシーンの組み立ては、パンが終わってから行う
  const [settled, setSettled] = useState(true)
  const from = useRef(i)
  const first = useRef(true)
  useEffect(() => {
    first.current = false
    if (from.current === i) return
    setSettled(false)
    const ms = ((panT() as { duration?: number }).duration ?? 0) * 1000 + 80
    const id = setTimeout(() => {
      from.current = i
      setSettled(true)
    }, ms)
    return () => clearTimeout(id)
  }, [i])
  const near = settled ? [i - 1, i, i + 1] : [Math.min(from.current, i), Math.max(from.current, i)]
  const strip = [...new Set(near)].filter((k) => k >= 0 && k < talk.scenes.length)
  return (
    <Stage talk={talk}>
      {strip.map((k) => {
        const s = talk.scenes[k]
        const step = k === i ? pos.step : k < i ? s.steps - 1 : 0
        // 先に組み立てていなかったシーン (一覧から飛んだ・速く送った) は、進む向きから入ってくる
        const initial = first.current ? false : { x: k === i ? pos.dir * W : (k - i) * W }
        // 登場の動きは、パンが終わってから始める。出ていくシーンと通り過ぎたシーンは、表示中の姿のまま保つ。
        // 戻るときに入ってくるシーンは、もう登場を済ませているので、パンの最中も表示中の姿のままにする
        const active = !settled && k === from.current ? true : k === i ? settled || pos.dir < 0 : k < i
        return (
          <motion.div key={s.id} className="pan" initial={initial} animate={{ x: (k - i) * W }} transition={panT()} aria-hidden={k !== i}>
            <SceneView scene={s} step={step} active={active} />
          </motion.div>
        )
      })}
      <Frame talk={talk} scene={scene} index={i} />
    </Stage>
  )
}

/** 縮尺をかけても周りのレイアウトが崩れないよう、外枠に縮尺後の大きさを持たせる */
export function Scaled({ scale, w = W, h = H, children }: { scale: number; w?: number; h?: number; children: ReactNode }) {
  return (
    <div style={{ width: w * scale, height: h * scale, position: 'relative', flex: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  )
}

const portrait = () => innerHeight > innerWidth

export function Player({ talk }: { talk: TalkDef }) {
  const { pos, next, prev, jump } = useNav(talk)
  const [overview, setOverview] = useState(false)
  const [reader, setReader] = useState(portrait)
  const scale = useFit(
    () => (reader ? { w: Math.min(innerWidth, 1120) - (portrait() ? 0 : 48), h: portrait() ? innerHeight : innerHeight * 0.66 } : { w: innerWidth, h: innerHeight }),
    W,
    H,
  )

  useKeys({
    next,
    prev,
    extra: {
      o: () => setOverview((v) => !v),
      g: () => setOverview((v) => !v),
      Escape: () => setOverview(false),
      n: () => setReader((v) => !v),
      p: () => open(`${location.pathname}?presenter${location.hash}`, 'stage-presenter', 'width=1440,height=900'),
      f: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()),
    },
  })

  // 制作アプリ (apps/studio) のプレビューから、状態を移す。play なら 1 つ前の状態から遷移を再生する
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; scene?: string; step?: number; play?: boolean }
      if (m?.type !== 'stage:goto') return
      const i = talk.scenes.findIndex((s) => s.id === m.scene)
      if (i < 0) return
      const step = m.step ?? 0
      if (!m.play) return jump(i, step)
      if (step > 0) jump(i, step - 1)
      else if (i > 0) jump(i - 1, talk.scenes[i - 1].steps - 1)
      setTimeout(() => (step > 0 || i > 0 ? next() : jump(i, 0)), 700)
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [talk, jump, next])

  // 画面の左 1/4 をタップすると戻り、それ以外は進む。横スワイプでも送る
  const touch = useRef<number | null>(null)
  const onPointer = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX - r.left < r.width / 4) prev()
    else next()
  }
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touch.current === null) return
      const dx = e.changedTouches[0].clientX - touch.current
      touch.current = null
      if (Math.abs(dx) > 50) {
        e.preventDefault()
        dx < 0 ? next() : prev()
      }
    },
  }

  const scene = talk.scenes[pos.scene]
  const { done, total } = progress(talk, pos)
  return (
    <MotionConfig reducedMotion="user">
      <div className={`player ${reader ? 'reader' : 'live'}`}>
        <div className="player-stage" onClick={onPointer} {...swipe}>
          <Scaled scale={scale}>
            <LiveStage talk={talk} pos={pos} />
          </Scaled>
        </div>
        {reader && (
          <div className="reader-panel">
            <div className="reader-progress">
              <div style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <div className="reader-nav">
              <button onClick={prev} aria-label="前へ">‹</button>
              <span>
                {done} / {total}
              </span>
              <button onClick={next} aria-label="次へ">›</button>
              <span className="reader-title">{scene.title ?? ''}</span>
              <button className="reader-link" onClick={() => setOverview(true)}>
                一覧
              </button>
            </div>
            <p className="reader-notes">{scene.notes?.[pos.step] ?? ''}</p>
            <h1 className="reader-talk">
              {talk.title}
              <small>
                {talk.speaker}
                {talk.event ? ` ・ ${talk.event.name}` : ''} ・ {talk.date}
              </small>
            </h1>
          </div>
        )}
        {!reader && <div className="live-hint">n: ノート ・ o: 一覧 ・ p: 発表者ビュー ・ f: 全画面</div>}
        {overview && <Overview talk={talk} current={pos.scene} onPick={(i) => (jump(i), setOverview(false))} onClose={() => setOverview(false)} />}
      </div>
    </MotionConfig>
  )
}

function Overview({ talk, current, onPick, onClose }: { talk: TalkDef; current: number; onPick: (i: number) => void; onClose: () => void }) {
  const cols = innerWidth < 700 ? 2 : 4
  const scale = (Math.min(innerWidth, 1400) - 48 - (cols - 1) * 16) / cols / W
  return (
    <div className="overview" onClick={onClose}>
      <div className="overview-grid" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
        {talk.scenes.map((s, i) => (
          <button
            key={s.id}
            className={`overview-item ${i === current ? 'current' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onPick(i)
            }}
          >
            <Scaled scale={scale}>
              <StaticFrame talk={talk} index={i} step={s.steps - 1} />
            </Scaled>
            <span>
              {i + 1}. {s.title ?? s.id}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Presenter({ talk }: { talk: TalkDef }) {
  const { pos, next, prev } = useNav(talk)
  const [start, setStart] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  const go = (f: () => void) => () => {
    setStart((s) => s ?? Date.now())
    f()
  }
  useKeys({ next: go(next), prev: go(prev), extra: { r: () => setStart(null) } })

  const scale = useFit(() => ({ w: innerWidth * 0.6 - 32, h: innerHeight - 120 }), W, H)
  const small = useFit(() => ({ w: innerWidth * 0.4 - 48, h: innerHeight * 0.4 }), W, H)
  // 次の状態のプレビューは、本番の動きが落ち着いてから作り直す (同じスレッドで描画が競合しないように)
  const target = nextPos(talk, pos)
  const [nx, setNx] = useState(target)
  const key = target ? `${target.scene}/${target.step}` : 'end'
  useEffect(() => {
    const id = setTimeout(() => setNx(target), 1100)
    return () => clearTimeout(id)
  }, [key])
  const scene = talk.scenes[pos.scene]
  const sec = start ? Math.floor((now - start) / 1000) : 0
  const { done, total } = progress(talk, pos)

  return (
    <MotionConfig reducedMotion="user">
      <div className="presenter">
        <header>
          <span className="presenter-timer">
            {String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}
          </span>
          <span>
            {done} / {total} ・ {scene.title ?? scene.id}
          </span>
          <span className="presenter-help">r: タイマーをリセット</span>
        </header>
        <main>
          <div className="presenter-current" onClick={go(next)}>
            <Scaled scale={scale}>
              <LiveStage talk={talk} pos={pos} />
            </Scaled>
          </div>
          <aside>
            <div className="presenter-label">次</div>
            {nx ? (
              <Scaled scale={small}>
                <StaticFrame talk={talk} index={nx.scene} step={nx.step} />
              </Scaled>
            ) : (
              <div className="presenter-end">終わり</div>
            )}
            <div className="presenter-label">話すこと</div>
            <p className="presenter-notes">{scene.notes?.[pos.step] ?? ''}</p>
          </aside>
        </main>
      </div>
    </MotionConfig>
  )
}
