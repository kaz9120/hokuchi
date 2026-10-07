// 1 チームの改善が組織を通って他のチームへ広がる。動きの役割: 連続性 (流れ) + 関係性の変化
import { t, useStep } from '../runtime/deck'
import { DrawPath, Reveal, Swap, Token } from '../runtime/kit'
import { motion } from 'motion/react'

const HEADLINES = ['改善するのは各チーム', 'Excellence が声を集めて共有する', '仕組みにできるものは組織の仕組みにする', 'チームの改善を組織に広げる']

const P1 = 'M 256 518 C 256 430, 340 420, 340 326'
const P2 = 'M 542 255 L 734 255'
const P3B = 'M 900 326 C 900 430, 640 420, 640 518'
const P3C = 'M 980 326 C 980 430, 1024 420, 1024 518'

const node = {
  position: 'absolute',
  top: 190,
  width: 400,
  height: 132,
  boxSizing: 'border-box',
  background: '#fff',
  borderRadius: 18,
  padding: '22px 30px',
} as const
const small = { fontSize: 20, fontWeight: 700, color: 'var(--sub)', letterSpacing: '0.04em' }
const big = { fontSize: 30, fontWeight: 800, marginTop: 8 }
const edge = { position: 'absolute', fontSize: 22, fontWeight: 700, color: 'var(--coral-deep)' } as const

const TEAMS = [
  { name: 'チーム A', left: 96, chip: 'WIP を減らしてリードタイムを半分に', at: 0 },
  { name: 'チーム B', left: 480, chip: '共有された工夫を使える', at: 3 },
  { name: 'チーム C', left: 864, chip: '共有された工夫を使える', at: 3 },
]

export function Cycle() {
  const step = useStep()
  return (
    <>
      <Swap k={HEADLINES[step]} className="headline">
        {HEADLINES[step]}
      </Swap>

      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        <DrawPath d={P1} at={1} end={[340, 326, -90]} stroke="var(--coral)" />
        <DrawPath d={P2} at={2} end={[736, 255, 0]} stroke="var(--coral)" />
        <DrawPath d={P3B} at={3} end={[640, 518, 90]} stroke="var(--coral)" />
        <DrawPath d={P3C} at={3} end={[1024, 518, 90]} stroke="var(--coral)" delay={0.15} />
      </svg>
      <Token d={P1} at={1} delay={0.1} />
      <Token d={P2} at={2} delay={0.1} />
      <Token d={P3B} at={3} delay={0.1} />
      <Token d={P3C} at={3} delay={0.25} />

      <Reveal at={1} style={{ ...edge, left: 330, top: 412 }}>
        ① 声を集めて共有
      </Reveal>
      <Reveal at={2} style={{ ...edge, left: 562, top: 208 }}>
        ② 仕組みにする
      </Reveal>
      <Reveal at={3} style={{ ...edge, left: 1040, top: 412 }}>
        ③ 他のチームへ
      </Reveal>

      <Reveal at={1} style={{ ...node, left: 140, border: '3px solid var(--coral)' }}>
        <div style={small}>Engineer Excellence 会議</div>
        <div style={big}>声を集めて共有する</div>
      </Reveal>
      <Reveal at={2} style={{ ...node, left: 740, border: '2px solid var(--line)' }}>
        <div style={small}>組織</div>
        <div style={big}>ルールや道具にして還元</div>
      </Reveal>

      {TEAMS.map((tm) => {
        const on = step >= tm.at
        return (
          <motion.div
            key={tm.name}
            className="card"
            style={{ left: tm.left, top: 520, width: 320, height: 140, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 10, padding: '0 24px' }}
            initial={false}
            animate={{ borderColor: on ? '#fa6e78' : '#ebe3e1' }}
            transition={t({ delay: on && tm.at > 0 ? 0.9 : 0 })}
          >
            <div style={{ fontSize: 28, fontWeight: 800 }}>{tm.name}</div>
            <Reveal at={tm.at} delay={tm.at > 0 ? 0.9 : 0} y={8} style={{ fontSize: 20, fontWeight: 700, color: 'var(--coral-deep)', lineHeight: 1.4 }}>
              {tm.chip}
            </Reveal>
          </motion.div>
        )
      })}
    </>
  )
}
