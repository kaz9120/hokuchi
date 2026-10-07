// 私のチームの状況。体制変更で同時に起きたことなので、時間軸にせず並べる
// 動きの役割: 関係性の変化 (状況から「だから要ったこと」が導かれる)
import { DrawPath, Headline, Reveal, defineScene } from '@hokuchi/stage'

const CARDS = ['できたばかりのチーム', 'ドメイン知識が弱い', '公開直前のプロダクトを任される']
const CARD = { top: 200, width: 320, height: 130, gap: 40 }
const LEFT = (1280 - CARD.width * 3 - CARD.gap * 2) / 2

function TeamContext() {
  return (
    <>
      <Headline>私のチームの状況</Headline>
      {CARDS.map((c, i) => (
        <Reveal
          key={c}
          at={0}
          delay={0.2 + i * 0.15}
          className="tile"
          style={{
            position: 'absolute',
            left: LEFT + i * (CARD.width + CARD.gap),
            top: CARD.top,
            width: CARD.width,
            height: CARD.height,
            boxSizing: 'border-box',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            fontSize: 28,
            fontWeight: 800,
            lineHeight: 1.4,
            padding: '0 24px',
          }}
        >
          {c}
        </Reveal>
      ))}
      <svg className="wires" viewBox="0 0 1280 720" width={1280} height={720}>
        <DrawPath d="M 640 350 L 640 432" end={[640, 436]} angle={90} at={1} width={4} />
      </svg>
      <Reveal
        at={1}
        delay={0.7}
        style={{
          position: 'absolute',
          left: 240,
          width: 800,
          top: 456,
          boxSizing: 'border-box',
          padding: '24px 32px',
          textAlign: 'center',
          borderRadius: 16,
          background: 'var(--accent-bg)',
          border: '2px solid var(--accent)',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)' }}>だから</div>
        <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>メンタルモデルを揃える営みが要る</div>
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'team-context', steps: 2, Component: TeamContext })
