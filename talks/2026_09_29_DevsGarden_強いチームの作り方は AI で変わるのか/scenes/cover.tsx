// 表紙と締め。締めでは表紙と同じ位置に問いが戻り、答えに変わる (前振りと対にする)
import { Swap, defineScene, useStep } from '@hokuchi/stage'
import cover from '@hokuchi/stage/themes/mosh/assets/bg-cover.svg'
import { COVER_TITLE, coverScene } from '../../../parts/cover'

const bg = `url(${cover}) center / cover`

export const title = coverScene({
  background: bg,
  title: (
    <>
      強いチームの作り方は
      <br />
      <span style={{ color: 'var(--accent)' }}>AI で変わるのか</span>
    </>
  ),
})

function Closer() {
  const step = useStep()
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg }}>
      <div style={COVER_TITLE}>
        強いチームの作り方は
        <Swap style={{ color: 'var(--accent)' }}>{step === 0 ? 'AI で変わるのか' : '変わっていません'}</Swap>
      </div>
    </div>
  )
}

export const closer = defineScene({ id: 'closer', steps: 2, Component: Closer })
