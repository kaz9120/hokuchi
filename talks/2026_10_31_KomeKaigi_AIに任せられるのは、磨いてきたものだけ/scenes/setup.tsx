// 任せ方。人は方針だけを決め、実装から取り込みまでを AI が回す。左から箱をつなぎ、右端から左端へ戻る輪が閉じる。
// 最後に「対局させて判定する」だけを強調色にし、ほかを薄くする (人の承認を外せるのは、対局で判定できるから)
// 動きの役割: 連続性 (流れ・輪) → 強調 (判定の箱)
import { Connect, Headline, Reveal, defineScene, t, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'

const HEADS = ['コードは 1 行も書かないと決めました', 'コードは 1 行も書かないと決めました', 'コードは 1 行も書かないと決めました', '肝は 対局で判定するところです']

const FLOW = [
  { id: 's0', label: '方針を決める', who: '私と AI', human: true },
  { id: 's1', label: '設計の記録を書く', who: 'AI' },
  { id: 's2', label: '実装する', who: 'AI' },
  { id: 's3', label: '対局させて\n判定する', who: '自動' },
  { id: 's4', label: '本体に取り込む', who: 'AI' },
]
/** 肝になる箱 */
const KEY = 's3'
const W = 184
const GAP = 42
const TOP = 290
const H = 150
const x = (i: number) => 96 + i * (W + GAP)
/** 3 つ目からの箱が順に出る間隔 (秒) */
const STAGGER = 0.55
/** 薄くしたときの不透明度 */
const DIM = 0.3

function Legend() {
  const sw = (human: boolean) => ({ width: 18, height: 18, borderRadius: 5, boxSizing: 'border-box' as const, border: `2px solid ${human ? 'var(--accent)' : 'var(--line)'}`, background: human ? 'var(--accent-bg)' : 'var(--surface)' })
  return (
    <Reveal at={0} y={0} style={{ position: 'absolute', left: 96, top: 200, display: 'flex', gap: 32, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={sw(true)} />
        人が関わる
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={sw(false)} />
        AI が回す
      </span>
    </Reveal>
  )
}

function Setup() {
  const step = useStep()
  const focus = step >= 3
  const dimmed = { opacity: focus ? DIM : 1 }
  return (
    <>
      <Headline>{HEADS}</Headline>
      <motion.div initial={false} animate={dimmed} transition={t()}>
        <Legend />
      </motion.div>

      {FLOW.map((f, i) => {
        const key = f.id === KEY
        // 肝の箱だけ強調色にし、ほかは薄くする。人の箱は色を保ったまま薄くなる
        const tone = focus ? (key ? 'tone-hot' : `${f.human ? 'tone-hot ' : ''}tone-dim`) : f.human ? 'tone-hot' : ''
        return (
          <Reveal key={f.id} at={i < 2 ? 0 : 1} delay={i < 2 ? i * 0.2 : (i - 2) * STAGGER} node={f.id} style={{ position: 'absolute', left: x(i), top: TOP, width: W, height: H }}>
            <div className={`card ${tone}`} style={{ width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: '0 10px', textAlign: 'center', fontSize: 24, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'pre-line' }}>
              {f.label}
              <span className="chip" style={{ fontSize: 18, transition: 'background 0.5s', ...(f.human || (key && focus) ? { background: 'var(--accent)' } : {}) }}>
                {f.who}
              </span>
            </div>
          </Reveal>
        )
      })}

      <motion.div initial={false} animate={dimmed} transition={t()} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <Connect from="s0" to="s1" at={0} curve={0} delay={0.3} />
        <Connect from="s1" to="s2" at={1} curve={0} delay={0.15} flow />
        <Connect from="s2" to="s3" at={1} curve={0} delay={0.15 + STAGGER} flow />
        <Connect from="s3" to="s4" at={1} curve={0} delay={0.15 + STAGGER * 2} flow />
        {/* 右端から左端へ戻り、輪が閉じる */}
        <Connect from="s4" to="s0" at={2} fromSide="bottom" toSide="bottom" curve={0.15} flow label="24 時間" />
      </motion.div>
    </>
  )
}

export default defineScene({ id: 'setup', steps: 4, Component: Setup })
