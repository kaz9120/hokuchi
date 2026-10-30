// Claude Code が作った、壁で囲んだ 11×13 の盤は速さの合格の線に届かなかった。1 列を 16 升にすると割り算がいらなくなり、合格した
// 左に盤 (9×9 の外側を灰色の壁の升で囲む)、右に速さの比の棒。盤は 11×13 から 16×16 に広がり、寸法線の数字が付いていく
// 動きの役割: オブジェクトの変化 (壁が付く、棒が伸びる、盤が広がる)
import { Headline, Reveal, defineScene, t, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import { Board, START, WALLS_11X13, WALLS_16X16, type Geom, type Walls } from './_board'

/** 壁を含めた盤の左上。11×13 は升 34px、16×16 は升 28px で、どちらも左下の章の案内 (y 676〜) に掛からない高さに収める */
const ORIGIN11 = { x: 120, y: 244 }
const ORIGIN16 = { x: 120, y: 200 }
const CELL11 = 34
const CELL16 = 28
const G11: Geom = { x: ORIGIN11.x + WALLS_11X13.left * CELL11, y: ORIGIN11.y + WALLS_11X13.top * CELL11, cell: CELL11 }
const G16: Geom = { x: ORIGIN16.x + WALLS_16X16.left * CELL16, y: ORIGIN16.y + WALLS_16X16.top * CELL16, cell: CELL16 }

const PANEL = 660
const accent = { color: 'var(--accent-strong)' } as const
const sub = { color: 'var(--fg-sub)' } as const

/** 壁を含めた盤の外のり */
function extent(origin: { x: number; y: number }, cell: number, walls: Walls) {
  const cols = 9 + walls.left + walls.right
  const rows = 9 + walls.top + walls.bottom
  return { left: origin.x, top: origin.y, right: origin.x + cols * cell, bottom: origin.y + rows * cell, cols, rows }
}

// ---------------------------------------------------------------- 寸法線
const TICK = 10

/** 寸法線。両端に短い線を付け、盤が広がると線も数字も付いていく */
function Dimension({ a, b, label, labelAt, delay = 0 }: { a: { x: number; y: number }; b: { x: number; y: number }; label: string; labelAt: { x: number; y: number }; delay?: number }) {
  const vertical = a.x === b.x
  const tr = t()
  return (
    <motion.g style={{ stroke: 'var(--fg)', strokeWidth: 3, strokeLinecap: 'round' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t({ duration: 0.4, delay })}>
      <motion.line initial={false} animate={{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }} transition={tr} />
      <motion.line initial={false} animate={vertical ? { x1: a.x - TICK, y1: a.y, x2: a.x + TICK, y2: a.y } : { x1: a.x, y1: a.y - TICK, x2: a.x, y2: a.y + TICK }} transition={tr} />
      <motion.line initial={false} animate={vertical ? { x1: b.x - TICK, y1: b.y, x2: b.x + TICK, y2: b.y } : { x1: b.x, y1: b.y - TICK, x2: b.x, y2: b.y + TICK }} transition={tr} />
      {/* 数字は g の移動で動かす (motion の x/y は SVG でも transform になる) */}
      <motion.g initial={false} animate={{ x: labelAt.x, y: labelAt.y }} transition={tr}>
        <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 28, fontWeight: 800, fill: 'var(--fg)', stroke: 'none' }}>
          {label}
        </text>
      </motion.g>
    </motion.g>
  )
}

// ---------------------------------------------------------------- 速さの比の棒
const PASS = 1.2
const BAR_X0 = 800
const UNIT = 250
const LINE_X = BAR_X0 + PASS * UNIT
const BARS_TOP = 250
const ROW = 70
const BAR_H = 36

type BarRow = { label: string; value: number; over: boolean; hot: boolean; at: number }

function SpeedBars({ rows }: { rows: BarRow[] }) {
  const step = useStep()
  const barsTop = BARS_TOP + 62
  const bottom = barsTop + ROW * rows.length
  return (
    <>
      <div style={{ position: 'absolute', left: PANEL, top: BARS_TOP, fontSize: 22, fontWeight: 700, ...sub }}>盤の操作にかかる時間（Bitboard を 1 とする）</div>
      {/* 合格の線 */}
      <div style={{ position: 'absolute', left: LINE_X - 2, top: barsTop - 10, height: bottom - barsTop + 10, width: 0, borderLeft: '4px dashed var(--accent)' }} />
      <div style={{ position: 'absolute', left: LINE_X - 400, width: 390, top: BARS_TOP + 32, textAlign: 'right', fontSize: 22, fontWeight: 800, ...accent, lineHeight: 1.3, whiteSpace: 'nowrap' }}>合格の線: Bitboard の 1.2 倍の時間まで</div>
      {/* Bitboard = 1 の目印 */}
      <div style={{ position: 'absolute', left: BAR_X0 + UNIT - 1, top: barsTop - 4, height: bottom - barsTop + 4, width: 2, background: 'var(--muted)' }} />
      <div style={{ position: 'absolute', left: BAR_X0 + UNIT - 80, width: 160, top: bottom + 6, textAlign: 'center', fontSize: 18, fontWeight: 700, ...sub, whiteSpace: 'nowrap' }}>Bitboard = 1</div>
      {rows.map((r, i) => {
        const shown = step >= r.at
        const width = shown ? r.value * UNIT + (r.over ? 6 : 0) : 0
        const top = barsTop + i * ROW + (ROW - BAR_H) / 2
        return (
          <div key={r.label} style={{ position: 'absolute', left: PANEL, top, height: BAR_H, display: 'flex', alignItems: 'center', opacity: shown ? 1 : 0, transition: 'opacity 0.4s' }}>
            <div style={{ width: BAR_X0 - PANEL, fontSize: 26, fontWeight: 800, color: r.hot ? 'var(--fg)' : 'var(--fg-sub)', transition: 'color 0.5s' }}>{r.label}</div>
            <motion.div style={{ height: BAR_H, borderRadius: 6, background: r.hot ? 'var(--accent)' : 'var(--muted)', transition: 'background 0.5s' }} initial={false} animate={{ width }} transition={t({ duration: 1.0, delay: shown && step === r.at ? 0.4 : 0 })} />
            {/* 線より短い棒の数字は、線と重ならないよう線の右へ出す */}
            <motion.div style={{ marginLeft: Math.max(12, LINE_X + 14 - (BAR_X0 + r.value * UNIT)), fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap', color: r.hot ? 'var(--accent-strong)' : 'var(--fg-sub)', transition: 'color 0.5s' }} initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={t({ delay: shown && step === r.at ? 1.2 : 0 })}>
              {r.value.toFixed(2)} 倍
            </motion.div>
          </div>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------- シーン
function Stride16() {
  const step = useStep()
  const wide = step >= 2
  const g = wide ? G16 : G11
  const walls = wide ? WALLS_16X16 : WALLS_11X13
  const e = wide ? extent(ORIGIN16, CELL16, WALLS_16X16) : extent(ORIGIN11, CELL11, WALLS_11X13)
  const rows: BarRow[] = [
    { label: '11×13', value: 1.2, over: true, hot: step < 3, at: 1 },
    { label: '16×16', value: 1.1, over: false, hot: true, at: 3 },
  ]
  return (
    <>
      <Headline>{['Claude Code は 壁で囲んだ 11×13 の盤を作りました', '速さの合格の線に 届きませんでした', '私は 1 列を 16 升にしてほしいと言いました', '16×16 にしたら 合格しました']}</Headline>

      <Board {...g} walls={walls} maxWalls={WALLS_16X16} pieces={START} look="array">
        {/* 寸法線。横は上、縦は右 */}
        <Dimension a={{ x: e.left, y: e.top - 18 }} b={{ x: e.right, y: e.top - 18 }} label={String(e.cols)} labelAt={{ x: (e.left + e.right) / 2, y: e.top - 44 }} delay={0.6} />
        <Dimension a={{ x: e.right + 22, y: e.top }} b={{ x: e.right + 22, y: e.bottom }} label={String(e.rows)} labelAt={{ x: e.right + 58, y: (e.top + e.bottom) / 2 }} delay={0.9} />
      </Board>

      {/* 右: 最初は壁の説明、次から速さの棒 */}
      <Reveal at={0} until={1} delay={0.6} style={{ position: 'absolute', left: PANEL, top: 330, display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, fontWeight: 700, ...sub }}>
        <span style={{ display: 'inline-block', width: 34, height: 34, borderRadius: 3, background: 'color-mix(in srgb, var(--muted) 42%, transparent)', border: '1px solid color-mix(in srgb, var(--muted) 60%, transparent)' }} />
        灰色の升 = 壁
      </Reveal>
      <Reveal at={1} y={0} style={{ position: 'absolute', inset: 0 }}>
        <SpeedBars rows={rows} />
      </Reveal>

      {/* 16 升にする理由の 1 文 */}
      <Reveal at={2} delay={0.9} style={{ position: 'absolute', left: PANEL, top: 528, fontSize: 30, fontWeight: 800, lineHeight: 1.5 }}>
        11 で割る計算が
        <br />
        ビットをずらすだけになる
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'stride16', steps: 4, Component: Stride16 })
