// 物差し (対局場の点数の目盛り) と、その上に載る折れ線グラフ。
// goal → result で同じ座標を使い、目盛りがそのままグラフの縦軸になったように見せる。
// 位置はすべて Layout から計算する。goal から result の最後まで、大きさと位置は FULL のまま変えない
import { t } from '@hokuchi/stage'
import { AnimatePresence, motion } from 'motion/react'
import type { CSSProperties } from 'react'
import rateCsv from '../assets/rate.csv?raw'

export type Layout = { top: number; bottom: number; left: number; right: number }
/** 本文の領域いっぱいに使う配置 (goal・result) */
export const FULL: Layout = { top: 190, bottom: 630, left: 300, right: 1080 }

const RANGE = { min: 3000, max: 4500 }
const TICKS = [3000, 3200, 3400, 3600, 3800, 4000, 4200, 4400]
const BASIS = 3300
const TOP = [4300, 4400] as const
export const GOAL = 4000
/** AI が自分で届いた線 (7 月末) */
export const FLOOR = 3200

export type Point = { date: string; day: number; v: number }

/** rate.csv (date, daily, two_weeks) の two_weeks 列。day は最初の行からの日数 */
function parseRate(csv: string): Point[] {
  const rows = csv
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
  const start = Date.parse(rows[0][0] + 'T00:00:00Z')
  return rows.map(([date, , two]) => ({ date, day: (Date.parse(date + 'T00:00:00Z') - start) / 86400000, v: Number(two) }))
}

export const POINTS: Point[] = parseRate(rateCsv)
export const FIRST = POINTS[0]
export const LAST = POINTS[POINTS.length - 1]
/** 最高点 (成功の線に触れた点) */
export const PEAK = POINTS.reduce((a, b) => (b.v > a.v ? b : a))
export const DAYS = LAST.day
export const dayOf = (iso: string) => (Date.parse(iso + 'T00:00:00Z') - Date.parse(FIRST.date + 'T00:00:00Z')) / 86400000
export const jpDate = (p: Point) => {
  const [, m, d] = p.date.split('-')
  return `${Number(m)} 月 ${Number(d)} 日`
}

export const yOf = (v: number, L: Layout) => L.bottom - ((v - RANGE.min) / (RANGE.max - RANGE.min)) * (L.bottom - L.top)
export const xOf = (day: number, L: Layout) => L.left + (day / DAYS) * (L.right - L.left)

const MONTHS = ['2026-08-01', '2026-09-01', '2026-10-01'].map((d) => ({ day: dayOf(d), label: `${Number(d.slice(5, 7))} 月` }))

const RULER_W = 30
/** 目盛りの数字の左端 (物差しの板の左から) */
const NUM_W = 88
const text: CSSProperties = { position: 'absolute', whiteSpace: 'nowrap', lineHeight: 1.4 }
const chip: CSSProperties = { display: 'inline-block', background: 'var(--surface)', border: '2px solid var(--line)', borderRadius: 999, padding: '4px 16px', fontSize: 22, fontWeight: 600 }

type ScaleProps = {
  L: Layout
  /** 目盛りの上の「対局場の点数」 */
  caption?: boolean
  /** 3300 の基準のソフト */
  basis?: boolean
  /** 4300〜4400 のいまのトップ */
  band?: boolean
  /** 4000 の成功の線 */
  goal?: boolean
  /** 横軸 (日付) */
  xAxis?: boolean
  /** 3200 の AI が自分で届いた線 */
  floor?: boolean
  /** 3200〜4000 の、人が引き上げた範囲 */
  lift?: boolean
}

/** 物差し。goal ではこれだけを見せ、result ではグラフの縦軸になる */
export function Scale({ L, caption = false, basis = false, band = false, goal = false, xAxis = false, floor = false, lift = false }: ScaleProps) {
  const tr = t()
  const yB = yOf(BASIS, L)
  const yG = yOf(GOAL, L)
  const yF = yOf(FLOOR, L)
  const yT0 = yOf(TOP[1], L)
  const yT1 = yOf(TOP[0], L)
  const numLeft = L.left - RULER_W - NUM_W
  const on = (b: boolean) => (b ? 1 : 0)
  return (
    <>
      {/* 物差しの板。右の辺が軸になる */}
      <motion.div
        initial={false}
        animate={{ left: L.left - RULER_W, top: L.top, height: L.bottom - L.top }}
        transition={tr}
        style={{ position: 'absolute', width: RULER_W, background: 'var(--surface)', border: '2px solid var(--line)', borderRight: 'none', borderRadius: '6px 0 0 6px', boxSizing: 'border-box' }}
      />
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        {/* 刻み。200 ごとに長く、100 ごとに短く */}
        {Array.from({ length: 16 }, (_, i) => RANGE.min + i * 100).map((v) => (
          <motion.line key={v} initial={false} animate={{ x1: L.left - (v % 200 ? 10 : 18), x2: L.left - 2, y1: yOf(v, L), y2: yOf(v, L) }} transition={tr} stroke="var(--fg-sub)" strokeWidth={2} />
        ))}
        <motion.line initial={false} animate={{ x1: L.left, x2: L.left, y1: L.top, y2: L.bottom }} transition={tr} stroke="var(--fg-sub)" strokeWidth={3} />
        {/* いまのトップの帯 */}
        <motion.rect initial={false} animate={{ attrX: L.left, attrY: yT0, width: L.right - L.left, height: yT1 - yT0, opacity: on(band) }} transition={tr} fill="var(--line)" />
        {/* 人が引き上げた範囲。3200 の線から 4000 の線へ、上に向かって広がる */}
        <motion.rect initial={false} animate={{ attrX: L.left, attrY: lift ? yG : yF, width: L.right - L.left, height: lift ? yF - yG : 0, opacity: on(lift) }} transition={t({ duration: 0.9 })} fill="var(--accent-bg)" />
        {/* 基準のソフト */}
        <motion.line initial={false} animate={{ x1: L.left, x2: L.right, y1: yB, y2: yB, opacity: on(basis) }} transition={tr} stroke="var(--muted)" strokeWidth={2} strokeDasharray="3 8" strokeLinecap="round" />
        <motion.circle initial={false} animate={{ cx: L.left, cy: yB, r: 8, opacity: on(basis) }} transition={tr} fill="var(--fg-sub)" />
        {/* AI が自分で届いた線。最初の点のラベルが線の下へ退いてから、墨の実線を左から右へ引く */}
        <motion.line initial={false} animate={{ x1: L.left, x2: L.right, y1: yF, y2: yF, pathLength: on(floor), opacity: on(floor) }} transition={t({ duration: 0.9, delay: floor ? 0.35 : 0, ease: 'easeInOut' })} stroke="var(--fg)" strokeWidth={3} strokeLinecap="round" />
        {/* 成功の線 */}
        <motion.line initial={false} animate={{ x1: L.left, x2: L.right, y1: yG, y2: yG, opacity: on(goal) }} transition={tr} stroke="var(--accent)" strokeWidth={4} strokeDasharray="14 10" strokeLinecap="round" />
        {/* 横軸 */}
        <motion.line initial={false} animate={{ x1: L.left, x2: L.right, y1: L.bottom, y2: L.bottom, opacity: on(xAxis) }} transition={tr} stroke="var(--fg-sub)" strokeWidth={3} />
        {MONTHS.map((m) => (
          <motion.line key={m.label} initial={false} animate={{ x1: xOf(m.day, L), x2: xOf(m.day, L), y1: L.bottom, y2: L.bottom + 8, opacity: on(xAxis) }} transition={tr} stroke="var(--fg-sub)" strokeWidth={2} />
        ))}
      </svg>

      {/* 数字 */}
      {TICKS.map((v) => (
        <motion.div key={v} initial={false} animate={{ left: numLeft, top: yOf(v, L) - 14 }} transition={tr} style={{ ...text, width: 80, textAlign: 'right', fontSize: 20, fontWeight: 600, color: 'var(--fg-sub)', lineHeight: '28px' }}>
          {v}
        </motion.div>
      ))}
      <motion.div initial={false} animate={{ left: numLeft, top: L.top - 36, opacity: on(caption) }} transition={tr} style={{ ...text, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>
        対局場の点数
      </motion.div>

      {/* 基準のソフトのラベル。グラフの線とぶつからないよう、右端の線の上に置く */}
      <motion.div initial={false} animate={{ left: L.right - 520, top: yB - 50, opacity: on(basis) }} transition={tr} style={{ ...text, width: 520, textAlign: 'right' }}>
        <span style={chip}>
          <b style={{ marginRight: 12, fontWeight: 800 }}>{BASIS}</b>
          基準のソフト（2016 年 世界 2 位）
        </span>
      </motion.div>
      {/* いまのトップのラベル。帯の中に置く */}
      <motion.div initial={false} animate={{ left: L.left + 20, top: yT0, height: yT1 - yT0, opacity: on(band) }} transition={tr} style={{ ...text, lineHeight: `${Math.round(yT1 - yT0)}px`, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>
        いまのトップ {TOP[0]}〜{TOP[1]}
      </motion.div>
      {/* 成功の線のラベル */}
      <motion.div initial={false} animate={{ left: L.left + 20, top: yG - 40, opacity: on(goal) }} transition={tr} style={{ ...text, fontSize: 24, fontWeight: 800, color: 'var(--accent-strong)' }}>
        この実験の成功の線 {GOAL}
      </motion.div>
      {/* AI が自分で届いた線のラベル。線の下、右寄せ (左には最初の点のラベルがある) */}
      <motion.div initial={false} animate={{ left: L.right - 520, top: yF + 8, opacity: on(floor) }} transition={t({ delay: floor ? 0.95 : 0 })} style={{ ...text, width: 520, textAlign: 'right', fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
        <b style={{ marginRight: 12, fontWeight: 800 }}>{FLOOR}</b>
        AI が自分で届いた線（7 月末）
      </motion.div>
      {/* 人が引き上げた範囲のラベル。帯の左上 (グラフの線は 8 月の間はまだ低い) */}
      <motion.div initial={false} animate={{ left: L.left + 30, top: yG + 16, opacity: on(lift) }} transition={t({ delay: lift ? 0.5 : 0 })} style={{ ...text, fontSize: 24, fontWeight: 800, color: 'var(--accent-strong)' }}>
        人が方向性を示して
        <br />
        引き上げた範囲
      </motion.div>
      {/* 月 */}
      {MONTHS.map((m) => (
        <motion.div key={m.label} initial={false} animate={{ left: xOf(m.day, L) - 40, top: L.bottom + 12, opacity: on(xAxis) }} transition={tr} style={{ ...text, width: 80, textAlign: 'center', fontSize: 20, fontWeight: 600, color: 'var(--fg-sub)' }}>
          {m.label}
        </motion.div>
      ))}
    </>
  )
}

type SeriesProps = {
  L: Layout
  /** 線を引き終えた姿か。false なら最初の点だけ */
  drawn: boolean
  /** 線を引く秒数 */
  dur?: number
  /** 最初の点を見せるか (シーンに入ってから置くときに使う) */
  firstOn?: boolean
  /** 最初の点に「10 年前の世界 2 位にも 勝つことがある」を添える。添えるときはラベルを点の右に置き、外すと点の下へ下がる (3200 の線に場所を譲る) */
  note?: boolean
}

/** 折れ線。左から右へ描かれ、最高点と最後の点に印とラベルが付く */
export function Series({ L, drawn, dur = 2.2, firstOn = true, note = false }: SeriesProps) {
  const d = POINTS.map((p, i) => `${i ? 'L' : 'M'} ${xOf(p.day, L).toFixed(1)} ${yOf(p.v, L).toFixed(1)}`).join(' ')
  const tr = t()
  const same = PEAK.date === LAST.date
  const pt = (p: Point) => ({ cx: xOf(p.day, L), cy: yOf(p.v, L) })
  const first = pt(FIRST)
  const peak = pt(PEAK)
  const last = pt(LAST)
  return (
    <>
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        <motion.path
          d={d}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={false}
          animate={{ d, pathLength: drawn ? 1 : 0, opacity: drawn ? 1 : 0 }}
          transition={t({ duration: drawn ? dur : 0.4, ease: 'easeInOut' })}
        />
        <motion.circle initial={false} animate={{ ...first, r: 8, opacity: firstOn ? 1 : 0 }} transition={t({ delay: firstOn ? 0.3 : 0 })} fill="var(--fg)" />
        <motion.circle initial={false} animate={{ ...peak, r: 9, opacity: drawn ? 1 : 0 }} transition={t({ delay: drawn ? dur - 0.35 : 0, duration: 0.4 })} fill="var(--accent)" />
        {!same && <motion.circle initial={false} animate={{ ...last, r: 7, opacity: drawn ? 1 : 0 }} transition={t({ delay: drawn ? dur : 0, duration: 0.4 })} fill="var(--fg)" />}
      </svg>

      {/* 最初の点のラベル。注を添えるときは点の右に 2 行、外したら点の下に 1 行 */}
      <motion.div initial={false} animate={{ left: first.cx + 22, top: note ? first.cy - 30 : first.cy + 8, opacity: firstOn ? 1 : 0 }} transition={t({ delay: firstOn ? 0.5 : 0 })} style={{ ...text, fontSize: 22, fontWeight: 700 }}>
        {jpDate(FIRST)}　<b style={{ fontWeight: 800 }}>{FIRST.v}</b>
        <AnimatePresence initial={false}>
          {note && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t({ delay: 0.4 }) }} exit={{ opacity: 0, transition: t({ duration: 0.2 }) }} style={{ color: 'var(--fg-sub)' }}>
              10 年前の世界 2 位にも 勝つことがある
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {/* 最高点のラベル (点の左上) */}
      <motion.div
        initial={false}
        animate={{ x: '-100%', left: peak.cx - 12, top: peak.cy - 48, opacity: drawn ? 1 : 0 }}
        transition={drawn ? t({ delay: dur - 0.2, duration: 0.4 }) : tr}
        style={{ ...text, fontSize: 22, fontWeight: 700, color: 'var(--accent-strong)' }}
      >
        {jpDate(PEAK)}　<b style={{ fontWeight: 800, fontSize: 26 }}>{PEAK.v}</b>
      </motion.div>
      {/* 最後の点のラベル (点の右に 2 行) */}
      {!same && (
        <motion.div
          initial={false}
          animate={{ left: last.cx + 14, top: last.cy - 26, opacity: drawn ? 1 : 0 }}
          transition={drawn ? t({ delay: dur + 0.1, duration: 0.4 }) : tr}
          style={{ ...text, fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}
        >
          {jpDate(LAST)}
          <br />
          <b style={{ fontWeight: 800, fontSize: 24 }}>{LAST.v}</b>
        </motion.div>
      )}
    </>
  )
}
