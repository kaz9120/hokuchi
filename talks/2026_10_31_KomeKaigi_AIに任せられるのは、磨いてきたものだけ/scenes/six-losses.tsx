// 7 月の終わり、不採用のカード 6 枚から始める (two-moments が 7 月の旗に寄って終わるので、帯は出さない)。
// そのあと先読みの 4 つの部品を、AI が 1 つずつ本体に移しては不採用になった様子。最後は 4 つをまとめて移す
// 動きの役割: 画面の演出 (カードが並ぶ) → 関係性の変化 (部品を 1 つずつ取り出す・まとめて移す) → 強調 (6 枚がそろう)
import { Reveal, STATIC, Swap, defineScene, pick, t, useActive, useStep } from '@hokuchi/stage'
import { motion, type TargetAndTransition, type Transition } from 'motion/react'
import { BIG_ROW, LossCards, SMALL_ROW, Stamp } from './_losses'

const HEADS = ['7 月の終わり 不採用が 6 件続きました', '強いソフトの工夫は 部品が組で動きます', '強いソフトの工夫は 部品が組で動きます', '6 件とも 持ってくる単位が小さすぎました', '一緒に動く部品ごとに まとめて移しました']

const PARTS = ['時間の数え方', '読みの続け方', '止める時刻', '考える長さ']
/** 1 つずつ移して試した部品 (3 回) */
const TRIED = 3

// 図の座標。左に強いソフト、右に本体
const ZONE = { top: 180, height: 330 }
const SOFT = { left: 96, width: 694 }
const MAIN = { left: 820, width: 364 }
const CENTER = { left: 116, top: 222, width: 300, height: 268 }
const PART = { left: 440, width: 330, height: 56, gap: 12, top: 222 }
const partY = (i: number) => PART.top + i * (PART.height + PART.gap)
/** 本体の中で 1 つだけ試す位置 */
const TRY = { x: MAIN.left + 17, y: 322 }
/** まとめて移したあとの塊の上端 */
const BLOCK_TOP = 236
const BLOCK_GAP = 4
const TRY_EACH = 2.4 // 1 つ取り出して戻すまでの間隔 (秒)

const zoneStyle = { position: 'absolute', top: ZONE.top, height: ZONE.height, boxSizing: 'border-box', border: '2px dashed var(--muted)', borderRadius: 18 } as const
const zoneLabel = { position: 'absolute', left: 18, top: 8, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' } as const

/** 先読みの絵。相手の時計が進んでいる間に、こちらは盤の先の局面を考えている */
function Lookahead() {
  const cell = 18
  const bx = 173
  const by = 47
  return (
    <svg width={268} height={124} viewBox="0 0 268 124" style={{ display: 'block' }}>
      <text x={54} y={16} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--fg-sub)">
        相手: 考え中
      </text>
      <circle cx={54} cy={76} r={34} fill="var(--surface)" stroke="var(--fg-sub)" strokeWidth={3} />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1={54} y1={46} x2={54} y2={52} stroke="var(--fg-sub)" strokeWidth={2} transform={`rotate(${a} 54 76)`} />
      ))}
      <line x1={54} y1={76} x2={72} y2={76} stroke="var(--fg-sub)" strokeWidth={3} strokeLinecap="round" />
      <motion.g style={{ originX: '54px', originY: '76px' }} initial={false} animate={STATIC ? { rotate: 150 } : { rotate: [0, 360] }} transition={STATIC ? { duration: 0 } : { duration: 9, repeat: Infinity, ease: 'linear' }}>
        <line x1={54} y1={76} x2={54} y2={50} stroke="var(--fg)" strokeWidth={3} strokeLinecap="round" />
      </motion.g>
      <circle cx={54} cy={76} r={3} fill="var(--fg)" />

      <text x={206} y={16} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--fg-sub)">
        こちら: 先を読む
      </text>
      {/* 考えている吹き出しの中に、先の局面 */}
      <rect x={146} y={34} width={120} height={82} rx={16} fill="var(--surface)" stroke="var(--fg-sub)" strokeWidth={3} />
      <circle cx={132} cy={104} r={5} fill="var(--surface)" stroke="var(--fg-sub)" strokeWidth={2.5} />
      <circle cx={118} cy={113} r={3} fill="var(--surface)" stroke="var(--fg-sub)" strokeWidth={2} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line x1={bx} y1={by + i * cell} x2={bx + 3 * cell} y2={by + i * cell} stroke="var(--fg-sub)" strokeWidth={1.5} />
          <line x1={bx + i * cell} y1={by} x2={bx + i * cell} y2={by + 3 * cell} stroke="var(--fg-sub)" strokeWidth={1.5} />
        </g>
      ))}
      {/* 駒 (五角形) と、予想した先の手 */}
      <path d={`M ${bx + cell * 1.5} ${by + cell * 2.15} l 6 4 l 1 11 l -14 0 l 1 -11 z`} fill="var(--fg)" />
      <path d={`M ${bx + cell * 1.5} ${by + cell * 2} L ${bx + cell * 1.5} ${by + cell * 0.55}`} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
      <path d={`M ${bx + cell * 1.5} ${by + cell * 0.3} l -6 8 l 12 0 z`} fill="var(--accent)" />
      <path d={`M ${bx + cell * 1.5} ${by + cell * 0.45} l 5 3 l 1 9 l -12 0 l 1 -9 z`} fill="var(--accent)" opacity={0.45} />
    </svg>
  )
}

/** 部品 1 つ。状態 2 で本体へ 1 つだけ移して戻り、状態 4 で塊になって本体へ移る */
function Part({ i, step }: { i: number; step: number }) {
  const y0 = partY(i)
  const tried = i < TRIED
  const dx = TRY.x - PART.left
  let anim: TargetAndTransition = { x: 0, y: 0 }
  let tr: Transition = t()
  if (step === 2 && tried) {
    const dy = TRY.y - y0
    anim = { x: [0, dx, dx, 0], y: [0, dy, dy, 0] }
    tr = t({ duration: 2.2, delay: i * TRY_EACH, times: [0, 0.28, 0.72, 1] })
  } else if (step >= 4) {
    const gather = -i * (PART.gap - BLOCK_GAP)
    anim = { x: [0, 0, dx], y: [0, gather, gather + (BLOCK_TOP - PART.top)] }
    tr = t({ duration: 1.8, times: [0, 0.4, 1] })
  }
  const stamped = tried && (step === 2 || step === 3)
  return (
    <motion.div
      initial={false}
      animate={anim}
      transition={tr}
      style={{
        position: 'absolute',
        left: PART.left,
        top: y0,
        width: PART.width,
        height: PART.height,
        boxSizing: 'border-box',
        background: 'var(--surface)',
        border: '2px solid var(--line)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        fontSize: 26,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {PARTS[i]}
      <motion.div
        initial={false}
        animate={{ opacity: stamped ? 1 : 0 }}
        transition={step === 2 ? t({ delay: i * TRY_EACH + 0.75, duration: 0.3 }) : t({ duration: 0.3 })}
        style={{ position: 'absolute', right: -6, top: -15 }}
      >
        <Stamp size={18} />
      </motion.div>
    </motion.div>
  )
}

function Figure({ step }: { step: number }) {
  const quiet = step === 3
  return (
    <Reveal at={1} delay={0.2} y={0}>
      <motion.div initial={false} animate={{ opacity: quiet ? 0.5 : 1 }} transition={t()}>
        <div style={{ ...zoneStyle, left: SOFT.left, width: SOFT.width }}>
          <div style={zoneLabel}>強いソフト</div>
        </div>
        <div style={{ ...zoneStyle, left: MAIN.left, width: MAIN.width }}>
          <div style={zoneLabel}>本体</div>
        </div>

        {/* 先読み */}
        <div style={{ position: 'absolute', ...CENTER, boxSizing: 'border-box', background: 'var(--surface)', border: '2px solid var(--line)', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3 }}>先読み</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-sub)', lineHeight: 1.4, marginTop: 4, whiteSpace: 'pre-line' }}>{'相手の手番に 先を読んでおく'}</div>
          <div style={{ marginTop: 8 }}>
            <Lookahead />
          </div>
        </div>

        {/* 先読みと 4 つの部品をつなぐ */}
        <motion.svg className="wires" viewBox="0 0 1280 720" width={1280} height={720} initial={false} animate={{ opacity: step >= 4 ? 0 : 1 }} transition={t()}>
          <line x1={CENTER.left + CENTER.width} y1={CENTER.top + CENTER.height / 2} x2={428} y2={CENTER.top + CENTER.height / 2} stroke="var(--fg-sub)" strokeWidth={2} />
          <line x1={428} y1={partY(0) + PART.height / 2} x2={428} y2={partY(3) + PART.height / 2} stroke="var(--fg-sub)" strokeWidth={2} />
          {PARTS.map((_, i) => (
            <line key={i} x1={428} y1={partY(i) + PART.height / 2} x2={PART.left} y2={partY(i) + PART.height / 2} stroke="var(--fg-sub)" strokeWidth={2} />
          ))}
        </motion.svg>

        {PARTS.map((_, i) => (
          <Part key={i} i={i} step={step} />
        ))}
        {/* まとめて移した塊の枠 */}
        <Reveal at={4} delay={1.5} y={0} style={{ position: 'absolute', left: TRY.x - 10, top: BLOCK_TOP - 10, width: PART.width + 20, height: 4 * PART.height + 3 * BLOCK_GAP + 20, border: '3px solid var(--accent)', borderRadius: 16, boxSizing: 'border-box' }}>
          {''}
        </Reveal>
      </motion.div>
    </Reveal>
  )
}

function SixLosses() {
  const step = useStep()
  const active = useActive()
  return (
    <>
      <Swap className="headline">{pick(step, HEADS)}</Swap>
      <LossCards on={step === 0 ? active : step >= 3} row={step >= 3 ? SMALL_ROW : BIG_ROW} delay={0.3} dim={step >= 4} />
      <Figure step={step} />
    </>
  )
}

export default defineScene({ id: 'six-losses', steps: 5, Component: SixLosses })
