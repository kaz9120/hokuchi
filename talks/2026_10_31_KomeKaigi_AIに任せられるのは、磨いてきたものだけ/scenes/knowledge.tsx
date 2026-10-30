// 知識は AI も持っていた。2 つの場面 (7 月・10 月) のカードに「知識」のラベルが付き、「その場面で使うと判断する」に差し替わる。
// 章の入口なので、見出しの上に章の札を置き、カードは将棋の話 (左) から出てくる
// 動きの役割: 画面の演出 (章に入る) → 強調 (ラベルの差し替え)
import { Reveal, Swap, defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { MonthTag, type Month } from './_abstract'
import { RichHeadline } from './_rich'

const CARD = { top: 200, width: 480, height: 290, picture: 168 }
const LEFTS = [96, 704]

/** 16×16 の升目。内側の 9×9 が将棋盤で、外側は壁 (stride16 のシーンの絵を小さく思い出す) */
function Grid16() {
  const cell = 9
  const size = cell * 16
  const cells: ReactNode[] = []
  for (let r = 0; r < 16; r++)
    for (let c = 0; c < 16; c++) {
      const board = r >= 1 && r <= 9 && c >= 1 && c <= 9
      cells.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={board ? 'var(--surface)' : 'var(--line)'} stroke={board ? 'var(--fg-sub)' : 'var(--muted)'} strokeWidth={board ? 0.8 : 0.4} />)
    }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {cells}
    </svg>
  )
}

/** 4 つの部品が 1 つの塊になって本体へ移る (six-losses のシーンの絵を小さく思い出す) */
function Bundle() {
  const tile = { width: 34, height: 34, borderRadius: 6, background: 'var(--surface)', border: '2px solid var(--fg-sub)', boxSizing: 'border-box' as const }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 34px)', gap: 8, padding: 12, border: '2px dashed var(--fg-sub)', borderRadius: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={tile} />
        ))}
      </div>
      <svg width={56} height={24} viewBox="0 0 56 24" style={{ display: 'block' }}>
        <path d="M2 12 H46" stroke="var(--fg-sub)" strokeWidth={3} strokeLinecap="round" />
        <path d="M38 4 L48 12 L38 20" fill="none" stroke="var(--fg-sub)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ width: 128, height: 112, borderRadius: 12, border: '2px solid var(--fg-sub)', background: 'var(--surface)', boxSizing: 'border-box', display: 'grid', placeContent: 'center', fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>本体</div>
    </div>
  )
}

function Card({ left, month, title, picture, delay }: { left: number; month: Month; title: string; picture: ReactNode; delay: number }) {
  const step = useStep()
  const active = useActive()
  const judged = step >= 1
  return (
    <>
      {/* 将棋の話 (左) から出てくる。シーンに入ってから動く */}
      <motion.div
        className="card"
        initial={false}
        animate={{ opacity: active ? 1 : 0, x: active ? 0 : -60 }}
        transition={t({ duration: 0.8, delay })}
        style={{ position: 'absolute', left, top: CARD.top, width: CARD.width, height: CARD.height, padding: 0, display: 'block' }}
      >
        <MonthTag month={month} style={{ position: 'absolute', left: 16, top: 14 }} />
        <div style={{ height: CARD.picture, display: 'grid', placeContent: 'center', borderBottom: '2px solid var(--line)' }}>{picture}</div>
        <div style={{ height: CARD.height - CARD.picture - 4, display: 'grid', placeContent: 'center', fontSize: 32, fontWeight: 800 }}>{title}</div>
      </motion.div>
      {/* ラベル。知識 → その場面で使うと判断する。色は CSS の transition で移す */}
      <motion.div initial={false} animate={{ opacity: active ? 1 : 0 }} transition={t({ delay: delay + 0.5 })} style={{ position: 'absolute', left, top: CARD.top + CARD.height + 20, width: CARD.width, display: 'flex', justifyContent: 'center' }}>
        <Swap
          style={{
            padding: '6px 24px',
            borderRadius: 999,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            background: judged ? 'var(--accent-bg)' : 'var(--surface)',
            border: `2px solid ${judged ? 'var(--accent)' : 'var(--line)'}`,
            color: judged ? 'var(--accent-strong)' : 'var(--fg-sub)',
            transition: 'background 0.5s, border-color 0.5s, color 0.5s',
          }}
        >
          {judged ? 'その場面で使うと判断する' : '知識'}
        </Swap>
      </motion.div>
    </>
  )
}

function Knowledge() {
  const active = useActive()
  return (
    <>
      {/* 章の札。ここから将棋の外に出る */}
      <motion.div initial={false} animate={{ opacity: active ? 1 : 0, y: active ? 0 : 8 }} transition={t({ duration: 0.5 })} style={{ position: 'absolute', left: 96, top: 18, padding: '2px 16px', borderRadius: 999, border: '2px solid var(--fg-sub)', background: 'var(--surface)', fontSize: 20, lineHeight: 1.4, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--fg-sub)', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
        将棋の外へ
      </motion.div>
      {/* 2 行目は意味の切れ目 (全角スペース) で折る */}
      <RichHeadline
        items={[
          'どちらも 知識としては AI も知っていたはずです',
          {
            key: 'judge',
            node: (
              <>
                差が付いたのは
                <br />
                その場面で使うと判断できたかです
              </>
            ),
          },
        ]}
      />
      <Card left={LEFTS[0]} month="7 月" title="まとめて移す" picture={<Bundle />} delay={0.2} />
      <Card left={LEFTS[1]} month="10 月" title="16×16 の盤" picture={<Grid16 />} delay={0.45} />
      <Reveal at={2} style={{ position: 'absolute', left: 96, top: 586, fontSize: 32, fontWeight: 700 }}>
        判断できたのは 自分で作って 結果を見てきたから
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'knowledge', steps: 3, Component: Knowledge })
