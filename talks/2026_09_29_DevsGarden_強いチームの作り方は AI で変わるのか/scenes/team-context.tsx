// メンバーが大きく入れ替わった新しいチーム。6 月から 8 月の出来事を時間軸に置く
// 動きの役割: 連続性 (時間が進む)
import { DrawPath, Headline, Reveal, defineScene } from '@hokuchi/stage'

const Y = 400
const EVENTS = [
  { x: 260, month: '6 月', text: '開発メンバーが大きく入れ替わる', at: 0 },
  { x: 640, month: '7 月', text: '商品の開発を別のチームから引き継ぐ', at: 1 },
  { x: 1020, month: '8 月', text: '公開の直前にユニットリードになる', at: 1 },
]

function TeamContext() {
  return (
    <>
      <Headline>メンバーが大きく入れ替わった新しいチーム</Headline>
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        <DrawPath d={`M 120 ${Y} L 260 ${Y}`} at={0} color="var(--muted)" width={4} />
        <DrawPath d={`M 260 ${Y} L 1160 ${Y}`} at={1} color="var(--muted)" width={4} />
      </svg>
      {EVENTS.map((e) => (
        <Reveal key={e.month} at={e.at} delay={e.at === 1 && e.x > 700 ? 0.6 : 0.3} style={{ position: 'absolute', left: e.x - 150, width: 300, top: Y - 108, textAlign: 'center' }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--accent)' }}>{e.month}</div>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', margin: '18px auto 0', boxShadow: '0 0 0 8px var(--accent-bg)' }} />
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 34, lineHeight: 1.5 }}>{e.text}</div>
        </Reveal>
      ))}
    </>
  )
}

export default defineScene({ id: 'team-context', steps: 2, Component: TeamContext })
