// 一人が受け取る情報が、受け取れる上限を越えていく。あふれた分を Excellence が 1on1 で受け止める
// 動きの役割: オブジェクトの変化 (積み上がって越える) → 関係性の変化 (受け止める)
import { Headline, Morph, Reveal, defineScene, t, useActive } from '@hokuchi/stage'
import { Person } from './_common'

const LIMIT = 300 // 上限の線の y
const BLOCKS = ['開発 A', '開発 B', '開発 C', '開発 D', '開発 E', '開発 F', '開発 G']
const BH = 44
const BASE = 520 // いちばん下のブロックの上端

function Next() {
  const active = useActive()
  const shown = active ? BLOCKS.length : 3
  return (
    <>
      <Headline>{['加速する開発が人の認知の限界を超えている', '本人の努力に任せず中立な組織が支える']}</Headline>

      <Reveal at={1} delay={0.1} className="card tone-accent" style={{ position: 'absolute', left: 796, top: 250, width: 388, height: 300, display: 'block', padding: '24px 28px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>Engineer Excellence 会議</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>1on1 で声を聞く</div>
      </Reveal>

      <Person x={260} y={610} size={96} />
      <div style={{ position: 'absolute', left: 96, width: 560, top: LIMIT - 2, borderTop: '3px dashed var(--fg-sub)' }} />
      <div style={{ position: 'absolute', left: 400, top: LIMIT - 40, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>一人が把握できる上限</div>

      {BLOCKS.map((b, i) => {
        const top = BASE - i * (BH + 8)
        const over = top < LIMIT
        const k = BLOCKS.filter((_, j) => BASE - j * (BH + 8) < LIMIT).indexOf(b)
        const stack = { left: 160, top, width: 200, height: BH }
        const caught = { left: 812 + (k % 2) * 186, top: 420 + Math.floor(k / 2) * 56, width: 170, height: BH }
        return (
          <Morph
            key={b}
            box={over ? [stack, caught] : [stack]}
            tone={[over ? 'hot' : '', over ? 'accent' : '']}
            // 画面に出てから、下から順に積み上がる
            look={[{ opacity: i < shown ? 1 : 0, transition: t({ delay: 0.3 + (i - 3) * 0.25 }) }]}
            inner={{ textAlign: 'center' }}
            style={{ justifyContent: 'center', padding: 0, fontSize: 20, borderRadius: 10 }}
          >
            {b}
          </Morph>
        )
      })}

      <Reveal at={1} delay={1.0} style={{ position: 'absolute', left: 796, top: 580, width: 388, fontSize: 22, fontWeight: 600, color: 'var(--fg-sub)', lineHeight: 1.6 }}>
        良い取り組みが循環する組織にする
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'next', steps: 2, Component: Next })
