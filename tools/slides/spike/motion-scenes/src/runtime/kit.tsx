// シーンを書くための部品。スキーマではなく出発点で、シーンは素の要素も自由に使う。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, animate, motion } from 'motion/react'
import { EASE, PRINT, t, useStep } from './deck'

// at 以上 until 未満のステップで見える。登場は下から、退場は上へ (下降は自然、p.207)
export function Reveal({
  at,
  until,
  y = 16,
  className,
  style,
  delay = 0,
  out = 0.15,
  children,
}: {
  at: number
  out?: number // 退場の秒数。形を変えるカードの中では 0 にして、歪んだ姿を見せない
  until?: number
  y?: number
  className?: string
  style?: CSSProperties
  delay?: number
  children: ReactNode
}) {
  const step = useStep()
  const on = step >= at && (until === undefined || step < until)
  return (
    <AnimatePresence initial={false}>
      {on && (
        <motion.div
          className={className}
          style={style}
          initial={{ opacity: 0, y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -y / 2, transition: t({ duration: out, ease: 'easeIn' }) }}
          transition={t({ delay })}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// 文言の差し替え。古い文言が上へ抜け、新しい文言が下から入る
export function Swap({ k, className, style, children }: { k: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`swap ${className ?? ''}`} style={style}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={k}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: t({ duration: 0.4 }) }}
          exit={{ opacity: 0, y: -14, transition: t({ duration: 0.2, ease: 'easeIn' }) }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// 線を描く。終点に矢じりを付けるときは end に [x, y, 角度(度)] を渡す
export function DrawPath({
  d,
  at,
  end,
  stroke = 'var(--sub)',
  width = 3,
  dash,
  delay = 0,
}: {
  d: string
  at: number
  end?: [number, number, number]
  stroke?: string
  width?: number
  dash?: string
  delay?: number
}) {
  const on = useStep() >= at
  return (
    <g>
      <motion.path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dash}
        initial={false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={t({ duration: 0.9, delay, ease: 'easeInOut' })}
      />
      {end && (
        <motion.path
          d="M -14 -9 L 2 0 L -14 9 Z"
          fill={stroke}
          transform={`translate(${end[0]} ${end[1]}) rotate(${end[2]})`}
          initial={false}
          animate={{ opacity: on ? 1 : 0 }}
          transition={t({ duration: 0.2, delay: on ? delay + 0.8 : 0 })}
        />
      )}
    </g>
  )
}

// 線の上を流れる粒。ライブで「流れ」を見せる専用で、印刷には出さない
export function Token({ d, at, delay = 0, color = 'var(--coral)' }: { d: string; at: number; delay?: number; color?: string }) {
  const step = useStep()
  if (PRINT) return null
  return (
    <AnimatePresence>
      {step === at && (
        <motion.div
          key="tok"
          className="token"
          style={{ offsetPath: `path('${d}')`, background: color }}
          initial={{ offsetDistance: '0%', opacity: 0 }}
          animate={{ offsetDistance: '100%', opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, delay, ease: 'easeInOut' }}
        />
      )}
    </AnimatePresence>
  )
}

// 数を数え上げる。シーンに途中から入ったときは目標値をそのまま出す
export function CountUp({ from, to, at, decimals = 0 }: { from: number; to: number; at: number; decimals?: number }) {
  const target = useStep() >= at ? to : from
  const [v, setV] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    if (PRINT) return setV(target)
    const c = animate(cur.current, target, {
      duration: 1.2,
      ease: EASE,
      onUpdate: (x) => {
        cur.current = x
        setV(x)
      },
    })
    return () => c.stop()
  }, [target])
  return <>{v.toFixed(decimals)}</>
}
