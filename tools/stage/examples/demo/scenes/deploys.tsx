// 人数の伸びとデプロイ数の伸びを、同じ物差しで並べる。動きの役割: オブジェクトの変化 (スケールアップ)
import { CountUp, Headline, Reveal, defineScene, t, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const UNIT = 16.3 // 1 倍あたりの px。43 倍で 700px
const BAR_LEFT = 330

function Row({ label, top, times, at, children }: { label: string; top: number; times: number; at: number; children: ReactNode }) {
  const grown = useStep() >= at
  return (
    <div style={{ position: 'absolute', left: 96, top, right: 96, height: 72, display: 'flex', alignItems: 'center' }}>
      <div style={{ width: BAR_LEFT - 96, flex: 'none', fontSize: 30, fontWeight: 700 }}>{label}</div>
      <motion.div
        style={{ height: 56, borderRadius: 8, flex: 'none', background: grown ? 'var(--accent)' : 'var(--muted)', transition: 'background 0.4s' }}
        initial={false}
        animate={{ width: (grown ? times : 1) * UNIT }}
        transition={t({ duration: 1.2 })}
      />
      <div style={{ marginLeft: 20, fontSize: 30, fontWeight: 800, whiteSpace: 'nowrap', color: grown ? 'var(--fg)' : 'var(--fg-sub)' }}>{children}</div>
    </div>
  )
}

function Deploys() {
  return (
    <>
      <Headline>{['デプロイ数の推移', 'エンジニアは 3.5 倍に増えた', 'デプロイ数は 43 倍になった']}</Headline>
      <div className="label" style={{ position: 'absolute', left: BAR_LEFT, top: 196 }}>
        基準を 1 としたときの倍率
      </div>
      <Row label="エンジニア数" top={250} times={3.5} at={1}>
        <CountUp values={[1, 3.5]} decimals={1} /> 倍<span style={{ fontSize: 24, fontWeight: 600, color: 'var(--fg-sub)' }}>（10 → 35 人）</span>
      </Row>
      <Row label="デプロイ数" top={380} times={43} at={2}>
        <CountUp values={[1, 1, 43]} /> 倍
      </Row>
      <Reveal at={2} delay={1.2} style={{ position: 'absolute', left: 96, top: 520, fontSize: 32, fontWeight: 700 }}>
        人数の増加だけでは説明できない伸び
      </Reveal>
      <div className="source">出典: Productivity チームの発表資料（AI DevEX Conference 2026）</div>
    </>
  )
}

export default defineScene({
  id: 'deploys',
  title: 'デプロイ数の推移',
  steps: 3,
  Component: Deploys,
  notes: [
    'ここから現在地についてです。Productivity チームの発表資料にある数字です。',
    'エンジニアは 10 人から 35 人に増えました。3.5 倍です。',
    'その間に、デプロイ数は 43 倍になりました。人数の増加だけでは説明できない伸びです。',
  ],
})
