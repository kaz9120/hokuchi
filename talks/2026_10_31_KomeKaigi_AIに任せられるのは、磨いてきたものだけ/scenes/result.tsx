// 3 か月の伸び。goal の目盛りがそのまま縦軸になり、最初の点を置いてから線を右へ伸ばす。
// グラフの右上に 2 つの数 (設計の記録・取り込んだ改善) を出してから消し、3200 (AI が自分で届いた線) を引き、
// 3200〜4000 (人が引き上げた範囲) を塗って、人が方向を決め直した 3 か所に印を付ける。最後は見出しだけが問いに変わる。
// グラフの大きさと位置は goal からこのシーンの最後まで変えない
// 動きの役割: 強調 (最初の点・見出し) → オブジェクトの変化 (線が伸びる) → 強調 (2 つの数) → 強調 (3200 の線) → 関係性の変化 (帯と印) → 強調 (見出し)
import { Headline, Reveal, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import type { CSSProperties } from 'react'
import { FULL, POINTS, Scale, Series, xOf, yOf } from './_scale'

const HEADS = [
  '2 週間で 10 年前の世界 2 位に並びました',
  '3 か月で 成功の線に届きました',
  '小さな改善を 58 件積み上げました',
  'AI が自分で届いたのは 3200 点前後まででした',
  'AI が自分で届いたのは 3200 点前後まででした',
  'なぜ AI だけでは 伸びが止まったのでしょうか',
]

/** 3 か月の数。グラフの右上 (いまのトップの帯の上、目盛りの見出し「対局場の点数」と同じ高さ) に 2 つ並べる */
const STATS = [
  { label: '設計の記録', n: 246, unit: '本' },
  { label: '取り込んだ改善', n: 58, unit: '件' },
]

/** 人が方向を決め直した要所。日付は rate.csv の横軸に合わせ、印はその日の点の上に置く。
 *  ラベルは線とほかのラベルにぶつからない向きに出す (7/30 は右、10/18 は下)。後半で話す 2 つの場面だけに絞る */
const MARKS: { date: string; text: string; side: 'right' | 'below'; dx?: number }[] = [
  { date: '2026-07-30', text: '7/30 進め方', side: 'right' },
  { date: '2026-10-18', text: '10/18 盤', side: 'below', dx: -26 },
]
const LEAD = 40
const tag: CSSProperties = {
  position: 'absolute',
  whiteSpace: 'nowrap',
  fontSize: 22,
  fontWeight: 800,
  lineHeight: '26px',
  padding: '2px 10px',
  borderRadius: 6,
  border: '2px solid var(--fg)',
  background: 'var(--surface)',
  color: 'var(--fg)',
}

/** 線の上の印。点と短い引き出し線とラベル。帯 (強調色) の上でも読めるよう、ラベルは紙の色の札にする */
function Marks({ on }: { on: boolean }) {
  return (
    <>
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        {MARKS.map((m, i) => {
          const p = POINTS.find((q) => q.date === m.date)
          if (!p) return null
          const cx = xOf(p.day, FULL)
          const cy = yOf(p.v, FULL)
          const d = t({ delay: on ? 1.1 + i * 0.3 : 0, duration: 0.35 })
          return (
            <g key={m.date}>
              {m.side === 'right' ? (
                <motion.line initial={false} animate={{ opacity: on ? 1 : 0 }} transition={d} x1={cx + 8} x2={cx + 18} y1={cy} y2={cy} stroke="var(--fg)" strokeWidth={2} />
              ) : (
                <motion.line initial={false} animate={{ opacity: on ? 1 : 0 }} transition={d} x1={cx} x2={cx} y1={cy + 8} y2={cy + LEAD} stroke="var(--fg)" strokeWidth={2} />
              )}
              <motion.circle initial={false} animate={{ r: on ? 7 : 0, opacity: on ? 1 : 0 }} transition={d} cx={cx} cy={cy} fill="var(--fg)" stroke="var(--surface)" strokeWidth={3} />
            </g>
          )
        })}
      </svg>
      {MARKS.map((m, i) => {
        const p = POINTS.find((q) => q.date === m.date)
        if (!p) return null
        const cx = xOf(p.day, FULL)
        const cy = yOf(p.v, FULL)
        // 右に出す札は、すぐ下の 3200 の線から離すため、点より少し上に置く
        const pos = m.side === 'right' ? { left: cx + 18, top: cy - 17 } : { left: cx + (m.dx ?? 0), top: cy + LEAD }
        return (
          <motion.div key={m.date} initial={false} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 6 }} transition={t({ delay: on ? 1.2 + i * 0.3 : 0, duration: 0.35 })} style={{ ...tag, ...pos }}>
            {m.text}
          </motion.div>
        )
      })}
    </>
  )
}

function Result() {
  const step = useStep()
  const active = useActive()
  return (
    <>
      <Headline>{HEADS}</Headline>
      {/* 目盛りは goal と同じ座標。横軸と最初の点は、シーンに入ってから出す */}
      <Scale L={FULL} caption basis band goal xAxis={active} floor={step >= 3} lift={step >= 4} />
      <Series L={FULL} drawn={step >= 1} firstOn={active} note={step < 3} />
      {/* 2 つの数。グラフの右上の余白 (帯の上、見出しの下) に並べ、3200 の線が出るときに消える */}
      <Reveal at={2} until={3} style={{ position: 'absolute', right: 1280 - FULL.right, top: 132, display: 'flex', gap: 40 }}>
        {STATS.map((s) => (
          <div key={s.label} style={{ whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-sub)' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              <b style={{ fontSize: 38, fontWeight: 800, marginRight: 4 }}>{s.n}</b>
              {s.unit}
            </div>
          </div>
        ))}
      </Reveal>
      <Marks on={step >= 4} />
    </>
  )
}

export default defineScene({ id: 'result', steps: 6, Component: Result })
