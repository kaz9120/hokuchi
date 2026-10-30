// 同じ AI を使う 3 人の図。same-ai で大きく出し、callback で小さく戻る。
// 寸法は中心 x と足元 y からの相対で持ち、scale で縮めても同じ図に見えるようにする
import { motion } from 'motion/react'
import { t } from '@hokuchi/stage'
import type { ReactNode } from 'react'
import { AiMark, Person, REACH_LINE } from './_abstract'

export type TrioGeom = { cx: number; foot: number; scale: number }

/** same-ai の寸法 (scale 1)。足元からの高さと、中心からの距離 */
const BASE = { dx: 300, personH: 108, aiUp: 174, aiSize: 56, lineUp: 336, beyondUp: 442, lineHalf: 440, labelSize: 24 }
/** 線を越える人 (真ん中) */
export const WHO = 1

export function trioLayout({ cx, foot, scale }: TrioGeom) {
  const s = (v: number) => v * scale
  return {
    xs: [cx - s(BASE.dx), cx, cx + s(BASE.dx)],
    foot,
    personH: s(BASE.personH),
    aiY: foot - s(BASE.aiUp),
    aiSize: s(BASE.aiSize),
    lineY: foot - s(BASE.lineUp),
    beyondY: foot - s(BASE.beyondUp),
    lineX: [cx - s(BASE.lineHalf), cx + s(BASE.lineHalf)] as const,
    labelSize: Math.max(20, s(BASE.labelSize)),
  }
}

type Props = {
  geom: TrioGeom
  /** 図を出す (シーンに入ってから) */
  on: boolean
  /** 全員の線が上へ伸び、同じ高さの横線で止まる */
  lines: boolean
  /** 1 人だけが横線を越える */
  beyond: boolean
  /** 横線のラベル「AI が自分で届く線」 */
  label: boolean
  /** 動きの遅れの倍率。same-ai では 1 (1 人ずつ出す・線を順に引く)、callback では 0 (戻ってきた図なので一度に出す) */
  stagger?: number
  /** 線の上に重ねるもの (ステージ座標の SVG の要素) */
  children?: ReactNode
}

export function Trio({ geom, on, lines, beyond, label, stagger = 1, children }: Props) {
  const L = trioLayout(geom)
  const from = L.aiY - L.aiSize / 2 - 8
  const d = (sec: number) => sec * stagger
  return (
    <motion.div initial={false} animate={{ opacity: on ? 1 : 0 }} transition={t({ duration: 0.6 })} style={{ position: 'absolute', inset: 0 }}>
      {/* 3 人と、それぞれの上の同じ AI */}
      {L.xs.map((x, i) => {
        const hot = beyond && i === WHO
        return (
          <motion.div key={i} initial={false} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 16 }} transition={t({ delay: d(i * 0.2) })} style={{ position: 'absolute', inset: 0 }}>
            <Person cx={x} bottom={L.foot} height={L.personH} hot={hot} />
            <AiMark cx={x} cy={L.aiY} size={L.aiSize} hot={hot} />
          </motion.div>
        )
      })}

      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        {/* 全員から上へ伸びる線。同じ高さで止まる */}
        {L.xs.map((x, i) => (
          <motion.line
            key={i}
            x1={x}
            y1={from}
            x2={x}
            y2={L.lineY}
            initial={false}
            animate={{ pathLength: lines ? 1 : 0, opacity: lines ? 1 : 0 }}
            transition={t({ duration: 0.8, delay: lines ? d(i * 0.15) : 0, ease: 'easeInOut' })}
            style={{ stroke: beyond && i !== WHO ? 'var(--muted)' : 'var(--fg-sub)', strokeWidth: 5 * geom.scale, strokeLinecap: 'round', transition: 'stroke 0.5s' }}
          />
        ))}
        {/* AI が自分で届く線。破線なので pathLength (dasharray を使う) ではなく、右端の x を伸ばして引く */}
        <motion.line x1={L.lineX[0]} y1={L.lineY} y2={L.lineY} initial={false} animate={{ x2: lines ? L.lineX[1] : L.lineX[0], opacity: lines ? 1 : 0 }} transition={t({ duration: 0.9, delay: lines ? d(0.9) : 0, ease: 'easeInOut' })} style={{ ...REACH_LINE, strokeLinecap: 'round' }} />
        {/* 1 人だけが線を越える */}
        <motion.line x1={L.xs[WHO]} y1={L.lineY} x2={L.xs[WHO]} y2={L.beyondY} initial={false} animate={{ pathLength: beyond ? 1 : 0, opacity: beyond ? 1 : 0 }} transition={t({ duration: 0.9, delay: beyond ? d(0.2) : 0, ease: 'easeInOut' })} style={{ stroke: 'var(--accent)', strokeWidth: 6 * geom.scale, strokeLinecap: 'round' }} />
        <motion.circle cx={L.xs[WHO]} cy={L.beyondY} initial={false} animate={{ r: beyond ? 10 * geom.scale : 0, opacity: beyond ? 1 : 0 }} transition={t({ duration: 0.3, delay: beyond ? d(1.0) : 0 })} style={{ fill: 'var(--accent)' }} />
        {children}
      </svg>

      <motion.div
        initial={false}
        animate={{ opacity: label ? 1 : 0, y: label ? 0 : 6 }}
        transition={t({ delay: label ? d(1.4) : 0 })}
        style={{ position: 'absolute', left: L.lineX[0], top: L.lineY - L.labelSize - 20, fontSize: L.labelSize, fontWeight: 800, color: 'var(--fg)', whiteSpace: 'nowrap' }}
      >
        AI が自分で届く線
      </motion.div>
    </motion.div>
  )
}
