// 今日話したことを 4 点に畳む (前提・組織・チーム・これから)。話した順に 1 つずつ出す
// 動きの役割: 連続性
import { Headline, Reveal, defineScene } from '@hokuchi/stage'

const POINTS = [
  'AI で新しい課題が生まれたのではなく、前からある課題が放置できなくなった',
  '組織的生産性では、Excellence が声を集めて共有し、改善はチームが担う',
  'チームでは、考え方を話し合う時間を取り、仕組みにできることは仕組みにする',
  'これからは、Excellence がチームをつなぎ、一人ひとりの声を聞いて寄り添う',
]

function Summary() {
  return (
    <>
      <Headline>今日お話ししたこと</Headline>
      {/* 行数が違っても間隔が揃うよう、固定の位置ではなく縦に流す。後の点は下に足されるだけなので、前の点は動かない */}
      <div style={{ position: 'absolute', left: 96, right: 96, top: 170, display: 'grid', gap: 30 }}>
        {POINTS.map((p, i) => (
          <Reveal key={p} at={i} delay={0.15} style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.45, textWrap: 'pretty' }}>{p}</span>
          </Reveal>
        ))}
      </div>
    </>
  )
}

export default defineScene({ id: 'summary', steps: 4, Component: Summary })
