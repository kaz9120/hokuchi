// 個性は自分にしかない基準。前半は、AI の印と人 3 人から 1 つの箱「同じ答え」へ線が集まり (同じ専門性は同じ答えに行き着く)、
// 下の 1 人の線だけが離れて「自分の答え」へ向かう。後半は 10 年前の話者のプログラムを、強いソフトの良い所の寄せ集め (灰色の箱 3 つ) と
// 小さな強調色の箱 1 つで見せ、最後に強調色の箱が増えて大きくなる (前例のないことも試せる)
// 動きの役割: 関係性の変化 (線が集まる) → 強調 (1 人だけ離れる) → 連続性 (寄せ集めの箱) → 関係性の変化 (こだわりの箱が主役になる)
import { motion } from 'motion/react'
import { Reveal, Swap, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { AiMark, Person } from './_abstract'
import { KeywordAtHeadline } from './_keyword'
import { RichHeadline } from './_rich'

// ── 前半: 同じ答えに集まる線 ──
/** 左の列。上から AI の印、人 3 人。下の 1 人が離れる */
const SRC_X = 300
const ROWS = [272, 362, 452, 542]
const AWAY = 3
const BOX = { left: 700, width: 320, height: 96 }
const SAME_Y = (ROWS[0] + ROWS[2]) / 2 + 2
const OWN_Y = ROWS[AWAY] + 26
const LINE_FROM = SRC_X + 48

function Answer({ cy, hot, show, delay = 0, children }: { cy: number; hot: boolean; show: boolean; delay?: number; children: string }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: show ? 1 : 0, x: show ? 0 : 16 }}
      transition={t(show ? { delay } : { duration: 0.15, ease: 'easeIn' })}
      style={{
        position: 'absolute',
        left: BOX.left,
        top: cy - BOX.height / 2,
        width: BOX.width,
        height: BOX.height,
        boxSizing: 'border-box',
        borderRadius: 14,
        border: `3px solid ${hot ? 'var(--accent)' : 'var(--fg)'}`,
        background: hot ? 'var(--accent-bg)' : 'var(--surface)',
        color: hot ? 'var(--accent-strong)' : 'var(--fg)',
        display: 'grid',
        placeContent: 'center',
        fontSize: 32,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </motion.div>
  )
}

function Converge({ step }: { step: number }) {
  const active = useActive()
  const on = active && step < 2
  const away = step >= 1
  return (
    <motion.div initial={false} animate={{ opacity: on ? 1 : 0 }} transition={t(on ? {} : { duration: 0.2, ease: 'easeIn' })} style={{ position: 'absolute', inset: 0 }}>
      <svg width={1280} height={720} style={{ position: 'absolute', inset: 0 }}>
        {ROWS.map((y, i) => {
          const leaves = i === AWAY && away
          return (
            <motion.line
              key={i}
              x1={LINE_FROM}
              y1={y}
              x2={BOX.left - 6}
              y2={SAME_Y}
              stroke="var(--fg-sub)"
              strokeWidth={3}
              strokeLinecap="round"
              initial={false}
              animate={{ pathLength: active ? 1 : 0, opacity: leaves ? 0 : 1 }}
              transition={t({ duration: 0.7, delay: step === 0 ? 0.3 + i * 0.12 : 0 })}
            />
          )
        })}
        {/* 離れた 1 人の線。自分の答えへ */}
        <motion.line
          x1={LINE_FROM}
          y1={ROWS[AWAY]}
          x2={BOX.left - 6}
          y2={OWN_Y}
          stroke="var(--accent)"
          strokeWidth={4}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: away ? 1 : 0, opacity: away ? 1 : 0 }}
          transition={t({ duration: 0.7, delay: away ? 0.3 : 0 })}
        />
      </svg>
      <AiMark cx={SRC_X} cy={ROWS[0]} size={56} />
      {ROWS.slice(1).map((y, i) => (
        <Person key={y} cx={SRC_X} bottom={y + 32} height={68} hot={i + 1 === AWAY && away} />
      ))}
      <Answer cy={SAME_Y} hot={false} show={active} delay={0.9}>
        同じ答え
      </Answer>
      <Answer cy={OWN_Y} hot show={away} delay={0.8}>
        自分の答え
      </Answer>
    </motion.div>
  )
}

// ── 後半: 10 年前のプログラム → いまのプログラム ──
/** プログラムの枠。見出し (2 行) の下から、左下の章の案内 (668 から) の手前まで */
const FRAME = { left: 140, top: 270, width: 1000, height: 330 }
const INNER_TOP = 70
const GAP = 16

type Piece = { key: string; lines: readonly string[]; hot: boolean }
const BORROWED: readonly Piece[] = [
  { key: 'a', lines: ['ソフト A', 'の良い所'], hot: false },
  { key: 'b', lines: ['ソフト B', 'の良い所'], hot: false },
  { key: 'c', lines: ['ソフト C', 'の良い所'], hot: false },
]
/** 1 つ目は 10 年前の個性 (方策勾配法の強化学習) で、いまは配列盤に替わる */
const OWN: readonly Piece[] = [
  { key: 'own1', lines: ['方策勾配法の', '強化学習'], hot: true },
  { key: 'own2', lines: ['前例のない', '案'], hot: true },
  { key: 'own3', lines: ['やってみたい', 'こと'], hot: true },
]

/** 状態ごとの箱の幅と高さ。10 年前は寄せ集めが主役、いまはこだわりが主役 */
function sizeOf(p: Piece, now: boolean) {
  if (p.hot) return now ? { width: 190, height: 170 } : { width: 170, height: 100 }
  return now ? { width: 100, height: 100 } : { width: 210, height: 150 }
}

function Box({ p, now, show }: { p: Piece; now: boolean; show: boolean }) {
  const size = sizeOf(p, now)
  const lines = p.key === 'own1' && now ? ['配列盤'] : p.lines
  return (
    // まだ無い箱は幅 0 で畳んでおき、出るときに幅ごと開く (隣の箱が押し出されるように動く)
    <motion.div
      initial={false}
      animate={show ? { opacity: p.hot || !now ? 1 : 0.5, marginLeft: 0, ...size } : { opacity: 0, marginLeft: -GAP, width: 0, height: size.height }}
      transition={t({ duration: 0.8 })}
      style={{
        display: 'grid',
        overflow: 'hidden',
        flex: 'none',
        placeContent: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
        padding: show ? '0 10px' : 0,
        borderRadius: 12,
        border: `${show ? 3 : 0}px solid ${p.hot ? 'var(--accent)' : 'var(--fg-sub)'}`,
        background: p.hot ? 'var(--accent-bg)' : 'var(--surface)',
        color: p.hot ? 'var(--accent-strong)' : 'var(--fg-sub)',
        fontSize: p.hot ? (now ? 26 : 22) : now ? 18 : 24,
        fontWeight: 800,
        lineHeight: 1.3,
        transition: 'font-size 0.6s',
      }}
    >
      {lines.map((w) => (
        <span key={w} style={{ whiteSpace: 'nowrap' }}>
          {w}
        </span>
      ))}
    </motion.div>
  )
}

function Program({ step }: { step: number }) {
  const now = step >= 3
  return (
    <Reveal at={2} delay={0.3} style={{ position: 'absolute', ...FRAME, boxSizing: 'border-box', border: '3px solid var(--line)', borderRadius: 18 }}>
      <div style={{ position: 'absolute', left: 28, top: 18, fontSize: 24, fontWeight: 800, color: 'var(--fg-sub)', whiteSpace: 'nowrap' }}>
        <Swap>{now ? 'いまの 私のプログラム' : '10 年前の 私のプログラム'}</Swap>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: INNER_TOP, bottom: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: GAP }}>
        {BORROWED.map((p) => (
          <Box key={p.key} p={p} now={now} show />
        ))}
        {OWN.map((p, i) => (
          <Box key={p.key} p={p} now={now} show={i === 0 || now} />
        ))}
      </div>
    </Reveal>
  )
}

function Individuality() {
  const step = useStep()
  return (
    <>
      {/* 個性の札は、1 人が離れたところで出す */}
      <Reveal at={1} delay={0.6} y={0}>
        <KeywordAtHeadline word="個性" />
      </Reveal>
      <RichHeadline
        items={[
          '同じ専門性は 同じ答えに行き着きます',
          '最後に残るのは 何を良しとするか どこに賭けるか',
          '10 年前の私は 寄せ集めに個性を 1 つ足すのが精一杯でした',
          'いまは 前例がなくても まず試せます',
        ]}
      />
      <Converge step={step} />
      <Program step={step} />
    </>
  )
}

export default defineScene({ id: 'individuality', steps: 4, Component: Individuality })
