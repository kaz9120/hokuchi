// 章の地図。目次と 5 つの章扉で同じ地図を出し、いまの章に光を移す (slide:ology p.218 のレアの事例)
// 章扉では、画面に出た瞬間に前の章から今の章へ光が移る
import { defineScene, t, useActive } from '@hokuchi/stage'
import { motion } from 'motion/react'
import { CHAPTERS } from './_common'

const ROW = 88
const TOP = 190

function ChapterMap({ current }: { current: number | null }) {
  const active = useActive()
  // 画面に出る前は、前の章に光を置いておく
  const lit = current === null ? null : active ? current : Math.max(0, current - 1)
  return (
    <>
      <div className="label" style={{ position: 'absolute', left: 120, top: 80 }}>
        {current === null ? '今日の流れ' : `第 ${current + 1} 章`}
      </div>
      {lit !== null && (
        <motion.div
          style={{ position: 'absolute', left: 96, width: 6, height: 56, borderRadius: 3, background: 'var(--accent)' }}
          initial={false}
          animate={{ top: TOP + lit * ROW + 8 }}
          transition={t({ duration: 0.8, delay: 0.15 })}
        />
      )}
      {CHAPTERS.map((name, i) => {
        const on = lit === null || lit === i
        return (
          <motion.div
            key={name}
            style={{ position: 'absolute', left: 120, top: TOP + i * ROW, height: 72, display: 'flex', alignItems: 'center', gap: 28 }}
            initial={false}
            animate={{ opacity: on ? 1 : 0.3, x: lit === i ? 12 : 0 }}
            transition={t({ duration: 0.8, delay: 0.15 })}
          >
            <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)', width: 48, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: lit === i ? 44 : 36, fontWeight: 800, transition: 'font-size 0.6s' }}>{name}</span>
          </motion.div>
        )
      })}
    </>
  )
}

const chapter = (id: string, current: number | null) => defineScene({ id, steps: 1, Component: () => <ChapterMap current={current} /> })

export const agenda = chapter('agenda', null)
export const ch1 = chapter('ch1', 0)
export const ch2 = chapter('ch2', 1)
export const ch3 = chapter('ch3', 2)
export const ch4 = chapter('ch4', 3)
export const ch5 = chapter('ch5', 4)
