// 人数の伸びとデプロイ数の伸びを、同じ物差しで並べる。動きの役割: オブジェクトの変化 (スケールアップ)
import { motion } from 'motion/react'
import { t, useStep } from '../runtime/deck'
import { CountUp, Reveal, Swap } from '../runtime/kit'

const HEADLINES = ['デプロイ数の推移', 'エンジニアは 3.5 倍に増えた', 'デプロイ数は 43 倍になった']

const UNIT = 16.3 // 1 倍あたりの px。43 倍で 700px
const BAR_LEFT = 330

function Row({ label, top, times, at, value }: { label: string; top: number; times: number; at: number; value: React.ReactNode }) {
  const grown = useStep() >= at
  return (
    <div style={{ position: 'absolute', left: 96, top, right: 96, height: 72, display: 'flex', alignItems: 'center' }}>
      <div style={{ width: BAR_LEFT - 96, flex: 'none', fontSize: 30, fontWeight: 700 }}>{label}</div>
      <motion.div
        style={{ height: 56, borderRadius: 8, background: grown ? 'var(--coral)' : 'var(--muted)', flex: 'none' }}
        initial={false}
        animate={{ width: (grown ? times : 1) * UNIT }}
        transition={t({ duration: 1.2 })}
      />
      <div style={{ marginLeft: 20, fontSize: 30, fontWeight: 800, whiteSpace: 'nowrap', color: grown ? 'var(--ink)' : 'var(--sub)' }}>{value}</div>
    </div>
  )
}

export function Deploys() {
  const step = useStep()
  return (
    <>
      <Swap k={HEADLINES[step]} className="headline">
        {HEADLINES[step]}
      </Swap>
      <div className="label" style={{ position: 'absolute', left: BAR_LEFT, top: 196 }}>
        基準を 1 としたときの倍率
      </div>
      <Row label="エンジニア数" top={250} times={3.5} at={1} value={<><CountUp from={1} to={3.5} at={1} decimals={1} /> 倍<span style={{ fontSize: 24, fontWeight: 600, color: 'var(--sub)' }}>（10 → 35 人）</span></>} />
      <Row label="デプロイ数" top={380} times={43} at={2} value={<><CountUp from={1} to={43} at={2} /> 倍</>} />
      <Reveal at={2} delay={1.2} style={{ position: 'absolute', left: 96, top: 520, fontSize: 32, fontWeight: 700 }}>
        人数の増加だけでは説明できない伸び
      </Reveal>
      <div className="source">出典: Productivity チームの発表資料（AI DevEX Conference 2026）</div>
    </>
  )
}
