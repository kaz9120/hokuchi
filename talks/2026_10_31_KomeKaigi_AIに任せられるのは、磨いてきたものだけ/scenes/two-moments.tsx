// 人が入った 2 つの場面。7 月から 10 月の時間の帯に旗が 2 本立ち、帯の下に見てほしいことの 1 文。最後に 7 月の旗を強調色にして、次のシーンの入口にする。
// この帯は board-memory の前 (10 月の話に移るとき) でもう一度出て、10 月の旗へ寄る
// 動きの役割: 画面の演出 (帯を引いて旗を立てる) → 強調 (7 月の旗)
import { Headline, Reveal, defineScene, useActive, useStep } from '@hokuchi/stage'
import { Timeline } from './_timeline'


function TwoMoments() {
  const step = useStep()
  const active = useActive()
  return (
    <>
      <Headline>人が入った場面を 2 つ見ます</Headline>
      {/* シーンに入ってから帯を引き、旗を立てる */}
      <Timeline enter={active} flags={active} flagDelay={0.8} hot={step >= 1 ? 'jul' : undefined} />
      <Reveal at={1} style={{ position: 'absolute', left: 96, right: 96, top: 548, textAlign: 'center', fontSize: 30, fontWeight: 800, letterSpacing: '0.02em' }}>
        見てほしいのは AI が止まった所と 人の意思決定
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'two-moments', steps: 2, Component: TwoMoments })
