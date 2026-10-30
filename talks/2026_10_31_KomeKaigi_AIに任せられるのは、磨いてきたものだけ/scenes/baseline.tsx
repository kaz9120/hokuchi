// AI だけで届く所は 10 年前の最先端。左から右へ時間の軸 (10 年前 → いま)。AI だけで届く線は 10 年前のトップと同じ高さの横線で、
// いまのトップの線は右へ上がっていく。点数は出さず、差を「10 年分」の時間で見せる。最後に差の所へ「専門性」「個性」の札が入る
// (札は expertise / individuality で見出しの上へ移る。位置は _keyword.tsx の KEYWORD_HOME)
// 動きの役割: 連続性 (線を引く) → 関係性の変化 (トップの線が上がり、差が開く) → 強調 (札が差に入る)
import { motion } from 'motion/react'
import { Headline, Reveal, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { REACH_LINE } from './_abstract'
import { KEYWORD_HOME, KEYWORD_HOME_SCALE, Keyword } from './_keyword'

/** 時間の軸。10 年前 と いま の 2 点だけを置く */
const AXIS = { left: 200, right: 1080, y: 600 }
const PAST_X = 300
const NOW_X = 900
/** AI だけで届く高さ = 10 年前のトップ */
const REACH_Y = 450
/** 2015 年の私。AI だけで届く線より下 */
const ME_Y = 530
/** いまのトップ。見出し (2 行で下端 180 ほど) に掛からない高さ */
const TOP_Y = 250
const TOP_PATH = `M ${PAST_X} ${REACH_Y} Q 640 430 ${NOW_X} ${TOP_Y}`

const label = { position: 'absolute', fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap' } as const

function Baseline() {
  const step = useStep()
  const active = useActive()
  return (
    <>
      <Headline>{['AI だけでも 10 年前なら優勝争いの強さです', '10 年前の私が見たら 絶望していたと思います', 'でも いまのトップから見れば 10 年前の最先端です', 'この差を埋めるのは 専門性と個性です']}</Headline>

      <svg width={1280} height={720} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {/* 時間の軸 */}
        <line x1={AXIS.left} y1={AXIS.y} x2={AXIS.right} y2={AXIS.y} stroke="var(--line)" strokeWidth={2} />
        {[PAST_X, NOW_X].map((x) => (
          <line key={x} x1={x} y1={AXIS.y - 8} x2={x} y2={AXIS.y + 8} stroke="var(--fg-sub)" strokeWidth={2} />
        ))}
        {/* AI だけで届く線。10 年前のトップの高さで、いままで横に伸びる */}
        <motion.line
          x1={PAST_X}
          y1={REACH_Y}
          x2={AXIS.right}
          y2={REACH_Y}
          {...REACH_LINE}
          initial={false}
          animate={{ pathLength: active ? 1 : 0 }}
          transition={t({ duration: 0.9, delay: active ? 0.3 : 0 })}
        />
        <circle cx={PAST_X} cy={REACH_Y} r={9} fill="var(--fg)" />
        {/* 2015 年の私 */}
        <motion.circle cx={PAST_X} cy={ME_Y} r={7} fill="var(--muted)" initial={false} animate={{ opacity: step >= 1 ? 1 : 0 }} transition={t({ delay: step === 1 ? 0.2 : 0 })} />
        {/* いまのトップ。右へ上がっていく */}
        <motion.path
          d={TOP_PATH}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={4}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: step >= 2 ? 1 : 0, opacity: step >= 2 ? 1 : 0 }}
          transition={t({ duration: 1.1, delay: step === 2 ? 0.2 : 0 })}
        />
        <motion.circle cx={NOW_X} cy={TOP_Y} r={9} fill="var(--accent)" initial={false} animate={{ opacity: step >= 2 ? 1 : 0 }} transition={t({ delay: step === 2 ? 1.2 : 0 })} />
        {/* いまの時点の差。トップと AI だけで届く線の間 */}
        <motion.line
          x1={NOW_X}
          y1={TOP_Y + 14}
          x2={NOW_X}
          y2={REACH_Y - 6}
          stroke="var(--fg-sub)"
          strokeWidth={2}
          strokeDasharray="6 6"
          initial={false}
          animate={{ opacity: step >= 2 ? 1 : 0 }}
          transition={t({ delay: step === 2 ? 1.4 : 0 })}
        />
      </svg>

      <div style={{ ...label, left: PAST_X - 200, width: 400, top: AXIS.y + 14, textAlign: 'center', fontSize: 22, color: 'var(--fg-sub)' }}>10 年前</div>
      <div style={{ ...label, left: NOW_X - 200, width: 400, top: AXIS.y + 14, textAlign: 'center', fontSize: 22, color: 'var(--fg-sub)' }}>いま</div>
      <div style={{ ...label, left: PAST_X - 200, width: 400, top: REACH_Y - 48, textAlign: 'center', color: 'var(--fg)' }}>10 年前のトップ</div>
      <div style={{ ...label, right: 1280 - AXIS.right, top: REACH_Y + 12, textAlign: 'right', color: 'var(--fg)' }}>
        AI だけで届く所
        <Reveal at={2} delay={1.6} y={6}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg-sub)', marginTop: 2 }}>＝ 10 年前の最先端</div>
        </Reveal>
      </div>

      <Reveal at={1} delay={0.3} style={{ ...label, left: PAST_X + 22, top: ME_Y - 16, fontSize: 22, color: 'var(--muted)' }}>
        2015 年の私
      </Reveal>
      <Reveal at={2} delay={1.2} style={{ ...label, left: NOW_X + 20, top: TOP_Y - 18, color: 'var(--accent-strong)' }}>
        いまのトップ
      </Reveal>
      <Reveal at={2} until={3} delay={1.6} style={{ ...label, left: NOW_X + 20, top: (TOP_Y + REACH_Y) / 2 - 18, fontSize: 28, color: 'var(--fg)' }}>
        10 年分
      </Reveal>

      {/* 差に入る 2 つの札 */}
      <Reveal at={3} delay={0.2} y={0}>
        <Keyword word="専門性" {...KEYWORD_HOME['専門性']} scale={KEYWORD_HOME_SCALE} />
      </Reveal>
      <Reveal at={3} delay={0.6} y={0}>
        <Keyword word="個性" {...KEYWORD_HOME['個性']} scale={KEYWORD_HOME_SCALE} />
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'baseline', steps: 4, Component: Baseline })
