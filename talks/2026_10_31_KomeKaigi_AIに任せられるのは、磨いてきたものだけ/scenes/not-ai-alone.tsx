// 試すのが AI だけでは磨かれない。six-losses の 6 枚のカードが小さく戻り、そのあと「磨く」の定義に差し替える
// 定義の下に、問い → 行動 → 受け止める が輪になって次の問いへ戻る図を置く (磨き続ける)
// 動きの役割: 強調 (文の差し替え)、連続性 (輪を 1 本ずつ引く)
import { Connect, Reveal, Swap, defineScene, pick, useStep } from '@hokuchi/stage'
import { LossCards, type Row } from './_losses'

const HEADS = ['ただし 試すのが AI だけでは磨かれません', '磨くとは 自分の問いで行動して\n結果を自分で受け止めること']
const ROW: Row = { left: 125, top: 330, width: 160, height: 84, gap: 14 }

// 輪の 3 つの箱。主語はどれも自分
const STEPS = [
  { id: 'ask', label: '自分の問いを立てる', left: 150 },
  { id: 'act', label: '行動する', left: 500 },
  { id: 'take', label: '結果を受け止める', left: 850 },
]
const BOX = { top: 340, width: 280, height: 96 }

function NotAiAlone() {
  const step = useStep()
  return (
    <>
      <Swap className="headline" style={{ whiteSpace: 'pre-line' }}>
        {pick(step, HEADS)}
      </Swap>
      <Reveal at={0} until={1} y={0} className="label" style={{ position: 'absolute', left: ROW.left, top: ROW.top - 44, fontSize: 20 }}>
        7 月の終わり
      </Reveal>
      <LossCards on={step === 0} row={ROW} />

      {STEPS.map((s, i) => (
        <Reveal
          key={s.id}
          at={1}
          node={s.id}
          delay={0.6 + i * 0.5}
          className="card"
          style={{ position: 'absolute', left: s.left, top: BOX.top, width: BOX.width, height: BOX.height, display: 'grid', placeContent: 'center', textAlign: 'center', fontSize: 30, fontWeight: 800, boxSizing: 'border-box', ...(i === 2 ? { borderColor: 'var(--accent)', color: 'var(--accent-strong)' } : {}) }}
        >
          {s.label}
        </Reveal>
      ))}
      <Connect from="ask" to="act" at={1} curve={0} delay={1.0} />
      <Connect from="act" to="take" at={1} curve={0} delay={1.5} />
      <Connect from="take" to="ask" at={1} delay={2.0} fromSide="bottom" toSide="bottom" curve={0.15} label="次の問いへ" flow />
    </>
  )
}

export default defineScene({ id: 'not-ai-alone', steps: 2, Component: NotAiAlone })
