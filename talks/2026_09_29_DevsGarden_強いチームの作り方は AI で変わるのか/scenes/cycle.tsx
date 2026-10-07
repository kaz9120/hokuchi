// 1 チームの改善が、組織を通って他のチームへ広がる。動きの役割: 連続性 (流れ) + 関係性の変化
import { Connect, Headline, Morph, Reveal, defineScene } from '@hokuchi/stage'

const node = { position: 'absolute', top: 190, width: 400, height: 132, boxSizing: 'border-box', borderRadius: 18, padding: '22px 30px' } as const
const small = { fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)', letterSpacing: '0.04em' }
const big = { fontSize: 30, fontWeight: 800, marginTop: 8 }

const TEAMS = [
  { id: 'team-a', name: 'チーム A', left: 96, chip: 'WIP を減らしてリードタイムを半分に', at: 0 },
  { id: 'team-b', name: 'チーム B', left: 480, chip: '共有された工夫を使える', at: 3 },
  { id: 'team-c', name: 'チーム C', left: 864, chip: '共有された工夫を使える', at: 3 },
]

function Cycle() {
  return (
    <>
      <Headline>{['改善するのは各チーム', 'Excellence が声を集めて共有する', '仕組みにできるものは組織の仕組みにする', 'チームの改善を組織に広げる']}</Headline>

      <Reveal at={1} node="excellence" className="card tone-accent" style={{ ...node, left: 140, display: 'block' }}>
        <div style={small}>Engineer Excellence 会議</div>
        <div style={big}>声を集めて共有する</div>
      </Reveal>
      <Reveal at={2} node="org" className="card" style={{ ...node, left: 740, display: 'block' }}>
        <div style={small}>組織</div>
        <div style={big}>ルールや道具にして還元</div>
      </Reveal>

      {TEAMS.map((tm) => (
        <Morph
          key={tm.id}
          node={tm.id}
          box={[{ left: tm.left, top: 520, width: 320, height: 140 }]}
          tone={tm.at === 0 ? ['accent'] : ['', '', '', 'accent']}
          inner={{ display: 'grid', gap: 10 }}
        >
          <div style={{ fontSize: 28, fontWeight: 800 }}>{tm.name}</div>
          <Reveal at={tm.at} delay={tm.at > 0 ? 0.9 : 0} y={8} style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)' }}>
            {tm.chip}
          </Reveal>
        </Morph>
      ))}

      <Connect from="team-a" to="excellence" at={1} flow label="① 声を集めて共有" />
      <Connect from="excellence" to="org" at={2} flow curve={0} label="② 仕組みにする" labelOffset={[0, -34]} />
      <Connect from="org" to="team-b" at={3} flow fromShift={-60} />
      <Connect from="org" to="team-c" at={3} flow fromShift={60} delay={0.15} label="③ 他のチームへ" />
    </>
  )
}

export default defineScene({
  id: 'cycle',
  steps: 4,
  Component: Cycle,
})
