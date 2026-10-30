// 今日の流れ。5 つの章の箱が左から順に並び、「将棋の話」「皆さんの話」の 2 つに括られる。
// 箱の並びと言葉、箱の間の › は、以降の画面の左下に出る章の案内 (talk.tsx の ChapterNav) と同じ。この並びがそのまま案内になる
// 動きの役割: 連続性 (左から順に出る) → 関係性の変化 (2 つに括られ、後半が強調色になる)
import { DrawPath, Headline, Reveal, defineScene, useStep } from '@hokuchi/stage'

const CHAPTERS = [
  { name: '実験', what: '何を確かめたか' },
  { name: '結果', what: 'どこまで届いたか' },
  { name: '人が入った場面', what: 'AI が止まった所' },
  { name: '将棋の外へ', what: '仕事に置き換える' },
  { name: '磨く', what: '経験をどう積むか' },
]
const GROUPS = [
  { from: 0, to: 2, name: '将棋の話', hot: false },
  { from: 3, to: 4, name: '皆さんの話', hot: true },
]

const LEFT = 96
const W = 196
const GAP = 27
const TOP = 290
const H = 104
const x = (i: number) => LEFT + i * (W + GAP)
/** 箱の下の 1 行 (その章で分かること) */
const CAPTION_TOP = TOP + H + 14
/** 括弧の横線の y */
const BRACE_Y = CAPTION_TOP + 28 + 26
/** 箱が順に出る間隔 (秒) */
const STAGGER = 0.3

/** 下向きに開いた括弧 ⎵。両端が少し上に立つ */
const brace = (from: number, to: number) => {
  const x0 = x(from) + 6
  const x1 = x(to) + W - 6
  return `M ${x0} ${BRACE_Y - 12} L ${x0} ${BRACE_Y} L ${x1} ${BRACE_Y} L ${x1} ${BRACE_Y - 12}`
}

function Map() {
  const step = useStep()
  return (
    <>
      <Headline>{['将棋 AI の実験から答えます', '後半は 皆さんの仕事に置き換えます']}</Headline>

      {CHAPTERS.map((c, i) => {
        const hot = step >= 1 && i >= GROUPS[1].from
        return (
          <Reveal key={c.name} at={0} delay={i * STAGGER} style={{ position: 'absolute', left: x(i), top: TOP, width: W }}>
            <div
              className={`card ${hot ? 'tone-hot' : ''}`}
              style={{ height: H, justifyContent: 'center', padding: '0 8px', fontSize: 24, fontWeight: 800, letterSpacing: '0.02em', whiteSpace: 'nowrap', color: hot ? 'var(--accent-strong)' : 'var(--fg)' }}
            >
              {c.name}
            </div>
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)', whiteSpace: 'nowrap' }}>{c.what}</div>
          </Reveal>
        )
      })}

      {/* 箱の間の › 。左下の章の案内と同じ区切り */}
      {CHAPTERS.slice(1).map((_, i) => (
        <Reveal
          key={i}
          at={0}
          delay={i * STAGGER + STAGGER * 0.6}
          y={0}
          style={{ position: 'absolute', left: x(i) + W, top: TOP, width: GAP, height: H, display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 700, color: 'var(--muted)' }}
        >
          ›
        </Reveal>
      ))}

      {/* 括弧。将棋の話を先に、皆さんの話を続けて引く */}
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        {GROUPS.map((g) => (
          <DrawPath key={g.name} d={brace(g.from, g.to)} at={1} color={g.hot ? 'var(--accent)' : 'var(--fg-sub)'} width={3} delay={g.hot ? 0.35 : 0} />
        ))}
      </svg>
      {GROUPS.map((g) => (
        <Reveal
          key={g.name}
          at={1}
          delay={g.hot ? 0.85 : 0.5}
          y={8}
          style={{ position: 'absolute', left: x(g.from), width: x(g.to) + W - x(g.from), top: BRACE_Y + 12, textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: '0.04em', color: g.hot ? 'var(--accent-strong)' : 'var(--fg-sub)' }}
        >
          {g.name}
        </Reveal>
      ))}
    </>
  )
}

export default defineScene({ id: 'map', steps: 2, Component: Map })
