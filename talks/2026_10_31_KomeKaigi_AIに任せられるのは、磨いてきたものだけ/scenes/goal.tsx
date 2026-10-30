// 強さの物差し。基準、トップ、成功の線の順に置く。この目盛りは result でグラフの縦軸になる
// 動きの役割: 強調 (成功の線)
import { Swap, defineScene, pick, useStep } from '@hokuchi/stage'
import { FULL, Scale } from './_scale'

const HEADS = ['強さは 対局場の点数で測ります', '強さは 対局場の点数で測ります', '強さは 対局場の点数で測ります', '成功の線は 4000 点に置きました']

function Goal() {
  const step = useStep()
  return (
    <>
      <Swap className="headline">{pick(step, HEADS)}</Swap>
      <Scale L={FULL} caption basis={step >= 1} band={step >= 2} goal={step >= 3} />
    </>
  )
}

export default defineScene({ id: 'goal', steps: 4, Component: Goal })
