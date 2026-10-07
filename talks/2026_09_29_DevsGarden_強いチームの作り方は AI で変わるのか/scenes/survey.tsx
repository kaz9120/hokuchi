// 定量だけでは分からない体験を、毎月のサーベイで測る。設問の出どころと、分かったこと
// 動きの役割: 関係性の変化 (定量の横に定性) → オブジェクトの変化 (カードが広がる) → 強調 (分かったこと)
import { Headline, Morph, Reveal, defineScene } from '@hokuchi/stage'

const METRICS = ['デプロイ数', 'PR のリードタイム', 'レビューにかかる時間']
const SPACE = [
  { text: 'チーム内の心理的安全性', mark: '高い' },
  { text: 'コードレビューの質と速度', mark: '課題' },
  { text: '集中時間の確保', mark: '課題' },
]
const MOSH = ['AI 活用への満足度', '技術負債への向き合い方']

const item = { display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, fontWeight: 600, height: 44 } as const
const group = { fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)', letterSpacing: '0.04em', marginBottom: 10 }

function Mark({ text }: { text: string }) {
  const issue = text === '課題'
  return (
    <span
      style={{
        fontSize: 18,
        fontWeight: 800,
        padding: '2px 12px',
        borderRadius: 999,
        color: issue ? 'var(--surface)' : 'var(--accent-strong)',
        background: issue ? 'var(--accent)' : 'transparent',
        border: '2px solid var(--accent)',
      }}
    >
      {text}
    </span>
  )
}

function Survey() {
  return (
    <>
      <Headline>{['定量だけでは体験が分からない', '定性も毎月測る', 'SPACE をベースに MOSH 独自の項目を足す', '低い項目と声には必ずアクションを取る']}</Headline>

      {/* 定量の指標。サーベイが広がると左へ退く */}
      <Morph
        box={[
          { left: 96, top: 180, width: 460, height: 360 },
          { left: 96, top: 180, width: 460, height: 360 },
          { left: -520, top: 180, width: 460, height: 360 },
        ]}
        style={{ alignItems: 'flex-start', padding: '32px 36px', borderRadius: 18 }}
      >
        <div style={group}>定量の指標</div>
        <div style={{ display: 'grid', gap: 18, marginTop: 8 }}>
          {METRICS.map((m) => (
            <div key={m} className="bullet">
              {m}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 34, fontSize: 22, color: 'var(--fg-sub)', fontWeight: 600, lineHeight: 1.6 }}>速くなっても、集中できているか・レビューがつらくないかは分からない</div>
      </Morph>

      {/* 毎月のサーベイ */}
      <Reveal at={1} delay={0.2}>
        <Morph
          box={[
            { left: 600, top: 180, width: 584, height: 360 },
            { left: 600, top: 180, width: 584, height: 360 },
            { left: 96, top: 166, width: 1088, height: 470 },
          ]}
          tone={['accent']}
          style={{ alignItems: 'flex-start', padding: '32px 40px', borderRadius: 18 }}
        >
          <div style={{ fontSize: 32, fontWeight: 800 }}>毎月のサーベイ</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {['13 問', '7 段階', '匿名', '毎月'].map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
          <Reveal at={1} until={2} style={{ marginTop: 28, fontSize: 24, color: 'var(--fg-sub)', fontWeight: 600, lineHeight: 1.7 }}>
            2026 年 1 月から、開発者の体験を
            <br />
            毎月の変化として追っている
          </Reveal>
          <Reveal at={2} delay={0.35} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 48, marginTop: 30 }}>
            <div>
              <div style={group}>SPACE から（例）</div>
              {SPACE.map((s) => (
                <div key={s.text} style={item}>
                  <span>{s.text}</span>
                  <Reveal at={3} delay={0.2} y={6}>
                    <Mark text={s.mark} />
                  </Reveal>
                </div>
              ))}
            </div>
            <div>
              <div style={group}>MOSH 独自の項目</div>
              {MOSH.map((m) => (
                <div key={m} style={item}>
                  {m}
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal at={3} delay={0.6} style={{ position: 'absolute', left: 0, right: 0, top: 316, paddingTop: 22, borderTop: '2px dashed var(--line)', fontSize: 24, fontWeight: 600 }}>
            <span style={{ color: 'var(--fg-sub)', marginRight: 16 }}>自由記述</span>
            開発体験を改善するために、一つだけ変えられるとしたら何を変えたいか
          </Reveal>
        </Morph>
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'survey', steps: 4, Component: Survey })
