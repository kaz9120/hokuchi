// ライブ再生・発表者ビュー・一覧・ノートを読むモード
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { H, W, t } from './config'
import { nextPos, progress, useFit, useKeys, useNav, type Pos } from './nav'
import { SceneView, Stage, StaticFrame } from './scene'
import type { TalkDef } from './types'

const pan = {
  enter: (d: number) => ({ x: d * W }),
  center: { x: 0 },
  exit: (d: number) => ({ x: -d * W }),
}

/** 動くステージ。シーンが変わると横にパンし、ブランド枠はパンの外に留まる */
function LiveStage({ talk, pos }: { talk: TalkDef; pos: Pos }) {
  const scene = talk.scenes[pos.scene]
  const { Frame } = talk.theme
  return (
    <Stage talk={talk}>
      <AnimatePresence initial={false} custom={pos.dir}>
        <motion.div
          key={scene.id}
          className="pan"
          custom={pos.dir}
          variants={pan}
          initial="enter"
          animate="center"
          exit="exit"
          transition={t({ duration: 0.9 })}
        >
          <SceneView scene={scene} step={pos.step} />
        </motion.div>
      </AnimatePresence>
      <Frame talk={talk} scene={scene} index={pos.scene} />
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
  const nx = nextPos(talk, pos)
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
