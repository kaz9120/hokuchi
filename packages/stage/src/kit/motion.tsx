// 状態遷移の部品。スパイクで踏んだ崩れ (文言の重なり・縮む親の中の歪み・折り返しの飛び) をここで吸収する
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, type TargetAndTransition } from 'motion/react'
import { EASE, STATIC, t } from '../runtime/config'
import { pick, useStep } from '../runtime/scene'

// Morph の中にいるか。中では退場を即座にして、形を変える親に引き伸ばされた姿を見せない
const InMorph = createContext(false)

type RevealProps = {
  /** この状態から見える */
  at: number
  /** この状態から消える */
  until?: number
  /** 登場時に下から上がる距離。下降は自然、上昇は抵抗がある (slide:ology p.207) ので、登場は小さく上げる */
  y?: number
  delay?: number
  /** 退場の秒数。省略時は 0.15 秒、Morph の中では 0 */
  out?: number
  /** Connect の端点にする名前 */
  node?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** 指定した状態の間だけ見える */
export function Reveal({ at, until, y = 16, delay = 0, out, node, className, style, children }: RevealProps) {
  const step = useStep()
  const inMorph = useContext(InMorph)
  const on = step >= at && (until === undefined || step < until)
  const exitSec = out ?? (inMorph ? 0 : 0.15)
  return (
    <AnimatePresence initial={false}>
      {on && (
        <motion.div
          data-node={node}
          className={className}
          style={style}
          initial={{ opacity: 0, y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: t({ duration: exitSec, ease: 'easeIn' }) }}
          transition={t({ delay })}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** 文言の差し替え。古い文言が抜けきってから、新しい文言が入る (重ねない) */
export function Swap({ children, className, style }: { children: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={className} style={style}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={children}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0, transition: t({ duration: 0.4 }) }}
          exit={{ opacity: 0, y: -12, transition: t({ duration: 0.18, ease: 'easeIn' }) }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** 状態ごとの見出し。状態の数だけ文言を並べる */
export function Headline({ children, className = 'headline' }: { children: string | readonly string[]; className?: string }) {
  const step = useStep()
  const text = typeof children === 'string' ? children : pick(step, children)
  return <Swap className={className}>{text}</Swap>
}

type Box = { left: number; top: number; width: number; height: number }

type MorphProps = {
  /** 状態ごとの位置と大きさ。配列が短ければ最後の値を使い続ける */
  box: readonly Box[]
  /** 状態ごとのトーン。base.css の .tone-<名前> で、テーマのトークンを使って色を変える ('' は既定) */
  tone?: readonly string[]
  /** 状態ごとの見た目 (不透明度など、Motion で補間できる値) */
  look?: readonly TargetAndTransition[]
  /** 幅が変わって文字の折り返しが変わるとき true。移動が済んでから中身を出し直す */
  refit?: boolean
  node?: string
  className?: string
  style?: CSSProperties
  /** 中身の並べ方 */
  inner?: CSSProperties
  children?: ReactNode
}

/** 状態をまたいで生き続け、位置・大きさ・見た目を補間する箱 */
export function Morph({ box, tone, look, refit, node, className = 'card', style, inner, children }: MorphProps) {
  const step = useStep()
  const b = pick(step, box)
  const width = Math.round(b.width)
  return (
    <motion.div
      layout
      // 位置と大きさを測り直すのは、状態が変わったときだけ。ほかの理由で描き直されたとき (発表者ビューの時計など) に、
      // 測った位置のわずかなずれで補間が始まり直してチラつくのを防ぐ
      layoutDependency={step}
      data-node={node}
      className={`${className} ${tone && pick(step, tone) ? `tone-${pick(step, tone)}` : ''}`}
      style={{ ...style, position: 'absolute', ...b }}
      initial={false}
      animate={look ? pick(step, look) : undefined}
      transition={t()}
    >
      <InMorph.Provider value>
        <motion.div
          key={refit ? width : 'content'}
          layout="position"
          layoutDependency={step}
          className="morph-inner"
          style={inner}
          initial={refit ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={t({ delay: refit ? 0.4 : 0, duration: 0.3 })}
        >
          {children}
        </motion.div>
      </InMorph.Provider>
    </motion.div>
  )
}

/** 数を数え上げる。シーンに途中から入ったときは、最終値をそのまま出す */
export function CountUp({ values, decimals = 0 }: { values: readonly number[]; decimals?: number }) {
  const target = pick(useStep(), values)
  const [v, setV] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    if (STATIC) return setV(target)
    const c = animate(cur.current, target, {
      ...t({ duration: 1.2, ease: EASE }),
      onUpdate: (x) => {
        cur.current = x
        setV(x)
      },
    })
    return () => c.stop()
  }, [target])
  return <>{v.toFixed(decimals)}</>
}
