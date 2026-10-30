// 問いへの答え。question と同じ位置に問いを出し、問いが上に退いて答えが主役の位置に来る
// 動きの役割: 強調 (問い → 答え)
import { Reveal, defineScene } from '@hokuchi/stage'
import { Accent, BELOW_TOP, Dialogue, QUESTION, type Line } from './_question'

const LINES: readonly Line[] = [
  { key: 'question', big: 0, small: 1, node: QUESTION },
  {
    key: 'answer',
    big: 1,
    // 続きの文が出たら、強調はそちらへ移す
    node: (_small, step) => (
      <>
        AI に任せるほど
        <br />
        <Accent on={step === 1}>差は人の経験で付きます</Accent>
      </>
    ),
  },
]

function Answer() {
  return (
    <Dialogue lines={LINES} label={['今日の問い', '答え']}>
      <Reveal at={2} style={{ position: 'absolute', left: 120, top: BELOW_TOP, fontSize: 38, fontWeight: 800, color: 'var(--accent-strong)' }}>
        だから 磨き続ける人が強い
      </Reveal>
    </Dialogue>
  )
}

export default defineScene({ id: 'answer', steps: 3, Component: Answer })
