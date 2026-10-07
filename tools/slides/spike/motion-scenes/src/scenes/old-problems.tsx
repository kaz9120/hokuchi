// 課題を「AI 以前からあったか」で仕分ける。動きの役割: 関係性の変化 (仕分け) → オブジェクトの変化 (増幅)
import { motion } from 'motion/react'
import { t, useStep } from '../runtime/deck'
import { Reveal, Swap } from '../runtime/kit'

const PROBLEMS = [
  { id: 'debt', text: '開発速度が上がるほど蓄積しやすくなる技術的負債', old: true, since: '1992 年〜' },
  { id: 'ai', text: 'AI 活用における方針や責任範囲の曖昧さ', old: false },
  { id: 'balance', text: '短期的なスピードと長期的な品質・保守性の両立', old: true },
  { id: 'knowledge', text: '知識共有や人材育成、成果の評価', old: true },
  { id: 'gap', text: '現場とマネジメント層の期待のずれ', old: true },
]

const HEADLINES = [
  'このイベントが挙げている課題',
  'これは AI が生んだ新しい課題でしょうか',
  'ほとんどが前からあった課題です',
  '放置できていた課題が放置できなくなった',
]

// 状態ごとの配置。0-1: 1 列に並べる / 2-3: 左右に仕分ける
function place(i: number, old: boolean, oldIndex: number, sorted: boolean) {
  if (!sorted) return { left: 200, top: 180 + i * 88, width: 880, height: 72 }
  if (old) return { left: 96, top: 230 + oldIndex * 92, width: 780, height: 76 }
  return { left: 924, top: 230, width: 260, height: 168 }
}

export function OldProblems() {
  const step = useStep()
  const sorted = step >= 2
  const amplified = step >= 3
  let oldIndex = 0

  return (
    <>
      <Swap k={HEADLINES[step]} className="headline">
        {HEADLINES[step]}
      </Swap>

      <Reveal at={2} className="label" style={{ position: 'absolute', left: 96, top: 176 }}>
        AI 以前からあった
      </Reveal>
      <Reveal at={2} className="label" style={{ position: 'absolute', left: 924, top: 176 }}>
        AI で生まれた
      </Reveal>

      {PROBLEMS.map((p, i) => {
        const pos = place(i, p.old, p.old ? oldIndex++ : 0, sorted)
        const hot = amplified && p.old
        return (
          <motion.div
            key={p.id}
            layout
            className="card"
            style={{ ...pos, fontSize: sorted && !p.old ? 26 : 28 }}
            initial={false}
            animate={{
              backgroundColor: hot ? '#fde3e5' : '#ffffff',
              borderColor: hot ? '#fa6e78' : '#ebe3e1',
              opacity: amplified && !p.old ? 0.35 : 1,
            }}
            transition={t()}
          >
            <motion.span
              key={String(sorted || p.old)}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ delay: p.old ? 0 : 0.45, duration: 0.3 })}
            >
              {p.text}
            </motion.span>
            {p.since && (
              <Reveal
                at={2}
                delay={0.5}
                style={{
                  position: 'absolute',
                  right: 20,
                  top: -16,
                  background: 'var(--ink)',
                  color: '#fff',
                  fontSize: 20,
                  fontWeight: 700,
                  padding: '2px 12px',
                  borderRadius: 999,
                }}
              >
                {p.since}
              </Reveal>
            )}
          </motion.div>
        )
      })}

      <Reveal at={3} delay={0.4} className="source">
        AI は強みも機能不全も増幅させる（DORA『AI 支援型ソフトウェア開発の現状 2025』）
      </Reveal>
    </>
  )
}
