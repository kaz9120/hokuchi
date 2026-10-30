// 10 月の話へ。two-moments の時間の帯が短く戻って 10 月の旗に寄り、実物の将棋盤に替わる。
// 将棋 AI は駒を動かしては戻して先を読む。だから盤をメモリにどう持つかで速さが決まる (見出しだけが変わる)
// 動きの役割: 画面の演出 (帯が 10 月に寄る) → 連続性 (駒を動かして戻す) → 強調 (見出しの差し替え)
import { Headline, STATIC, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { useEffect, useState } from 'react'
import { Board, START, centerAt, type Geom, type Piece } from './_board'
import { Timeline } from './_timeline'

const G: Geom = { x: 424, y: 184, cell: 48 }

/** 読みの途中で動かす手。[動かす駒の升, 行き先]。先手と後手を交ぜて、読みが往復している感じにする */
const MOVES: [[number, number], [number, number]][] = [
  [[2, 6], [2, 5]], // 7六歩
  [[6, 2], [6, 3]], // 3四歩
  [[7, 7], [4, 7]], // 5八飛
  [[1, 1], [4, 1]], // 5二飛
  [[7, 6], [7, 5]], // 2六歩
  [[3, 8], [2, 7]], // 7八金
  [[6, 0], [5, 1]], // 4二銀
]
const BEAT = 0.62
/** 帯が 10 月の旗に寄ってから、盤に替わるまでの秒数 (倍率をかける前) */
const INTRO = 1.5

function BoardMemory() {
  const step = useStep()
  const active = useActive()
  // シーンに入ってからしばらくは時間の帯。静止画では最初から盤
  const [intro, setIntro] = useState(!STATIC)
  useEffect(() => {
    if (!active || !intro) return
    const ms = ((t({ duration: INTRO }) as { duration?: number }).duration ?? INTRO) * 1000
    const id = setTimeout(() => setIntro(false), ms)
    return () => clearTimeout(id)
  }, [active, intro])
  const boardShown = !intro

  const [k, setK] = useState(0)
  const reading = active && boardShown && !STATIC
  useEffect(() => {
    if (!reading) return
    const id = setInterval(() => setK((v) => v + 1), BEAT * 1000)
    return () => clearInterval(id)
  }, [reading])

  const current = reading ? MOVES[k % MOVES.length] : null
  const pieceMotion = (p: Piece) => {
    if (!current || p.col !== current[0][0] || p.row !== current[0][1]) return null
    const from = centerAt(G, p.col, p.row)
    const to = centerAt(G, current[1][0], current[1][1])
    return { x: [from.x, to.x, to.x, from.x], y: [from.y, to.y, to.y, from.y], times: [0, 0.32, 0.58, 1], duration: BEAT * 0.9, delay: 0 }
  }

  return (
    <>
      <Headline>{['10 月 盤の持ち方を変えました', '盤のデータ構造で 速さが決まります']}</Headline>
      {/* 時間の帯。入ってすぐ 10 月の旗に寄り、盤に替わる */}
      {!STATIC && <Timeline visible={intro} flags hot="oct" zoom={{ flag: 'oct', to: [640, 430], on: active }} />}
      <Board {...G} pieces={START} look="board" opacity={boardShown ? 1 : 0} pieceMotion={pieceMotion} />
      <div style={{ position: 'absolute', left: 900, top: 380, fontSize: 24, fontWeight: 700, color: 'var(--fg-sub)', lineHeight: 1.5, opacity: boardShown ? 1 : 0, transition: 'opacity 0.5s' }}>
        1 手を考える間に
        <br />
        何百万回も
      </div>
    </>
  )
}

export default defineScene({ id: 'board-memory', steps: 2, Component: BoardMemory })
