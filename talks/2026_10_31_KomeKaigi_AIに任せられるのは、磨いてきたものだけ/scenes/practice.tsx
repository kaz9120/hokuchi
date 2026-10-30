// どう磨くか。好きなことを本気でやってみる。2 つの札「専門性」「個性」の下に、いまそれぞれが磨きやすくなった理由を添える。
// 「ただし」は次の not-ai-alone で受ける
// 動きの役割: 連続性 (専門性と個性の話を受ける)
import { Headline, Reveal, defineScene } from '@hokuchi/stage'
import { KeywordTag, type KeywordName } from './_keyword'

const COLUMNS: readonly { word: KeywordName; reason: [string, string]; cx: number; delay: number }[] = [
  { word: '専門性', reason: ['経験が', '生かしやすくなった'], cx: 400, delay: 0.1 },
  { word: '個性', reason: ['やりたいことが', '実現しやすくなった'], cx: 880, delay: 0.5 },
]
const COL_W = 440
const COL_TOP = 300

function Practice() {
  return (
    <>
      <Headline>どう磨くか 好きなことを 本気でやってみる</Headline>

      {COLUMNS.map(({ word, reason, cx, delay }) => (
        <Reveal key={word} at={1} delay={delay} style={{ position: 'absolute', left: cx - COL_W / 2, top: COL_TOP, width: COL_W, display: 'grid', justifyItems: 'center', gap: 28 }}>
          <div style={{ transform: 'scale(1.5)', transformOrigin: 'center top', height: 54 }}>
            <KeywordTag word={word} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.35, textAlign: 'center', whiteSpace: 'nowrap' }}>
            {reason[0]}
            <br />
            {reason[1]}
          </div>
        </Reveal>
      ))}
    </>
  )
}

export default defineScene({ id: 'practice', steps: 2, Component: Practice })
