// 課題を「AI 以前からあったか」で仕分け、AI がそれを増幅したことを見せる
// 動きの役割: 強調 (問い) → 関係性の変化 (仕分け) → 強調 (DORA) → オブジェクトの変化 (増幅)
import { Headline, Morph, Reveal, defineScene } from '@hokuchi/stage'

const PROBLEMS = [
  { id: 'debt', text: '開発速度が上がるほど蓄積しやすくなる技術的負債', old: true, since: '1992 年〜' },
  { id: 'ai', text: 'AI 活用における方針や責任範囲の曖昧さ', old: false },
  { id: 'balance', text: '短期的なスピードと長期的な品質・保守性の両立', old: true },
  { id: 'knowledge', text: '知識共有や人材育成、成果の評価', old: true },
  { id: 'gap', text: '現場とマネジメント層の期待のずれ', old: true },
]

const row = (i: number) => ({ left: 200, top: 176 + i * 88, width: 880, height: 72 })
const sorted = (old: boolean, k: number) => (old ? { left: 96, top: 226 + k * 82, width: 780, height: 68 } : { left: 924, top: 226, width: 260, height: 150 })
const grown = (old: boolean, k: number) => (old ? { left: 96, top: 222 + k * 86, width: 840, height: 76 } : { left: 960, top: 226, width: 224, height: 150 })

function OldProblems() {
  let k = 0
  return (
    <>
      <Headline>
        {['このイベントが挙げている課題', 'これは AI が生んだ新しい課題でしょうか', 'ほとんどが前からあった課題です', 'AI は増幅器として働く', '放置できていた課題が放置できなくなった']}
      </Headline>
      <Reveal at={2} className="label" style={{ position: 'absolute', left: 96, top: 172 }}>
        AI 以前からあった
      </Reveal>
      <Reveal at={2} className="label" style={{ position: 'absolute', left: 924, top: 172 }}>
        AI で生まれた
      </Reveal>
      {PROBLEMS.map((p, i) => {
        const j = p.old ? k++ : 0
        return (
          <Morph
            key={p.id}
            box={[row(i), row(i), sorted(p.old, j), sorted(p.old, j), grown(p.old, j)]}
            tone={['', '', '', '', p.old ? 'hot' : 'dim']}
            refit={!p.old}
            style={{ fontSize: p.old ? 27 : 24 }}
          >
            {p.text}
            {p.since && (
              <Reveal at={2} delay={0.5} className="chip" style={{ position: 'absolute', right: -6, top: -32 }}>
                {p.since}
              </Reveal>
            )}
          </Morph>
        )
      })}
      <Reveal at={3} delay={0.2} style={{ position: 'absolute', left: 96, right: 96, top: 584 }}>
        <div style={{ fontSize: 30, fontWeight: 800 }}>AI は強みも機能不全も増幅させる</div>
        <div style={{ fontSize: 18, color: 'var(--fg-sub)', marginTop: 6 }}>DORA『AI 支援型ソフトウェア開発の現状 2025』エグゼクティブ サマリー</div>
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'old-problems', steps: 5, Component: OldProblems })
