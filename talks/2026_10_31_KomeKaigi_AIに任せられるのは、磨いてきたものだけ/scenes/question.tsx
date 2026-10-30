// 今日の問い。前提の文が上に退き、問いが主役の位置に来る。answer のシーンで同じ位置の問いが答えに変わる (前振りと締めの対)
// 動きの役割: 強調 (問いへの差し替え)
import { defineScene } from '@hokuchi/stage'
import { Dialogue, QUESTION, type Line } from './_question'

const LINES: readonly Line[] = [
  {
    key: 'now',
    big: 0,
    small: 1,
    node: (
      <>
        実装の大半は
        <br />
        AI に任せられるようになりました
      </>
    ),
  },
  { key: 'question', big: 1, node: QUESTION },
]

function Question() {
  return <Dialogue lines={LINES} label={['', '今日の問い']} />
}

export default defineScene({ id: 'question', steps: 2, Component: Question })
