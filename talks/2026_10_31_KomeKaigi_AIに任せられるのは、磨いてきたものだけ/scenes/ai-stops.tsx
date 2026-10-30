// AI が止まる所。左の列に AI が速く正しくこなす作業 4 つ、右の列に AI が止まる決め方 2 つ (7 月・10 月)。最後に右の列が強調色になる
// 動きの役割: 連続性 (作業が 1 つずつ並ぶ) → 関係性の変化 (止まる所が隣に並ぶ) → 強調 (右の列)
import { Headline, Reveal, defineScene, useStep } from '@hokuchi/stage'
import { ColumnHead, MonthTag, type Month } from './_abstract'

const TOP = 180
const LEFT = { x: 96, w: 500 }
const RIGHT = { x: 684, w: 500 }
const ROW0 = 250

const DOES = ['ソースコードを読む', '移す', '86 万局面を確かめる', '対局させる']
const STOPS: { lines: [string, string]; month: Month }[] = [
  { lines: ['どこまでを', '一組で扱うか'], month: '7 月' },
  { lines: ['何を', '良しとするか'], month: '10 月' },
]
const DO_H = 64
const DO_GAP = 16
const STOP_H = 144
const STOP_GAP = 24

/** 済んだ印。速く正しくこなす作業に付ける */
function Check() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" style={{ display: 'block', flex: 'none' }}>
      <path d="M5 14.5 L11.5 21 L23 8" fill="none" stroke="var(--fg-sub)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AiStops() {
  const step = useStep()
  const hot = step >= 2
  return (
    <>
      <Headline>{['AI は 一つひとつの作業を 速く正しくこなします', 'AI が止まるのは 決め方が問われる所です', 'AI が止まるのは 決め方が問われる所です']}</Headline>

      {/* 左の列: 速く正しくこなす所。右の列が主役になったら退く */}
      <div style={{ position: 'absolute', inset: 0, opacity: hot ? 0.45 : 1, transition: 'opacity 0.5s' }}>
        <ColumnHead left={LEFT.x} top={TOP} width={LEFT.w}>
          AI が速く正しくこなす所
        </ColumnHead>
        {DOES.map((d, i) => (
          <Reveal key={d} at={0} delay={0.3 + i * 0.18} className="card" style={{ position: 'absolute', left: LEFT.x, top: ROW0 + i * (DO_H + DO_GAP), width: LEFT.w, height: DO_H, gap: 18, fontSize: 28, fontWeight: 700 }}>
            <Check />
            {d}
          </Reveal>
        ))}
      </div>

      {/* 右の列: 止まる所 */}
      <Reveal at={1} y={0} style={{ position: 'absolute', inset: 0 }}>
        <ColumnHead left={RIGHT.x} top={TOP} width={RIGHT.w} hot={hot}>
          AI が止まる所
        </ColumnHead>
      </Reveal>
      {STOPS.map((s, i) => (
        <Reveal
          key={s.month}
          at={1}
          delay={0.4 + i * 0.5}
          className={`card ${hot ? 'tone-hot' : ''}`}
          style={{ position: 'absolute', left: RIGHT.x, top: ROW0 + i * (STOP_H + STOP_GAP), width: RIGHT.w, height: STOP_H, borderColor: hot ? undefined : 'var(--fg-sub)', padding: '0 32px', gap: 24, alignItems: 'center' }}
        >
          <MonthTag month={s.month} hot={hot} style={{ flex: 'none' }} />
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.4, color: hot ? 'var(--accent-strong)' : 'var(--fg)', transition: 'color 0.5s' }}>
            {s.lines[0]}
            <br />
            {s.lines[1]}
          </div>
        </Reveal>
      ))}

      <Reveal at={2} delay={0.3} style={{ position: 'absolute', left: RIGHT.x, top: ROW0 + 2 * STOP_H + STOP_GAP + 34, fontSize: 32, fontWeight: 800, whiteSpace: 'nowrap' }}>
        決め方は 経験から出てくる
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'ai-stops', steps: 3, Component: AiStops })
