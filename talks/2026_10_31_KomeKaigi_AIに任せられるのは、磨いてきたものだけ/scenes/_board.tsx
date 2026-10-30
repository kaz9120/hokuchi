// 将棋盤の部品。board-memory から individuality まで、同じ盤がシーンをまたいで生き続けて見えるように、
// 位置・升の大きさ・壁・見た目 (実物の盤 / メモリの区画 / 配列) を props で切り替える。
// 升は SVG の rect で、位置と大きさは CSS の transition で移す (静止画モードでは base.css が transition を切る)
import { STATIC, t } from '@hokuchi/stage'
import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'

export type Side = 'sente' | 'gote'
export type Piece = { col: number; row: number; side: Side; kind: string }
/** 壁の厚さ (升の数)。盤の 9×9 の外側に足す */
export type Walls = { top: number; bottom: number; left: number; right: number }
export const NO_WALLS: Walls = { top: 0, bottom: 0, left: 0, right: 0 }
/** Claude Code が作った 11×13 の盤。上下 1、左右 2 */
export const WALLS_11X13: Walls = { top: 1, bottom: 1, left: 2, right: 2 }
/** 16×16 の盤。11×13 と同じ升が同じ列・行の番号になるように、上と左は 11×13 と同じ厚さにし、下と右を厚くする */
export const WALLS_16X16: Walls = { top: 1, bottom: 6, left: 2, right: 5 }

export const EASE_CSS = 'cubic-bezier(0.25, 0.8, 0.35, 1)'
/** CSS の transition。時間は t() と同じ (テーマの倍率とトークの tempo を掛けたもの) にして、motion で動く駒と升の動きを揃える */
const trans = (...props: string[]) => {
  const dur = `${(t() as { duration?: number }).duration ?? 0.75}s`
  return props.map((p) => `${p} ${dur} ${EASE_CSS}`).join(', ')
}

// ---------------------------------------------------------------- 局面
const BACK = ['香', '桂', '銀', '金', '王', '金', '銀', '桂', '香']
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** 開始局面 (平手)。col は左から 0〜8 (9 筋〜1 筋)、row は上から 0〜8 (一段〜九段) */
export const START: readonly Piece[] = [
  ...BACK.map((kind, col): Piece => ({ col, row: 0, side: 'gote', kind })),
  { col: 1, row: 1, side: 'gote', kind: '飛' },
  { col: 7, row: 1, side: 'gote', kind: '角' },
  ...range(9).map((col): Piece => ({ col, row: 2, side: 'gote', kind: '歩' })),
  ...range(9).map((col): Piece => ({ col, row: 6, side: 'sente', kind: '歩' })),
  { col: 1, row: 7, side: 'sente', kind: '角' },
  { col: 7, row: 7, side: 'sente', kind: '飛' },
  ...BACK.map((kind, col): Piece => ({ col, row: 8, side: 'sente', kind: kind === '王' ? '玉' : kind })),
]

/** 駒を動かす (取る手は使わない) */
export function move(pieces: readonly Piece[], from: [number, number], to: [number, number]): Piece[] {
  return pieces.map((p) => (p.col === from[0] && p.row === from[1] ? { ...p, col: to[0], row: to[1] } : p))
}

/** 利きの向き。先手の向き (上が前) で書き、後手は上下を反転する */
const STEPS: Record<string, { dx: number; dy: number; slide?: boolean }[]> = {
  歩: [{ dx: 0, dy: -1 }],
  香: [{ dx: 0, dy: -1, slide: true }],
  桂: [{ dx: -1, dy: -2 }, { dx: 1, dy: -2 }],
  銀: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }],
  金: [{ dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
  王: [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ dx, dy }))).filter((d) => d.dx || d.dy),
  飛: [{ dx: 0, dy: -1, slide: true }, { dx: 0, dy: 1, slide: true }, { dx: -1, dy: 0, slide: true }, { dx: 1, dy: 0, slide: true }],
  角: [{ dx: -1, dy: -1, slide: true }, { dx: 1, dy: -1, slide: true }, { dx: -1, dy: 1, slide: true }, { dx: 1, dy: 1, slide: true }],
}
STEPS.玉 = STEPS.王

const inBoard = (c: number, r: number) => c >= 0 && c < 9 && r >= 0 && r < 9

/** 1 枚の駒が利いている升 (駒に当たった升は含む、その先は含まない) */
export function reach(pieces: readonly Piece[], p: Piece): [number, number][] {
  const out: [number, number][] = []
  const sign = p.side === 'sente' ? 1 : -1
  for (const s of STEPS[p.kind] ?? []) {
    let c = p.col + s.dx
    let r = p.row + s.dy * sign
    while (inBoard(c, r)) {
      out.push([c, r])
      if (!s.slide || pieces.some((q) => q.col === c && q.row === r)) break
      c += s.dx
      r += s.dy * sign
    }
  }
  return out
}

/** 升ごとの利きの数。[row][col] */
export function attackCounts(pieces: readonly Piece[]): Record<Side, number[][]> {
  const counts: Record<Side, number[][]> = { sente: range(9).map(() => range(9).map(() => 0)), gote: range(9).map(() => range(9).map(() => 0)) }
  for (const p of pieces) for (const [c, r] of reach(pieces, p)) counts[p.side][r][c]++
  return counts
}

// ---------------------------------------------------------------- 盤
export type Geom = { x: number; y: number; cell: number }
/** 升の左上の座標 (ステージ px)。col・row は 9×9 の左上を 0 とし、壁は負の数や 9 以上 */
export const cellAt = (g: Geom, col: number, row: number) => ({ x: g.x + col * g.cell, y: g.y + row * g.cell })
export const centerAt = (g: Geom, col: number, row: number) => ({ x: g.x + (col + 0.5) * g.cell, y: g.y + (row + 0.5) * g.cell })

export type Look = 'board' | 'memory' | 'array'

type BoardProps = Geom & {
  walls?: Walls
  /** この盤がシーンの中で到達する最大の壁。先に描いておき、透明度で出し入れする (transition で動かすため) */
  maxWalls?: Walls
  pieces?: readonly Piece[]
  /** board: 実物の盤 (五角形の駒)。memory: 隙間のある区画 (駒は消える)。array: 升に漢字 1 文字 */
  look?: Look
  /** 通し番号。all: 全升、highlight: 光る升だけ。縦に数える (列ごとに行の数ぶん進む)。番号は壁を含めた列・行から求める */
  numbers?: 'none' | 'all' | 'highlight'
  /** 光る升。壁を含めた 0 始まりの列・行 */
  highlight?: { col: number; row: number }
  /** 通し番号を振るときの壁。省略時は walls。盤を広げながら番号を消すとき、消える途中で番号が変わらないように前の壁を渡す */
  numbering?: Walls
  /** 盤の外側に列と行の番号を出す */
  indices?: boolean
  /** 盤全体の色。accent は配列盤を推すとき */
  tone?: 'base' | 'accent'
  opacity?: number
  /** 升の中の文字を出さない (縮めたときに 18px を割らないため) */
  hideKanji?: boolean
  /** 駒の見た目を上書きする (board-memory の読みの動きなど)。null を返すと既定 */
  pieceMotion?: (p: Piece) => { x: number[]; y: number[]; times: number[]; duration: number; delay: number } | null
  /** 盤の上に重ねるもの (SVG の要素。ステージ座標) */
  children?: ReactNode
}

const hiddenText: CSSProperties = { opacity: 0 }

export function Board({
  x,
  y,
  cell,
  walls = NO_WALLS,
  maxWalls = walls,
  pieces = [],
  look = 'board',
  numbers = 'none',
  highlight,
  numbering,
  indices = false,
  tone = 'base',
  opacity = 1,
  hideKanji = false,
  pieceMotion,
  children,
}: BoardProps) {
  const g: Geom = { x, y, cell }
  const rows = 9 + walls.top + walls.bottom
  const cols = 9 + walls.left + walls.right
  const gap = look === 'memory' ? Math.max(3, cell * 0.08) : look === 'array' ? 1.5 : 0
  const rx = look === 'memory' ? Math.min(8, cell * 0.16) : look === 'array' ? 3 : 0
  const accent = tone === 'accent'
  const cellFill = look === 'board' ? 'var(--accent-faint)' : accent ? 'var(--accent-bg)' : 'var(--surface)'
  const cellStroke = look === 'board' ? 'var(--fg-sub)' : accent ? 'var(--accent)' : 'var(--line)'
  const cellStrokeW = look === 'board' ? 1.2 : 2
  const numberSize = Math.max(18, Math.min(20, cell * 0.5))
  const kanjiSize = Math.max(18, cell * (look === 'board' ? 0.5 : 0.46))

  const cells: ReactNode[] = []
  for (let r = -maxWalls.top; r < 9 + maxWalls.bottom; r++)
    for (let c = -maxWalls.left; c < 9 + maxWalls.right; c++) {
      const isBoard = inBoard(c, r)
      const shown = isBoard || (r >= -walls.top && r < 9 + walls.bottom && c >= -walls.left && c < 9 + walls.right)
      const colIdx = c + walls.left
      const rowIdx = r + walls.top
      const hot = !!highlight && highlight.col === colIdx && highlight.row === rowIdx
      const nw = numbering ?? walls
      const n = (c + nw.left) * (9 + nw.top + nw.bottom) + (r + nw.top)
      const showNumber = shown && numbers === 'all'
      const at = cellAt(g, c, r)
      cells.push(
        <g key={`${c},${r}`} style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: trans('transform', 'opacity'), opacity: shown ? 1 : 0 }}>
          <rect
            x={gap / 2}
            y={gap / 2}
            rx={rx}
            style={{
              width: cell - gap,
              height: cell - gap,
              fill: hot ? 'var(--accent-bg)' : isBoard ? cellFill : 'color-mix(in srgb, var(--muted) 42%, transparent)',
              stroke: hot ? 'var(--accent)' : isBoard ? cellStroke : 'color-mix(in srgb, var(--muted) 60%, transparent)',
              strokeWidth: hot ? 3 : isBoard ? cellStrokeW : 1,
              transition: trans('width', 'height', 'fill', 'stroke'),
            }}
          />
          {numbers !== 'none' && (
            <text
              x={cell / 2}
              y={cell / 2}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontSize: numberSize,
                fontWeight: hot ? 800 : 700,
                fill: hot ? 'var(--accent-strong)' : isBoard ? 'var(--fg)' : 'var(--fg-sub)',
                transition: trans('opacity', 'fill'),
                ...(showNumber ? {} : hiddenText),
              }}
            >
              {n}
            </text>
          )}
        </g>,
      )
    }

  // 光る升だけに番号を出すとき (16×16 の小さな升) は、升を一回り大きく描いて番号を読めるようにする
  const lens = numbers === 'highlight' && highlight && (() => {
    const c = highlight.col - walls.left
    const r = highlight.row - walls.top
    const at = centerAt(g, c, r)
    const size = Math.max(cell, 44)
    return (
      <g style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: trans('transform') }}>
        <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={4} style={{ fill: 'var(--accent-bg)', stroke: 'var(--accent)', strokeWidth: 3 }} />
        <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 20, fontWeight: 800, fill: 'var(--accent-strong)' }}>
          {highlight.col * rows + highlight.row}
        </text>
      </g>
    )
  })()

  // 盤の外枠 (実物の盤らしく、9×9 の縁を太く)
  const frame = look === 'board' && (
    <rect
      x={x}
      y={y}
      style={{ width: cell * 9, height: cell * 9, fill: 'none', stroke: 'var(--fg-sub)', strokeWidth: 3, transition: trans('x', 'y', 'width', 'height') }}
    />
  )

  // 列の番号はアクセント色、行の番号は墨色で強調する。stride16 で列と行を色で見分けるため
  const idx = indices && (
    <>
      {range(cols).map((ci) => {
        const at = centerAt(g, ci - walls.left, -walls.top)
        const hot = highlight?.col === ci
        return (
          <text key={`c${ci}`} x={at.x} y={y - walls.top * cell - 16} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 18, fontWeight: hot ? 800 : 600, fill: hot ? 'var(--accent-strong)' : 'var(--fg-sub)', transition: trans('fill') }}>
            {ci}
          </text>
        )
      })}
      {range(rows).map((ri) => {
        const at = centerAt(g, -walls.left, ri - walls.top)
        const hot = highlight?.row === ri
        return (
          <text key={`r${ri}`} x={x - walls.left * cell - 16} y={at.y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: hot ? 20 : 18, fontWeight: hot ? 900 : 600, fill: hot ? 'var(--fg)' : 'var(--fg-sub)', transition: trans('fill') }}>
            {ri}
          </text>
        )
      })}
    </>
  )

  return (
    <svg width={1280} height={720} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', opacity, transition: trans('opacity') }}>
      {cells}
      {frame}
      {lens}
      {idx}
      {pieces.map((p, i) => (
        <PieceView key={i} g={g} p={p} look={look} size={kanjiSize} hide={hideKanji} motionOf={pieceMotion?.(p) ?? null} />
      ))}
      {children}
    </svg>
  )
}

/** 五角形の駒の形。中心が (0, 0) */
export function pentagon(cell: number) {
  const w = cell * 0.78
  const h = cell * 0.84
  return `M0,${-h / 2} L${w / 2},${-h / 2 + h * 0.24} L${w * 0.44},${h / 2} L${-w * 0.44},${h / 2} L${-w / 2},${-h / 2 + h * 0.24} Z`
}

function PieceView({ g, p, look, size, hide, motionOf }: { g: Geom; p: Piece; look: Look; size: number; hide: boolean; motionOf: { x: number[]; y: number[]; times: number[]; duration: number; delay: number } | null }) {
  const c = centerAt(g, p.col, p.row)
  const rotate = p.side === 'gote' ? 180 : 0
  const visible = look !== 'memory'
  const anim = motionOf && !STATIC ? { x: motionOf.x, y: motionOf.y } : { x: c.x, y: c.y }
  const transition = motionOf && !STATIC ? { duration: motionOf.duration, times: motionOf.times, delay: motionOf.delay, ease: 'easeInOut' as const } : t()
  // 消す・出すは素の g の CSS transition で行う (motion.g の style の opacity は、描き直しで追従しないことがある)
  return (
    <motion.g initial={false} animate={anim} transition={transition}>
      <g style={{ transform: `rotate(${rotate}deg)`, opacity: visible ? 1 : 0, transition: trans('opacity') }}>
        {look === 'board' && <path d={pentagon(g.cell)} style={{ fill: 'var(--surface)', stroke: 'var(--fg-sub)', strokeWidth: 1.5, transition: trans('d') }} />}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          y={look === 'board' ? g.cell * 0.04 : 0}
          style={{ fontSize: size, fontWeight: 700, fill: p.side === 'sente' ? 'var(--fg)' : 'var(--fg-sub)', fontFamily: "'Noto Sans JP', sans-serif", transition: trans('font-size'), ...(hide ? hiddenText : {}) }}
        >
          {p.kind}
        </text>
      </g>
    </motion.g>
  )
}

// ---------------------------------------------------------------- Bitboard
export type SheetDef = { label: string; bits?: (c: number, r: number) => boolean; lit?: boolean }

/** 1 升の 0/1 の 9×9。Bitboard のシート */
export function BitSheet({ x, y, cell, label, bits, lit = false, header = 30, opacity = 1 }: Geom & { label: string; bits?: (c: number, r: number) => boolean; lit?: boolean; header?: number; opacity?: number }) {
  const w = cell * 9
  const h = cell * 9 + header
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: trans('transform', 'opacity'), opacity }}>
      <rect x={-6} y={-header} rx={10} width={w + 12} height={h + 6} style={{ fill: 'var(--surface)', stroke: lit ? 'var(--accent)' : 'var(--line)', strokeWidth: 2, transition: trans('stroke') }} />
      <text x={6} y={-header / 2} dominantBaseline="central" style={{ fontSize: 20, fontWeight: 800, fill: lit ? 'var(--accent-strong)' : 'var(--fg-sub)' }}>
        {label}
      </text>
      {bits &&
        range(81).map((i) => {
          const c = i % 9
          const r = Math.floor(i / 9)
          const on = bits(c, r)
          return (
            <g key={i} transform={`translate(${c * cell}, ${r * cell})`}>
              <rect width={cell} height={cell} style={{ fill: on ? (lit ? 'var(--accent-bg)' : 'var(--accent-faint)') : 'none', stroke: 'var(--line)', strokeWidth: 1 }} />
              <text x={cell / 2} y={cell / 2} textAnchor="middle" dominantBaseline="central" style={{ fontSize: Math.max(18, cell * 0.5), fontWeight: on ? 800 : 600, fill: on ? (lit ? 'var(--accent-strong)' : 'var(--fg)') : 'var(--muted)' }}>
                {on ? 1 : 0}
              </text>
            </g>
          )
        })}
    </g>
  )
}

/** 駒の種類ごとのシートの重なり。前のシートの x,y が基準で、後ろのシートは右上へずれて頭だけ見える */
export const SHEET_SHIFT = { dx: 10, dy: -26 }
export const SHEET_HEADER = 30
export const BACK_SHEETS = ['香', '桂', '銀', '金', '…']

export function sheetBits(pieces: readonly Piece[], kind: string) {
  return (c: number, r: number) => pieces.some((p) => p.kind === kind && p.col === c && p.row === r)
}

/** Bitboard の図。front が手前のシート (既定は歩)。後ろに香・桂…の頭が重なる。シートは label を key にするので、手前のシートを替えると前のシートは後ろへ下がる */
export function Bitboard({ x, y, cell, pieces, opacity = 1, front, backs = BACK_SHEETS, extra }: Geom & { pieces: readonly Piece[]; opacity?: number; front?: SheetDef; backs?: readonly string[]; extra?: ReactNode }) {
  const f: SheetDef = front ?? { label: '歩', bits: sheetBits(pieces, '歩') }
  const order = [...backs].reverse()
  return (
    <svg width={1280} height={720} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', opacity, transition: trans('opacity') }}>
      {order.map((label, i) => {
        const depth = order.length - i
        return <BitSheet key={label} x={x + SHEET_SHIFT.dx * depth} y={y + SHEET_SHIFT.dy * depth} cell={cell} label={label} header={SHEET_HEADER} />
      })}
      <motion.g key={f.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t({ duration: 0.3 })}>
        <BitSheet x={x} y={y} cell={cell} label={f.label} bits={f.bits} lit={f.lit} header={SHEET_HEADER} />
      </motion.g>
      {extra}
    </svg>
  )
}

/** Bitboard の図の、後ろのシートを含めた外のり */
export const bitboardExtent = (cell: number) => ({ width: cell * 9 + 12 + SHEET_SHIFT.dx * BACK_SHEETS.length, up: SHEET_HEADER + 6 - SHEET_SHIFT.dy * BACK_SHEETS.length })
