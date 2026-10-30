// 専門性は何でも生かせる引き出し。「専門性」の札が見出しの上へ移り、問いのあとに知識の札が 1 枚ずつ並ぶ。
// そのあと、札から 1 本の矢印が「Claude Code」を通って「将棋 AI の案」へ伸び、最後に札がすべて強調色になる
// 動きの役割: 画面の演出 (札が見出しの上へ移る) → 連続性 (札が並ぶ) → 関係性の変化 (置き換えの流れ) → 強調 (どの札も役に立つ)
import { motion } from 'motion/react'
import { Reveal, defineScene, t, useStep } from '@hokuchi/stage'
import { KeywordAtHeadline } from './_keyword'
import { RichHeadline } from './_rich'

const DRAWERS = ['将棋', '数学', '機械学習', 'チェスや囲碁の手法', 'ほかの分野の手法', '大規模な並列計算', 'プログラムの最適化']
/** 札を並べる帯。2 行に折り返し、真ん中にそろえる */
const DRAWER_BAND = { left: 96, width: 1088, top: 236 }
/** 置き換えの流れ。札の帯の下に、Claude Code → 将棋 AI の案 を横に並べる */
const FLOW_TOP = 470
const BOX = { width: 300, height: 96 }
const CC_LEFT = 250
const IDEA_LEFT = 730
const ARROW_DOWN = { x: CC_LEFT + BOX.width / 2, from: 392, to: FLOW_TOP - 8 }

const ease = 'cubic-bezier(0.25, 0.8, 0.35, 1)'

function Drawer({ i, children }: { i: number; children: string }) {
  const step = useStep()
  const hot = step >= 3
  return (
    <Reveal at={1} delay={0.15 + i * 0.12} y={10}>
      <div
        style={{
          padding: '8px 22px',
          borderRadius: 12,
          border: `3px solid ${hot ? 'var(--accent)' : 'var(--fg-sub)'}`,
          background: hot ? 'var(--accent-bg)' : 'var(--surface)',
          color: hot ? 'var(--accent-strong)' : 'var(--fg)',
          fontSize: 28,
          fontWeight: 800,
          whiteSpace: 'nowrap',
          transition: `border-color 0.6s ${ease} ${i * 0.06}s, background 0.6s ${ease} ${i * 0.06}s, color 0.6s ${ease} ${i * 0.06}s`,
        }}
      >
        {children}
      </div>
    </Reveal>
  )
}

function FlowBox({ left, hot = false, children }: { left: number; hot?: boolean; children: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: FLOW_TOP,
        ...BOX,
        boxSizing: 'border-box',
        borderRadius: 14,
        border: `3px solid ${hot ? 'var(--accent)' : 'var(--fg)'}`,
        background: hot ? 'var(--accent-bg)' : 'var(--surface)',
        color: hot ? 'var(--accent-strong)' : 'var(--fg)',
        display: 'grid',
        placeContent: 'center',
        fontSize: 30,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

function Expertise() {
  const step = useStep()
  const flow = step === 2
  return (
    <>
      <KeywordAtHeadline word="専門性" />
      <RichHeadline
        items={[
          '将棋 AI を強くする方法を 100 個 挙げられますか',
          '100 個挙げるには たくさんの引き出しが要ります',
          '知っていることは 何でも目の前の分野の言葉に置き換えられます',
          '専門性は 何でも役に立つ時代です',
        ]}
      />

      <div style={{ position: 'absolute', ...DRAWER_BAND, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '18px 16px' }}>
        {DRAWERS.map((d, i) => (
          <Drawer key={d} i={i}>
            {d}
          </Drawer>
        ))}
      </div>

      {/* 置き換えの流れ。札の帯から Claude Code へ下りて、将棋 AI の案へ進む */}
      <motion.div initial={false} animate={{ opacity: flow ? 1 : 0 }} transition={t(flow ? { delay: 0.2 } : { duration: 0.15, ease: 'easeIn' })} style={{ position: 'absolute', inset: 0 }}>
        <svg width={1280} height={720} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <marker id="expertise-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--fg)" />
            </marker>
          </defs>
          <line x1={ARROW_DOWN.x} y1={ARROW_DOWN.from} x2={ARROW_DOWN.x} y2={ARROW_DOWN.to} stroke="var(--fg)" strokeWidth={3} markerEnd="url(#expertise-arrow)" />
          <line x1={CC_LEFT + BOX.width + 8} y1={FLOW_TOP + BOX.height / 2} x2={IDEA_LEFT - 10} y2={FLOW_TOP + BOX.height / 2} stroke="var(--fg)" strokeWidth={3} markerEnd="url(#expertise-arrow)" />
        </svg>
        <FlowBox left={CC_LEFT}>Claude Code</FlowBox>
        <FlowBox left={IDEA_LEFT} hot>
          将棋 AI の案
        </FlowBox>
      </motion.div>
    </>
  )
}

export default defineScene({ id: 'expertise', steps: 4, Component: Expertise })
