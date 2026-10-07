// 線と流れ。要素同士を名前でつなぎ、座標の手置きを減らす
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { H, STATIC, W, t } from '../runtime/config'
import { useStep } from '../runtime/scene'

type Pt = [number, number]
type Side = 'top' | 'bottom' | 'left' | 'right'
type Rect = { x: number; y: number; w: number; h: number }

const NORMAL: Record<Side, Pt> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }

/** シーンの根を基準にした位置。transform は無視するので、動きの途中でも最終位置が取れる */
function rectIn(el: HTMLElement, root: HTMLElement): Rect {
  let x = 0
  let y = 0
  let n: HTMLElement | null = el
  while (n && n !== root) {
    x += n.offsetLeft
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

function sidePoint(r: Rect, side: Side, shift = 0): Pt {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  if (side === 'top') return [cx + shift, r.y]
  if (side === 'bottom') return [cx + shift, r.y + r.h]
  if (side === 'left') return [r.x, cy + shift]
  return [r.x + r.w, cy + shift]
}

/** 2 つの箱の位置関係から、向かい合う辺を選ぶ */
function facing(a: Rect, b: Rect): [Side, Side] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right']
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

export type Route = { d: string; end: Pt; angle: number; mid: Pt }

/** 辺の法線方向に膨らむ 3 次ベジェ。curve=0 で直線 */
export function route(p0: Pt, s0: Side, p3: Pt, s3: Side, curve = 0.5): Route {
  const dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1])
  const k = Math.max(24, dist * curve)
  const n0 = NORMAL[s0]
  const n3 = NORMAL[s3]
  const p1: Pt = [p0[0] + n0[0] * k, p0[1] + n0[1] * k]
  const p2: Pt = [p3[0] + n3[0] * k, p3[1] + n3[1] * k]
  const d = curve === 0 ? `M ${p0[0]} ${p0[1]} L ${p3[0]} ${p3[1]}` : `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`
  // 矢じりの向きは、終点に入る接線 (= 終点側の辺の法線の逆向き)
  const angle = (Math.atan2(-n3[1], -n3[0]) * 180) / Math.PI
  const b = (u: number, a: number, c1: number, c2: number, z: number) =>
    (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * c1 + 3 * (1 - u) * u ** 2 * c2 + u ** 3 * z
  const mid: Pt = curve === 0 ? [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2] : [b(0.5, p0[0], p1[0], p2[0], p3[0]), b(0.5, p0[1], p1[1], p2[1], p3[1])]
  return { d, end: p3, angle, mid }
}

/** 線を描く。at の状態で描き始め、矢じりは描き終わってから出す */
export function DrawPath({
  d,
  at,
  until,
  end,
  angle = 0,
  color = 'var(--accent)',
  width = 3,
  dash,
  delay = 0,
  fresh = false,
}: {
  /** 初めて描かれるとき、描き始めから見せる */
  fresh?: boolean
  d: string
  at: number
  until?: number
  end?: Pt
  angle?: number
  color?: string
  width?: number
  dash?: string
  delay?: number
}) {
  const step = useStep()
  const on = step >= at && (until === undefined || step < until)
  return (
    <g>
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dash}
        initial={fresh ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={t({ duration: 0.8, delay, ease: 'easeInOut' })}
      />
      {end && (
        <motion.path
          d="M -15 -9 L 1 0 L -15 9 Z"
          fill={color}
          transform={`translate(${end[0]} ${end[1]}) rotate(${angle})`}
          initial={fresh ? { opacity: 0 } : false}
          animate={{ opacity: on ? 1 : 0 }}
          transition={t({ duration: 0.15, delay: on ? delay + 0.7 : 0 })}
        />
      )}
    </g>
  )
}

/** 線の上を一度だけ流れる粒。ライブでの「流れ」専用で、静止画には出ない */
export function Flow({ d, at, delay = 0, color = 'var(--accent)' }: { d: string; at: number; delay?: number; color?: string }) {
  const step = useStep()
  if (STATIC) return null
  return (
    <AnimatePresence>
      {step === at && (
        <motion.div
          key="flow"
          className="flow-token"
          style={{ offsetPath: `path('${d}')`, background: color }}
          initial={{ offsetDistance: '0%', opacity: 0 }}
          animate={{ offsetDistance: '100%', opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={t({ duration: 1.0, delay, ease: 'easeInOut' })}
        />
      )}
    </AnimatePresence>
  )
}

type ConnectProps = {
  /** 始点・終点の名前 (Reveal / Morph の node、または任意の要素の data-node) */
  from: string
  to: string
  at: number
  until?: number
  /** 辺を指定しないときは、位置関係から向かい合う辺を選ぶ */
  fromSide?: Side
  toSide?: Side
  /** 辺の中点からのずらし (px)。同じ辺に複数の線が付くときに使う */
  fromShift?: number
  toShift?: number
  /** 0 で直線。大きいほど膨らむ */
  curve?: number
  arrow?: boolean
  /** 描くときに粒を一度流す */
  flow?: boolean
  color?: string
  width?: number
  dash?: string
  delay?: number
  /** 線の中ほどに置くラベル。背景色の座布団を敷くので、線と重なっても読める */
  label?: ReactNode
  labelOffset?: Pt
  labelStyle?: CSSProperties
}

/** 2 つの要素を線でつなぐ。位置は描画のたびに測り直す */
export function Connect(p: ConnectProps) {
  const step = useStep()
  const ref = useRef<SVGSVGElement>(null)
  const [r, setR] = useState<Route | null>(null)
  // シーンに入ったあとで状態が進んだか。進んでから現れた線は、描き始めから見せる
  const enteredAt = useRef(step)
  const fresh = step !== enteredAt.current

  useLayoutEffect(() => {
    const measure = () => {
      const root = ref.current?.closest('[data-scene-root]') as HTMLElement | null
      const a = root?.querySelector(`[data-node="${p.from}"]`) as HTMLElement | null
      const b = root?.querySelector(`[data-node="${p.to}"]`) as HTMLElement | null
      if (!root || !a || !b) return setR(null)
      const ra = rectIn(a, root)
      const rb = rectIn(b, root)
      const [fs, ts] = facing(ra, rb)
      const s0 = p.fromSide ?? fs
      const s3 = p.toSide ?? ts
      const next = route(sidePoint(ra, s0, p.fromShift), s0, sidePoint(rb, s3, p.toShift), s3, p.curve ?? 0.5)
      setR((cur) => (cur?.d === next.d ? cur : next))
    }
    measure()
    document.fonts.ready.then(measure)
  }, [step, p.from, p.to, p.fromSide, p.toSide, p.fromShift, p.toShift, p.curve])

  const on = step >= p.at && (p.until === undefined || step < p.until)
  return (
    <>
      <svg ref={ref} className="wires" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {r && <DrawPath d={r.d} at={p.at} until={p.until} end={p.arrow === false ? undefined : r.end} angle={r.angle} color={p.color} width={p.width} dash={p.dash} delay={p.delay} fresh={fresh} />}
      </svg>
      {r && p.flow && <Flow d={r.d} at={p.at} delay={(p.delay ?? 0) + 0.05} color={p.color} />}
      {r && p.label && (
        <AnimatePresence initial={fresh}>
          {on && (
            <motion.div
              className="wire-label"
              style={{ left: r.mid[0] + (p.labelOffset?.[0] ?? 0), top: r.mid[1] + (p.labelOffset?.[1] ?? 0), ...p.labelStyle }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: t({ duration: 0.15 }) }}
              transition={t({ delay: (p.delay ?? 0) + 0.5 })}
            >
              {p.label}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  )
}
