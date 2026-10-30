// 今日のまとめ。本編で使った言葉をそのまま 5 項目、話した順に 1 つずつ出す。済んだ項目は薄くする
// 動きの役割: 連続性
import { Headline, Reveal, defineScene, useStep } from '@hokuchi/stage'

const POINTS = ['AI に任せきる手法は 将棋で通じた', 'ただし AI だけでは 3200 点前後で止まった', '止まるのは 決め方が問われる所', '差を埋めるのは 専門性と個性', 'どちらも 好きなことを本気でやれば磨ける']

function Summary() {
  const step = useStep()
  return (
    <>
      <Headline>今日のまとめ</Headline>
      <div style={{ position: 'absolute', left: 96, right: 96, top: 186, display: 'grid', gap: 34 }}>
        {POINTS.map((p, i) => (
          <Reveal key={p} at={i} delay={0.15} style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            {/* 済んだ項目は薄く。Reveal が不透明度を持つので、中身で下げる */}
            <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', opacity: i < step ? 0.4 : 1, transition: 'opacity 0.5s' }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.4 }}>{p}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </>
  )
}

export default defineScene({ id: 'summary', steps: 5, Component: Summary })
