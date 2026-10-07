// AI で個人は速くなったが、人と人の間の仕組みが追いついていない。そこを扱うのが組織的生産性
// 動きの役割: オブジェクトの変化 (個人が伸びる) → 関係性の変化 (間の線) → オブジェクトの変化 (線が太くなる)
import { Headline, Reveal, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import { Person } from './_common'

const XS = [250, 510, 770, 1030]
const PY = 420 // 人の中心
const SCOPE = ['開発プロセスの整備', 'チームの連携', '目標の設計', 'ナレッジの循環']

function WhyOrg() {
  const step = useStep()
  const active = useActive()
  const strong = step >= 2
  return (
    <>
      <Headline>{['AI で個人は速くなった', '個人の加速が組織の成果につながっていない', '組織的生産性で扱うこと']}</Headline>

      {/* 一人ひとりの伸び。画面に出てから伸ばす */}
      {XS.map((x, i) => (
        <motion.div
          key={x}
          style={{ position: 'absolute', left: x - 14, width: 28, bottom: 720 - (PY - 58), borderRadius: 6, background: 'var(--accent)' }}
          initial={false}
          animate={{ height: active ? [120, 150, 110, 170][i] : 16 }}
          transition={t({ duration: 1.0, delay: 0.25 + i * 0.12 })}
        />
      ))}
      {XS.map((x, i) => (
        <motion.div
          key={`ai-${x}`}
          className="chip"
          style={{ position: 'absolute', left: x - 22, top: PY - 58 - [120, 150, 110, 170][i] - 40 }}
          initial={false}
          animate={{ opacity: active ? 1 : 0 }}
          transition={t({ delay: 1.0 + i * 0.12 })}
        >
          AI
        </motion.div>
      ))}

      {/* 人と人の間の線 */}
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        {XS.slice(0, -1).map((x, i) => (
          <motion.line
            key={x}
            x1={x + 48}
            y1={PY}
            x2={XS[i + 1] - 48}
            y2={PY}
            stroke={strong ? 'var(--accent)' : 'var(--muted)'}
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: step >= 1 ? 1 : 0, strokeWidth: strong ? 8 : 3 }}
            strokeDasharray={strong ? '0' : '6 10'}
            transition={t({ delay: step === 1 ? 0.2 + i * 0.12 : 0 })}
          />
        ))}
      </svg>
      {XS.map((x) => (
        <Person key={x} x={x} y={PY} size={96} />
      ))}

      <Reveal at={1} until={2} delay={0.6} style={{ position: 'absolute', left: 0, right: 0, top: PY + 70, textAlign: 'center', fontSize: 26, fontWeight: 700, color: 'var(--fg-sub)' }}>
        人と人の間の仕組みが追いついていない
      </Reveal>

      <div style={{ position: 'absolute', left: 96, right: 96, top: PY + 78, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {SCOPE.map((s, i) => (
          <Reveal key={s} at={2} delay={0.4 + i * 0.1} className="tile" style={{ textAlign: 'center', fontSize: 24, padding: '16px 10px' }}>
            {s}
          </Reveal>
        ))}
      </div>
      <Reveal at={2} delay={0.9} style={{ position: 'absolute', left: 0, right: 0, top: PY + 178, textAlign: 'center', fontSize: 24, fontWeight: 600, color: 'var(--fg-sub)' }}>
        どれも機械では判定できず、人と人が話して決める
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'why-org', steps: 3, Component: WhyOrg })
