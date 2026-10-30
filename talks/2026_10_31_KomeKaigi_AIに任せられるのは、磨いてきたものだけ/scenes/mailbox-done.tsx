// 配列盤は 4 日で本体に入り、86 万局面の照合で正しさを確かめ、Bitboard のプログラムを上回った
// 動きの役割: 強調 (大きな数、見出しの差し替え、上回った数)
import { Headline, Reveal, defineScene, useStep } from '@hokuchi/stage'

function MailboxDone() {
  const step = useStep()
  return (
    <>
      <Headline>{['配列盤は 4 日で本体に入りました', 'Bitboard のプログラムを 上回りました']}</Headline>

      {/* 86 万局面で答えが全部一致。見出しが上回った話に変わると、少し引く */}
      <Reveal at={0} delay={0.3} style={{ position: 'absolute', left: 96, top: 250, lineHeight: 1.2, opacity: step >= 1 ? 0.55 : 1, transition: 'opacity 0.7s' }}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: '0.01em' }}>
          86
          <span style={{ fontSize: 56, marginLeft: 12 }}>万局面で</span>
        </div>
        <Reveal at={0} delay={1.3} style={{ fontSize: 40, fontWeight: 800, color: 'var(--accent-strong)', marginTop: 16 }}>
          Bitboard のプログラムと 答えが全部一致
        </Reveal>
      </Reveal>

      {/* 上回った中身を 2 つの数で。資料だけで読む人にも伝わるように */}
      {[
        { big: '5 点上', small: '8,904 局の対局で' },
        { big: '約 3% 上', small: '速さ' },
      ].map((m, i) => (
        <Reveal key={m.big} at={1} delay={0.5 + i * 0.4} style={{ position: 'absolute', left: 96 + i * 460, top: 500, lineHeight: 1.2 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg-sub)' }}>{m.small}</div>
          <div style={{ fontSize: 64, fontWeight: 800, color: i === 0 ? 'var(--accent-strong)' : 'var(--fg)' }}>{m.big}</div>
        </Reveal>
      ))}
    </>
  )
}

export default defineScene({ id: 'mailbox-done', steps: 2, Component: MailboxDone })
