// 生産性の 2 分類から、組織的生産性へ寄っていく。動きの役割: 画面の演出 (ズームイン)
import { Headline, Morph, Reveal, defineScene, pick, useStep } from '@hokuchi/stage'

const TECH_ITEMS = ['開発基盤の改善', 'テスト自動化', 'モニタリング整備']
const ORG_ITEMS = ['開発プロセスの見直し', 'レビュー文化の形成', 'ナレッジの循環']
const ORG_SCOPE = ['開発プロセスの整備', 'チームの連携', '目標の設計', 'ナレッジの循環']

const card = { borderRadius: 20, padding: '40px 44px', alignItems: 'flex-start' } as const
const title = { fontSize: 38, fontWeight: 800, whiteSpace: 'nowrap', transition: 'font-size 0.5s' } as const
const desc = { fontSize: 26, color: 'var(--fg-sub)', marginTop: 10, fontWeight: 600 }
const list = { marginTop: 36, display: 'grid', gap: 18 }

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((s) => (
        <div key={s} className="bullet">
          {s}
        </div>
      ))}
    </>
  )
}

function Productivity() {
  const step = useStep()
  return (
    <>
      <Headline>{['生産性に関する取り組みの分類', '今日は組織的生産性の話をします', '組織的生産性で扱うこと']}</Headline>

      <Morph
        box={[
          { left: 96, top: 176, width: 528, height: 432 },
          { left: 96, top: 176, width: 300, height: 432 },
          { left: -360, top: 176, width: 300, height: 432 },
        ]}
        tone={['', 'quiet']}
        style={card}
      >
        <div style={{ ...title, fontSize: pick(step, [38, 30]) }}>技術的生産性</div>
        <Reveal at={0} until={1} style={desc}>
          技術基盤を整えて開発を速くする
        </Reveal>
        <Reveal at={0} until={1} style={list}>
          <Bullets items={TECH_ITEMS} />
        </Reveal>
        <Reveal at={1} delay={0.3} style={{ ...desc, fontSize: 24 }}>
          Productivity チームが発表済み
          <div style={{ fontSize: 20, marginTop: 12, fontWeight: 400 }}>AI DevEX Conference 2026</div>
        </Reveal>
      </Morph>

      <Morph
        box={[
          { left: 656, top: 176, width: 528, height: 432 },
          { left: 428, top: 176, width: 756, height: 432 },
          { left: 96, top: 176, width: 1088, height: 432 },
        ]}
        tone={['', 'accent']}
        style={card}
      >
        <div style={title}>組織的生産性</div>
        <div style={desc}>プロセスと連携を整えてチームを強くする</div>
        <Reveal at={0} until={2} style={list}>
          <Bullets items={ORG_ITEMS} />
        </Reveal>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 124, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {ORG_SCOPE.map((s, i) => (
            <Reveal key={s} at={2} delay={0.35 + i * 0.08} className="tile">
              {s}
            </Reveal>
          ))}
        </div>
        <Reveal at={2} delay={0.75} style={{ ...desc, position: 'absolute', left: 0, top: 316, margin: 0 }}>
          どれも機械では判定できず、人と人が話して決める
        </Reveal>
      </Morph>
    </>
  )
}

export default defineScene({
  id: 'productivity',
  steps: 3,
  Component: Productivity,
})
