// 同じ AI は同じ所で止まる。3 人の人型の上に同じ AI の印。全員から上へ線が伸び、同じ高さの横線で止まる。最後に 1 人だけが線を越える
// 図は _trio.tsx (callback で小さく戻る)。横線は result のグラフの「AI が自分で届いた線」と同じ見た目 (_abstract の REACH_LINE)
// 動きの役割: 連続性 (線が上へ伸びる) → 強調 (1 人だけ越える)
import { Headline, defineScene, useActive, useStep } from '@hokuchi/stage'
import { Trio } from './_trio'

/** 大きく出す。足元 632 で、越えた線の先が 190 */
export const SAME_AI_GEOM = { cx: 640, foot: 632, scale: 1 }

function SameAi() {
  const step = useStep()
  const active = useActive()
  return (
    <>
      <Headline>{['誰でも 同じ AI を使えます', '同じ AI は 同じ所で止まります', '差が付くのは 止まったあとです']}</Headline>
      <Trio geom={SAME_AI_GEOM} on={active} lines={step >= 1} beyond={step >= 2} label={step >= 1} />
    </>
  )
}

export default defineScene({ id: 'same-ai', steps: 3, Component: SameAi })
