// チームでしていること 2 つ。2 つ目では、一人に集中していた知識がチームの仕組みに移る
// 動きの役割: 画面の演出 (2 つ目へ寄る) → 関係性の変化 (知識が移る)
import { Connect, Headline, Morph, Reveal, defineScene, useStep } from '@hokuchi/stage'
import { Person } from './_common'

const card = { alignItems: 'flex-start', padding: '36px 40px', borderRadius: 20 } as const
const title = { fontSize: 34, fontWeight: 800, lineHeight: 1.4 }
const example = { fontSize: 22, fontWeight: 700, color: 'var(--fg-sub)', marginTop: 16 }

// 知識を持つ一人 (左) から、チーム全員 (右下) と毎日の自動検知 (右上) へ
// 図はカードの余白 (右 40px・下 36px) の内側に収める
const HOLDER = { x: 610, y: 470 }
const MEMBERS = [860, 970, 1080]
const DIAGRAM = { left: 800, width: 340 }

function TeamPractice() {
  const step = useStep()
  return (
    <>
      <Headline>{['考え方を話し合う時間を取る', '仕組みで解決できることは仕組みにする', '仕組みで解決できることは仕組みにする']}</Headline>

      <Morph
        box={[
          { left: 96, top: 170, width: 1088, height: 470 },
          { left: 96, top: 170, width: 380, height: 470 },
        ]}
        tone={['accent', 'quiet']}
        style={card}
      >
        <div style={{ ...title, fontSize: step === 0 ? 34 : 26, transition: 'font-size 0.5s' }}>考え方を話し合う時間を取る</div>
        <div style={example}>例: AI の使い方を 30 分話し合った</div>
        <Reveal at={0} until={1} style={{ marginTop: 40 }}>
          <div className="label" style={{ fontSize: 20 }}>全員で確認したこと</div>
          <div style={{ marginTop: 12, fontSize: 34, fontWeight: 800, lineHeight: 1.6, paddingLeft: 24, borderLeft: '6px solid var(--accent)' }}>
            AI が書く、AI が読む前提で進める
            <br />
            ただし、出したものは説明できるように把握しておく
          </div>
          <div style={{ marginTop: 24, fontSize: 22, color: 'var(--fg-sub)', fontWeight: 600 }}>目的は意見を揃えることではなく、お互いのスタンスを知ること</div>
        </Reveal>
      </Morph>

      <Reveal at={1} delay={0.3}>
        <Morph box={[{ left: 508, top: 170, width: 676, height: 470 }]} tone={['accent']} style={card}>
          <div style={title}>仕組みで解決できることは仕組みにする</div>
          <div style={example}>例: 公開直後の障害。移行作業の知識が一人に集中していた</div>
        </Morph>
      </Reveal>

      {/* 知識が一人からチームと仕組みへ移る */}
      <Reveal at={1} delay={0.6}>
        <Person x={HOLDER.x} y={HOLDER.y} size={96} tone="accent" node="holder" />
        <div className="chip" style={{ position: 'absolute', left: HOLDER.x - 26, top: HOLDER.y + 58 }}>
          知識
        </div>
      </Reveal>
      <Reveal
        at={1}
        delay={0.7}
        node="team"
        style={{ position: 'absolute', left: DIAGRAM.left, top: 512, width: DIAGRAM.width, height: 92, borderRadius: 16, border: '2px dashed var(--line)', boxSizing: 'border-box' }}
      >
        {MEMBERS.map((x) => (
          <Person key={x} x={x - DIAGRAM.left - 2} y={46} size={68} tone={step >= 2 ? 'accent' : 'muted'} />
        ))}
      </Reveal>
      <Reveal at={1} delay={0.7} node="auto" className="card" style={{ position: 'absolute', left: DIAGRAM.left, top: 372, width: DIAGRAM.width, height: 76, justifyContent: 'center', fontSize: 22 }}>
        毎日の自動検知
      </Reveal>
      <Connect from="holder" to="team" at={2} flow fromSide="right" toSide="left" curve={0.35} label="インプット会" labelOffset={[-4, 30]} />
      <Connect from="holder" to="auto" at={2} flow fromSide="right" toSide="left" curve={0.35} delay={0.2} />
    </>
  )
}

export default defineScene({ id: 'team-practice', steps: 3, Component: TeamPractice })
