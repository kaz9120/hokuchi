// 今日話したことを 4 点に畳む。話した順に 1 つずつ出す
// 動きの役割: 連続性
import { Headline, Reveal, defineScene } from '@hokuchi/stage'

const POINTS = [
  'AI で新しい課題が生まれたのではなく、前からある課題が放置できなくなった',
  'MOSH は生産性を技術的生産性と組織的生産性に分けている',
  'Excellence は声を集めて共有し、改善はチームが担う',
  'チームの取り組みを共有し、仕組みにする循環を回す',
]

function Summary() {
  return (
    <>
      <Headline>今日お話ししたこと</Headline>
      {POINTS.map((p, i) => (
        <Reveal key={p} at={i} delay={0.15} style={{ position: 'absolute', left: 96, right: 96, top: 176 + i * 116, display: 'flex', gap: 28, alignItems: 'baseline' }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.45 }}>{p}</span>
        </Reveal>
      ))}
    </>
  )
}

export default defineScene({ id: 'summary', steps: 4, Component: Summary })
