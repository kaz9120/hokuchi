// 課題を「AI 以前からあったか」で仕分け、古い課題が大きくなったことを見せる
// 動きの役割: 関係性の変化 (仕分け) → オブジェクトの変化 (強調)
import { Headline, Morph, Reveal, defineScene } from '@hokuchi/stage'

const PROBLEMS = [
  { id: 'debt', text: '開発速度が上がるほど蓄積しやすくなる技術的負債', old: true, since: '1992 年〜' },
  { id: 'ai', text: 'AI 活用における方針や責任範囲の曖昧さ', old: false },
  { id: 'balance', text: '短期的なスピードと長期的な品質・保守性の両立', old: true },
  { id: 'knowledge', text: '知識共有や人材育成、成果の評価', old: true },
  { id: 'gap', text: '現場とマネジメント層の期待のずれ', old: true },
]

const row = (i: number) => ({ left: 200, top: 180 + i * 88, width: 880, height: 72 })
const sorted = (old: boolean, k: number) => (old ? { left: 96, top: 230 + k * 92, width: 780, height: 76 } : { left: 924, top: 230, width: 260, height: 168 })

function OldProblems() {
  let k = 0
  return (
    <>
      <Headline>{['このイベントが挙げている課題', 'これは AI が生んだ新しい課題でしょうか', 'ほとんどが前からあった課題です', '放置できていた課題が放置できなくなった']}</Headline>
      <Reveal at={2} className="label" style={{ position: 'absolute', left: 96, top: 176 }}>
        AI 以前からあった
      </Reveal>
      <Reveal at={2} className="label" style={{ position: 'absolute', left: 924, top: 176 }}>
        AI で生まれた
      </Reveal>
      {PROBLEMS.map((p, i) => (
        <Morph
          key={p.id}
          box={[row(i), row(i), sorted(p.old, p.old ? k++ : 0)]}
          tone={['', '', '', p.old ? 'hot' : 'dim']}
          refit={!p.old}
          style={{ fontSize: p.old ? 28 : 26 }}
        >
          {p.text}
          {p.since && (
            <Reveal at={2} delay={0.5} className="chip" style={{ position: 'absolute', right: -8, top: -34 }}>
              {p.since}
            </Reveal>
          )}
        </Morph>
      ))}
      <Reveal at={3} delay={0.4} className="source">
        AI は強みも機能不全も増幅させる（DORA『AI 支援型ソフトウェア開発の現状 2025』）
      </Reveal>
    </>
  )
}

export default defineScene({
  id: 'old-problems',
  title: '前からあった課題',
  steps: 4,
  Component: OldProblems,
  notes: [
    'このイベントの募集文に並んでいた課題です。開発速度が上がるほど技術的負債が溜まる。AI 活用の方針と責任範囲が曖昧になる。スピードと品質をどう両立するか。知識共有と人材育成。成果の評価と、現場とマネジメントの期待のずれ。',
    'これは、AI が来たから新しく生まれた課題でしょうか。',
    'そのほとんどが、前からあった課題です。技術的負債という言葉は、1992 年にウォード・カニンガムが使い始めたものです。',
    '新しい課題が生まれたというより、これまで放置できていた課題が放置できなくなりました。DORA のレポートは、AI は強みも機能不全も増幅させると書いています。',
  ],
})
