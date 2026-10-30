// 盤の持ち方は配列と Bitboard の 2 つ。同じ局面を左右に一度に並べ、最後に Bitboard へ寄る
// 動きの役割: 関係性の変化 (左右に並べる) → 画面の演出 (右へ寄る)
import { Headline, Reveal, defineScene, useStep } from '@hokuchi/stage'
import { Bitboard, Board, START, type Geom } from './_board'

const CELL = 40
const LEFT: Geom = { x: 96, y: 262, cell: CELL }
const RIGHT: Geom = { x: 768, y: 262, cell: CELL }
const RIGHT_ZOOM: Geom = { x: 700, y: 280, cell: CELL }
const LABEL_TOP = 638

function TwoBoards() {
  const step = useStep()
  const right = step >= 1 ? RIGHT_ZOOM : RIGHT
  return (
    <>
      <Headline>{['盤の持ち方は 大きく 2 つあります', '主流は Bitboard です']}</Headline>

      <Board {...LEFT} pieces={START} look="array" opacity={step >= 1 ? 0 : 1} />
      <Reveal at={0} until={1} className="label" style={{ position: 'absolute', left: LEFT.x, top: LABEL_TOP, width: 600 }}>
        配列: 升ごとに 何の駒がいるか
      </Reveal>

      <Reveal at={0} delay={0.4} y={0} style={{ position: 'absolute', inset: 0 }}>
        <Bitboard {...right} pieces={START} />
      </Reveal>
      <Reveal at={0} until={1} delay={0.4} className="label" style={{ position: 'absolute', left: RIGHT.x - 6, top: LABEL_TOP, width: 440, whiteSpace: 'pre-line' }}>
        {'Bitboard: 駒の種類ごとに\nどの升にいるか'}
      </Reveal>

      <Reveal at={1} delay={0.5} style={{ position: 'absolute', left: 96, top: 360, fontSize: 40, fontWeight: 800, lineHeight: 1.5, color: 'var(--accent-strong)' }}>
        簡単で
        <br />
        バグが少ない
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'two-boards', steps: 2, Component: TwoBoards })
