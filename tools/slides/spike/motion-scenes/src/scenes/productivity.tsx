// 生産性の 2 分類から、組織的生産性へ寄っていく。動きの役割: 画面の演出 (ズームイン)
import { motion } from 'motion/react'
import { t, useStep } from '../runtime/deck'
import { Reveal, Swap } from '../runtime/kit'

const HEADLINES = ['生産性に関する取り組みの分類', '今日は組織的生産性の話をします', '組織的生産性で扱うこと']

const TECH_ITEMS = ['開発基盤の改善', 'テスト自動化', 'モニタリング整備']
const ORG_ITEMS = ['開発プロセスの見直し', 'レビュー文化の形成', 'ナレッジの循環']
const ORG_SCOPE = ['開発プロセスの整備', 'チームの連携', '目標の設計', 'ナレッジの循環']

const TECH = [
  { left: 96, top: 176, width: 528, height: 432 },
  { left: 96, top: 176, width: 300, height: 432 },
  { left: -360, top: 176, width: 300, height: 432 },
]
const ORG = [
  { left: 656, top: 176, width: 528, height: 432 },
  { left: 428, top: 176, width: 756, height: 432 },
  { left: 96, top: 176, width: 1088, height: 432 },
]

const box = { position: 'absolute', boxSizing: 'border-box', borderRadius: 20, padding: '40px 44px', background: '#fff', border: '2px solid' } as const
const title = { fontSize: 38, fontWeight: 800, whiteSpace: 'nowrap' } as const
const desc = { fontSize: 26, color: 'var(--sub)', marginTop: 10, fontWeight: 600 }
const item = { fontSize: 28, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 14 }
const dot = { width: 10, height: 10, borderRadius: 5, background: 'var(--coral)', flex: 'none' }

export function Productivity() {
  const step = useStep()
  return (
    <>
      <Swap k={HEADLINES[step]} className="headline">
        {HEADLINES[step]}
      </Swap>

      <motion.div layout style={{ ...box, ...TECH[step] }} initial={false} animate={{ opacity: step === 0 ? 1 : 0.55, borderColor: '#ebe3e1' }} transition={t()}>
        <motion.div layout="position" transition={t()} style={title} initial={false} animate={{ fontSize: step === 0 ? 38 : 30 }}>
          技術的生産性
        </motion.div>
        <Reveal at={0} until={1} out={0} style={desc}>
          技術基盤を整えて開発を速くする
        </Reveal>
        <Reveal at={0} until={1} out={0} style={{ marginTop: 40, display: 'grid', gap: 18 }}>
          {TECH_ITEMS.map((s) => (
            <div key={s} style={item}>
              <span style={dot} />
              {s}
            </div>
          ))}
        </Reveal>
        <Reveal at={1} delay={0.3} style={{ ...desc, position: 'absolute', left: 44, right: 32, top: 104, fontSize: 24 }}>
          Productivity チームが発表済み
          <div style={{ fontSize: 20, marginTop: 12, fontWeight: 400 }}>AI DevEX Conference 2026</div>
        </Reveal>
      </motion.div>

      <motion.div
        layout
        style={{ ...box, ...ORG[step] }}
        initial={false}
        animate={{ borderColor: step >= 1 ? '#fa6e78' : '#ebe3e1' }}
        transition={t()}
      >
        <motion.div layout="position" transition={t()} style={title}>
          組織的生産性
        </motion.div>
        <motion.div layout="position" transition={t()} style={desc}>
          プロセスと連携を整えてチームを強くする
        </motion.div>
        <Reveal at={0} until={2} style={{ marginTop: 40, display: 'grid', gap: 18 }}>
          {ORG_ITEMS.map((s) => (
            <div key={s} style={item}>
              <span style={dot} />
              {s}
            </div>
          ))}
        </Reveal>
        <div style={{ position: 'absolute', left: 44, right: 44, top: 160, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {ORG_SCOPE.map((s, i) => (
            <Reveal key={s} at={2} delay={0.35 + i * 0.08}>
              <div style={{ background: 'var(--coral-faint)', border: '2px solid var(--coral-bg)', borderRadius: 14, padding: '16px 28px', fontSize: 30, fontWeight: 700 }}>{s}</div>
            </Reveal>
          ))}
        </div>
        <Reveal at={2} delay={0.75} style={{ ...desc, position: 'absolute', left: 44, bottom: 30, margin: 0 }}>
          どれも機械では判定できず、人と人が話して決める
        </Reveal>
      </motion.div>
    </>
  )
}
