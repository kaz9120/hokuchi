// 皆さんの仕事なら。3 行の表。左の列に将棋の場面 (小さく薄く)、右の列に皆さんの仕事での姿 (主役)。1 行ずつ出し、最後に右の列が強調色になる
// 動きの役割: 連続性 (行を 1 つずつ) → 強調 (右の列)
import { Headline, Reveal, defineScene, useStep } from '@hokuchi/stage'
import { MonthTag, type Month } from './_abstract'

const HEAD_TOP = 176
const ROW0 = 226
const ROW_H = 124
const ROW_GAP = 14
const LEFT = { x: 96, w: 340 }
const ARROW = { x: 448, w: 36 }
const RIGHT = { x: 500, w: 684 }

const ROWS: { month: Month; shogi: string; work: [string, string] }[] = [
  { month: '7 月', shogi: '部品を 1 つずつ移した', work: ['仕組みを 一部だけ移すと', '前提が欠けて動かない'] },
  { month: '10 月', shogi: '素直な 11×13 の盤', work: ['素直な作りが', '本番のデータ量で遅い'] },
  { month: '10 月', shogi: '書き直す範囲が大きい案を 見送った', work: ['書き直しが大きい案を', '最初から外す'] },
]

/** 置き換えの矢印 (左 → 右) */
function Arrow() {
  return (
    <svg width={ARROW.w} height={24} viewBox="0 0 36 24" style={{ display: 'block' }}>
      <path d="M2 12 H28" stroke="var(--muted)" strokeWidth={3} strokeLinecap="round" />
      <path d="M20 4 L30 12 L20 20" fill="none" stroke="var(--muted)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InYourWork() {
  const step = useStep()
  const hot = step >= 3
  return (
    <>
      <Headline>{['皆さんの仕事でも 同じ所で止まります', '皆さんの仕事でも 同じ所で止まります', 'AI は 書き直しの大きい案を 外しがちです', 'どれも 作業ではなく 決め方の場面です']}</Headline>

      {/* 列の見出し。左は小さく、右が主役 */}
      <div style={{ position: 'absolute', left: LEFT.x, top: HEAD_TOP, fontSize: 20, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>将棋では</div>
      <div style={{ position: 'absolute', left: RIGHT.x, top: HEAD_TOP - 4, fontSize: 24, fontWeight: 800, color: hot ? 'var(--accent-strong)' : 'var(--fg-sub)', letterSpacing: '0.04em', transition: 'color 0.5s' }}>皆さんの仕事では</div>

      {ROWS.map((r, i) => {
        const top = ROW0 + i * (ROW_H + ROW_GAP)
        return (
          <Reveal key={i} at={i} y={12} style={{ position: 'absolute', left: 0, top, width: 1280, height: ROW_H }}>
            {/* 将棋の場面 (小さく、薄く) */}
            <div style={{ position: 'absolute', left: LEFT.x, top: 0, width: LEFT.w, height: ROW_H, display: 'flex', alignItems: 'center', gap: 14 }}>
              <MonthTag month={r.month} style={{ flex: 'none', opacity: 0.8 }} />
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.4, color: 'var(--fg-sub)' }}>{r.shogi}</div>
            </div>
            <div style={{ position: 'absolute', left: ARROW.x, top: ROW_H / 2 - 12 }}>
              <Arrow />
            </div>
            {/* 皆さんの仕事での姿 (主役) */}
            <div className={`card ${hot ? 'tone-hot' : ''}`} style={{ position: 'absolute', left: RIGHT.x, top: 0, width: RIGHT.w, height: ROW_H, padding: '0 32px', borderColor: hot ? undefined : 'var(--fg-sub)' }}>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.4, color: hot ? 'var(--accent-strong)' : 'var(--fg)', transition: 'color 0.5s' }}>
                {r.work[0]}
                <br />
                {r.work[1]}
              </div>
            </div>
          </Reveal>
        )
      })}
    </>
  )
}

export default defineScene({ id: 'in-your-work', steps: 4, Component: InYourWork })
