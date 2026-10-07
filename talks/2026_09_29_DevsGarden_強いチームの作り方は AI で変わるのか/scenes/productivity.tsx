// 目指す状態から生産性の 2 分類へ。技術的生産性は社外の発表資料に送り、組織的生産性へ寄っていく
// 動きの役割: 関係性の変化 (分かれる) → オブジェクトの変化 (資料に差し替わる) → 画面の演出 (ズームイン)
import { Headline, Morph, Reveal, defineScene, pick, useStep } from '@hokuchi/stage'
import talkImage from '../assets/productivity-talk.jpg'

const card = { borderRadius: 20, padding: '36px 40px', alignItems: 'flex-start' } as const
const name = { fontSize: 36, fontWeight: 800, whiteSpace: 'nowrap', transition: 'font-size 0.5s' } as const
const desc = { fontSize: 24, color: 'var(--fg-sub)', marginTop: 10, fontWeight: 600 }
const list = { marginTop: 32, display: 'grid', gap: 16 }

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
      <Headline>{['', '生産性に関する取り組みの分類', '生産性に関する取り組みの分類', '今日は組織的生産性の話をします']}</Headline>

      {/* 目指す状態: 最初は中央に大きく、以降は上に小さく退く */}
      <Reveal at={0} until={1} y={0} style={{ position: 'absolute', left: 96, right: 96, top: 210, textAlign: 'center' }}>
        <div className="label">MOSH の開発組織が目指す状態</div>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.4, marginTop: 24 }}>
          圧倒的なスピードと創造力で
          <br />
          迫力ある開発組織をつくる
        </div>
      </Reveal>
      <Reveal at={1} delay={0.2} y={-12} style={{ position: 'absolute', left: 96, right: 96, top: 132, fontSize: 20, color: 'var(--fg-sub)', fontWeight: 700 }}>
        目指す状態　圧倒的なスピードと創造力で迫力ある開発組織をつくる
      </Reveal>

      <Reveal at={1} delay={0.3}>
        <Morph
          box={[
            { left: 96, top: 186, width: 528, height: 450 },
            { left: 96, top: 186, width: 528, height: 450 },
            { left: 96, top: 186, width: 528, height: 450 },
            { left: 96, top: 186, width: 300, height: 450 },
          ]}
          tone={['', '', '', 'quiet']}
          style={card}
        >
          <div style={{ ...name, fontSize: pick(step, [36, 36, 36, 28]) }}>技術的生産性</div>
          <Reveal at={0} until={2} style={desc}>
            技術基盤を整えて開発を速くする
          </Reveal>
          <Reveal at={0} until={2} style={list}>
            <Bullets items={['開発基盤の改善', 'テスト自動化', 'モニタリング整備']} />
          </Reveal>
          <Reveal at={2} delay={0.25} style={{ marginTop: step >= 3 ? 16 : 20 }}>
            <img src={talkImage} alt="" style={{ width: step >= 3 ? 220 : 340, borderRadius: 10, display: 'block', border: '1px solid var(--line)', transition: 'width 0.6s' }} />
            <div style={{ fontSize: step >= 3 ? 18 : 22, fontWeight: 700, marginTop: 14, lineHeight: 1.5 }}>AI時代における開発生産性と進化可能性を高める技術戦略</div>
            <div style={{ fontSize: 18, color: 'var(--fg-sub)', marginTop: 6 }}>鈴木翔大 / AI DevEX Conference 2026</div>
          </Reveal>
        </Morph>
      </Reveal>

      <Reveal at={1} delay={0.4}>
        <Morph
          box={[
            { left: 656, top: 186, width: 528, height: 450 },
            { left: 656, top: 186, width: 528, height: 450 },
            { left: 656, top: 186, width: 528, height: 450 },
            { left: 428, top: 186, width: 756, height: 450 },
          ]}
          tone={['', '', '', 'accent']}
          style={card}
        >
          <div style={name}>組織的生産性</div>
          <div style={desc}>プロセスと連携を整えてチームを強くする</div>
          <div style={list}>
            <Bullets items={['開発プロセスの見直し', 'レビュー文化の形成', 'ナレッジの循環']} />
          </div>
        </Morph>
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'productivity', steps: 4, Component: Productivity })
