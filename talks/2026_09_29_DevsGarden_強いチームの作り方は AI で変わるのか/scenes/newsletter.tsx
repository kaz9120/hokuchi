// 集めた声を、組織の文脈と一緒に毎月届ける。誌面に欄が順に入る
// 動きの役割: 連続性 (欄が順に入る)。各チームの実践の欄には、改善の流れで見たチーム A の例が入る
import { Headline, Reveal, defineScene } from '@hokuchi/stage'

const paper = {
  position: 'absolute',
  left: 300,
  top: 155,
  width: 680,
  height: 500,
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '2px solid var(--line)',
  borderRadius: 16,
  padding: '28px 36px',
  boxShadow: '0 16px 40px rgb(0 0 0 / 0.06)',
} as const
const section = { borderTop: '2px solid var(--line)', paddingTop: 14, marginTop: 14 }
const heading = { fontSize: 24, fontWeight: 800, color: 'var(--accent-strong)' }
const body = { fontSize: 20, color: 'var(--fg-sub)', marginTop: 6, fontWeight: 600 }

function Placeholder({ widths }: { widths: number[] }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {widths.map((w, i) => (
        <div key={i} style={{ height: 8, width: `${w}%`, borderRadius: 4, background: 'var(--line)' }} />
      ))}
    </div>
  )
}

function Newsletter() {
  return (
    <>
      <Headline>毎月、組織の文脈を発信する</Headline>
      <div style={paper}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 30, fontWeight: 800 }}>毎月の発信</span>
          <span style={{ fontSize: 18, color: 'var(--fg-sub)', fontWeight: 700 }}>2026 年 7 月から</span>
        </div>
        <Reveal at={1} delay={0.1} style={section}>
          <div style={heading}>CTO のメッセージ</div>
          <div style={body}>組織として大事にしたいこと</div>
          <Placeholder widths={[92, 76]} />
        </Reveal>
        <Reveal at={1} delay={0.45} style={section}>
          <div style={heading}>今月の数字</div>
          <div style={body}>サーベイと開発のデータ</div>
        </Reveal>
        <Reveal at={2} delay={0.1} style={section}>
          <div style={heading}>各チームの実践</div>
          <div style={body}>うまくいった工夫とその背景</div>
          <div className="tile" style={{ marginTop: 12, fontSize: 24, padding: '12px 20px' }}>
            WIP を減らしてリードタイムを半分に
          </div>
        </Reveal>
      </div>
    </>
  )
}

export default defineScene({ id: 'newsletter', steps: 3, Component: Newsletter })
