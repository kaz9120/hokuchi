// 再生機。配置は決めない。ステップ送り・シーン間のパン・印刷モードだけを持つ。
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, type Transition } from 'motion/react'

export const W = 1280
export const H = 720
const params = new URLSearchParams(location.search)
// ?print … PDF 用。各シーンの print に挙げた状態を静止画として縦に並べる
// ?print&all … 検証用。全シーンの全状態を並べる
export const PRINT = params.has('print')
const PRINT_ALL = params.has('all')

export const EASE = [0.22, 1, 0.36, 1] as const
// 印刷時は動きを消し、最終状態だけを描く
export const t = (base: Transition = {}): Transition =>
  PRINT ? { duration: 0 } : { duration: 0.6, ease: EASE, ...base }

export type SceneDef = {
  id: string
  steps: number
  print?: number[] // PDF に出す状態。省略時は最後の状態
  Component: () => ReactNode
  notes?: string[]
  cover?: boolean
}

const StepCtx = createContext(0)
export const useStep = () => useContext(StepCtx)

type Pos = { scene: number; step: number; dir: number }

function parseHash(scenes: SceneDef[]): Pos {
  const [, id, step] = location.hash.split('/')
  const i = scenes.findIndex((s) => s.id === id)
  if (i < 0) return { scene: 0, step: 0, dir: 1 }
  return { scene: i, step: Math.min(Number(step) || 0, scenes[i].steps - 1), dir: 1 }
}

function useFit() {
  const calc = () => Math.min(innerWidth / W, innerHeight / H)
  const [s, setS] = useState(calc)
  useEffect(() => {
    const on = () => setS(calc())
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])
  return s
}

const pan = {
  enter: (d: number) => ({ x: d * W }),
  center: { x: 0 },
  exit: (d: number) => ({ x: -d * W }),
}

type FrameFn = (s: SceneDef) => ReactNode

export function Deck({ scenes, frame }: { scenes: SceneDef[]; frame: FrameFn }) {
  if (PRINT) return <PrintDeck scenes={scenes} frame={frame} />
  return <LiveDeck scenes={scenes} frame={frame} />
}

function LiveDeck({ scenes, frame }: { scenes: SceneDef[]; frame: FrameFn }) {
  const [pos, setPos] = useState(() => parseHash(scenes))
  const scale = useFit()

  const go = useCallback(
    (delta: 1 | -1) =>
      setPos((p) => {
        const steps = scenes[p.scene].steps
        if (delta > 0) {
          if (p.step + 1 < steps) return { ...p, step: p.step + 1 }
          if (p.scene + 1 < scenes.length) return { scene: p.scene + 1, step: 0, dir: 1 }
        } else {
          if (p.step > 0) return { ...p, step: p.step - 1 }
          if (p.scene > 0) return { scene: p.scene - 1, step: scenes[p.scene - 1].steps - 1, dir: -1 }
        }
        return p
      }),
    [scenes],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) go(1)
      if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) go(-1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [go])

  useEffect(() => {
    history.replaceState(null, '', `#/${scenes[pos.scene].id}/${pos.step}`)
  }, [pos, scenes])

  const scene = scenes[pos.scene]
  return (
    <MotionConfig reducedMotion="user">
      <div className="viewport" onClick={() => go(1)}>
        <div className="stage" style={{ transform: `scale(${scale})` }}>
          <div className="bg" />
          <AnimatePresence initial={false} custom={pos.dir}>
            <motion.div
              key={scene.id}
              className="scene"
              custom={pos.dir}
              variants={pan}
              initial="enter"
              animate="center"
              exit="exit"
              transition={t({ duration: 0.9 })}
            >
              <StepCtx.Provider value={pos.step}>
                <scene.Component />
              </StepCtx.Provider>
            </motion.div>
          </AnimatePresence>
          {frame(scene)}
        </div>
      </div>
    </MotionConfig>
  )
}

function PrintDeck({ scenes, frame }: { scenes: SceneDef[]; frame: FrameFn }) {
  useEffect(() => {
    document.fonts.ready.then(() => setTimeout(() => ((window as any).__READY__ = true), 600))
  }, [])
  const pages = scenes.flatMap((s) =>
    (PRINT_ALL ? [...Array(s.steps).keys()] : (s.print ?? [s.steps - 1])).map((step) => ({ s, step })),
  )
  return (
    <div className="print">
      {pages.map(({ s, step }) => (
        <div className="page stage" key={`${s.id}-${step}`} data-frame={`${s.id}-${step}`}>
          <div className="bg" />
          <div className="scene">
            <StepCtx.Provider value={step}>
              <s.Component />
            </StepCtx.Provider>
          </div>
          {frame(s)}
        </div>
      ))}
    </div>
  )
}
