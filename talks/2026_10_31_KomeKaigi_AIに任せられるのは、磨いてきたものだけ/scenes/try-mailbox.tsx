// 利きの数は強さの手がかりになり、評価に入れたら +30 点。でも Bitboard の上で利きを持つと遅く、2 回とも合格の線に届かない。
// うまくいっている盤を作り直すと決めた。左の配列の図 (利きの数が重なる) は 4 状態とも同じ位置に残し、右側だけが変わる
// 局面は 7六歩 3四歩 2六歩 4四歩 2五歩 3三角 の 6 手目まで (利きの数に変化が出る局面)
// 動きの役割: オブジェクトの変化 (数字が重なる、1 升を囲む) → 強調 (+30 点の札) → 関係性の変化 (札が退いて棒が出る → 2 つの判断を並べる)
import { Headline, Morph, Reveal, defineScene, t, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import { Board, START, attackCounts, cellAt, move, type Geom, type Piece } from './_board'

const CELL = 48
/** 盤は左に置いたまま動かさない。見出しが 2 行になるので、盤の上端は 200 より下 */
const G: Geom = { x: 96, y: 206, cell: CELL }

let pos: readonly Piece[] = START
pos = move(pos, [2, 6], [2, 5]) // 7六歩
pos = move(pos, [6, 2], [6, 3]) // 3四歩
pos = move(pos, [7, 6], [7, 5]) // 2六歩
pos = move(pos, [5, 2], [5, 3]) // 4四歩
pos = move(pos, [7, 5], [7, 4]) // 2五歩
pos = move(pos, [7, 1], [6, 2]) // 3三角
export const POSITION = pos

const COUNTS = attackCounts(POSITION)

/** 囲む升。相手 2 枚・自分 1 枚になっている升のうち、盤の右端に近いもの (右の文言までの線が短くて済む) */
const HOT = (() => {
  let best: { col: number; row: number } | null = null
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (COUNTS.gote[r][c] === 2 && COUNTS.sente[r][c] === 1 && (!best || c > best.col)) best = { col: c, row: r }
  return best ?? { col: 7, row: 3 }
})()

const sub = { color: 'var(--fg-sub)' } as const
const accent = { color: 'var(--accent-strong)' } as const

/** 升ごとの利きの数。左上に相手 (後手)、右下に自分 (先手) */
function Counts() {
  const nodes = []
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const at = cellAt(G, c, r)
      const e = COUNTS.gote[r][c]
      const o = COUNTS.sente[r][c]
      nodes.push(
        <g key={`${c},${r}`}>
          <text x={at.x + CELL * 0.2} y={at.y + CELL * 0.2} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 18, fontWeight: 700, fill: e ? 'var(--fg-sub)' : 'var(--muted)' }}>
            {e}
          </text>
          <text x={at.x + CELL * 0.8} y={at.y + CELL * 0.8} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 18, fontWeight: 800, fill: o ? 'var(--fg)' : 'var(--muted)' }}>
            {o}
          </text>
        </g>,
      )
    }
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t({ delay: 0.3 })}>
      {nodes}
    </motion.g>
  )
}

// ---------------------------------------------------------------- 右側
const PANEL = 600
const PANEL_W = 584

/** 囲んだ升から右の文言へ引く線の端 */
const HOT_CELL = cellAt(G, HOT.col, HOT.row)
const HOT_MID_Y = HOT_CELL.y + CELL / 2
const LEADER_END = 556

/** 1 升を囲む枠と、右の文言への線。最初の状態だけ (強調色はここ 1 か所) */
function HotFrame() {
  const step = useStep()
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: step === 0 ? 1 : 0 }} transition={t({ delay: step === 0 ? 0.9 : 0, duration: step === 0 ? 0.5 : 0.3 })} style={{ stroke: 'var(--accent)', fill: 'none', strokeLinecap: 'round' }}>
      <rect x={HOT_CELL.x - 2} y={HOT_CELL.y - 2} width={CELL + 4} height={CELL + 4} rx={5} style={{ strokeWidth: 4 }} />
      <line x1={HOT_CELL.x + CELL + 4} y1={HOT_MID_Y} x2={LEADER_END} y2={HOT_MID_Y} style={{ strokeWidth: 3 }} />
    </motion.g>
  )
}

/** 速さの棒。stride16 の棒と同じ見た目 (左にラベル、右へ伸びる棒、強調色の破線が合格の線)。ここは「遅くなった割合」なので意味は違う */
const BAR_X0 = 800
const UNIT = 64 // 1% あたりの px
const PASS = 1.0
const LINE_X = BAR_X0 + PASS * UNIT
const BARS_TITLE_TOP = 340
const BARS_TOP = 404
const ROW = 70
const BAR_H = 36

const BARS = [
  { label: '1 回目', value: 4.3 },
  { label: '2 回目', value: 3.4 },
]

function SlowBars() {
  const bottom = BARS_TOP + ROW * BARS.length
  return (
    <>
      <div style={{ position: 'absolute', left: PANEL, top: BARS_TITLE_TOP, fontSize: 22, fontWeight: 700, ...sub, whiteSpace: 'nowrap' }}>遅くなった割合（Bitboard の盤のまま）</div>
      {/* 合格の線 */}
      <div style={{ position: 'absolute', left: LINE_X - 2, top: BARS_TOP - 10, height: bottom - BARS_TOP + 10, width: 0, borderLeft: '4px dashed var(--accent)' }} />
      <div style={{ position: 'absolute', left: PANEL, width: LINE_X - PANEL - 12, top: BARS_TITLE_TOP + 32, textAlign: 'right', fontSize: 22, fontWeight: 800, ...accent, whiteSpace: 'nowrap' }}>合格の線: −1.0% まで</div>
      {/* 0% の目印 */}
      <div style={{ position: 'absolute', left: BAR_X0 - 1, top: BARS_TOP - 4, height: bottom - BARS_TOP + 4, width: 2, background: 'var(--muted)' }} />
      <div style={{ position: 'absolute', left: BAR_X0 - 40, width: 80, top: bottom + 6, textAlign: 'center', fontSize: 18, fontWeight: 700, ...sub }}>0%</div>
      {BARS.map((r, i) => {
        const top = BARS_TOP + i * ROW + (ROW - BAR_H) / 2
        const delay = 0.3 + i * 0.5
        return (
          <div key={r.label} style={{ position: 'absolute', left: PANEL, top, height: BAR_H, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: BAR_X0 - PANEL, fontSize: 26, fontWeight: 800, color: 'var(--fg)' }}>{r.label}</div>
            <motion.div style={{ height: BAR_H, borderRadius: 6, background: 'var(--muted)' }} initial={{ width: 0 }} animate={{ width: r.value * UNIT }} transition={t({ duration: 1.0, delay })} />
            <motion.div style={{ marginLeft: 12, fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap', color: 'var(--fg)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t({ delay: delay + 0.8 })}>
              −{r.value.toFixed(1)}%
            </motion.div>
          </div>
        )
      })}
    </>
  )
}

/** +30 点の札。2 つ目の状態で大きく出て、3 つ目で上へ小さく退く */
const CARD_BOX = [
  { left: PANEL, top: 330, width: PANEL_W, height: 160 },
  { left: PANEL, top: 330, width: PANEL_W, height: 160 },
  { left: PANEL, top: G.y, width: PANEL_W, height: 76 },
] as const

function PlusCard() {
  const step = useStep()
  const big = step < 2
  const dur = `${(t() as { duration?: number }).duration ?? 0.75}s`
  return (
    <Morph box={CARD_BOX} tone={['', 'hot', '']} style={{ padding: '0 32px' }} inner={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ fontSize: big ? 26 : 22, fontWeight: 700, color: big ? 'var(--fg)' : 'var(--fg-sub)', transition: `font-size ${dur}, color 0.5s`, whiteSpace: 'nowrap' }}>利きの数を評価に入れる</div>
      <div style={{ fontSize: big ? 64 : 30, fontWeight: 800, color: big ? 'var(--accent-strong)' : 'var(--fg)', transition: `font-size ${dur}, color 0.5s`, whiteSpace: 'nowrap', lineHeight: 1 }}>+30 点</div>
    </Morph>
  )
}

const JUDGE = { left: PANEL, width: PANEL_W, height: 150 }

function TryMailbox() {
  return (
    <>
      <Headline>{['升ごとの利きの数は 強さの手がかりになります', '利きの数を評価に入れたら 30 点強くなりました', 'でも Bitboard の上で 利きを持つと遅くなります', 'うまくいっている盤を 作り直すと決めました']}</Headline>

      <Board {...G} pieces={POSITION} look="array">
        <Counts />
        <HotFrame />
      </Board>

      {/* 囲んだ升の中身 */}
      <Reveal at={0} until={1} delay={1.1} style={{ position: 'absolute', left: LEADER_END + 16, top: HOT_MID_Y - 24, height: 48, display: 'flex', alignItems: 'center', gap: 20, fontSize: 32, fontWeight: 800, whiteSpace: 'nowrap' }}>
        <span>相手 2 枚</span>
        <span>自分 1 枚</span>
      </Reveal>

      {/* 凡例 */}
      <Reveal at={0} until={1} delay={0.6} style={{ position: 'absolute', left: LEADER_END + 16, top: 452, display: 'grid', gap: 16, fontSize: 24, fontWeight: 700, ...sub, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 700, ...sub, width: 24, textAlign: 'center' }}>2</span>左上: 相手の駒が届いている数
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--fg)', width: 24, textAlign: 'center' }}>1</span>右下: 自分の駒が届いている数
        </div>
      </Reveal>

      {/* +30 点の札 (2 つ目〜3 つ目) と、遅くなった割合の棒 (3 つ目) */}
      <Reveal at={1} until={3} y={0} delay={0.4} style={{ position: 'absolute', inset: 0 }}>
        <PlusCard />
      </Reveal>
      <Reveal at={2} until={3} y={0} delay={0.5} style={{ position: 'absolute', inset: 0 }}>
        <SlowBars />
      </Reveal>

      {/* 2 つの判断 */}
      <Reveal at={3} delay={0.5} className="card" style={{ position: 'absolute', ...JUDGE, top: 246, padding: '0 32px', gap: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, ...sub, flex: 'none', width: 44 }}>AI</div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.5 }}>
          書き直す範囲が
          <br />
          いちばん大きいので見送る
        </div>
      </Reveal>
      <Reveal at={3} delay={1.1} className="card tone-hot" style={{ position: 'absolute', ...JUDGE, top: 436, padding: '0 32px', gap: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, ...accent, flex: 'none', width: 44 }}>私</div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.5, ...accent }}>
          Claude Code がいるからこそ
          <br />
          試せる
        </div>
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'try-mailbox', steps: 4, Component: TryMailbox })
