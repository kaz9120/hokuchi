// 演題の回収。same-ai の 3 人の図が小さく戻り、線を越えた 1 人の線の先に「専門性」「個性」の札が付く。最後に見出しが演題に変わる
// 動きの役割: 連続性 (図が戻る) → 強調 (見出しが演題になる)
import { motion } from 'motion/react'
import { defineScene, t, useActive, useStep } from '@hokuchi/stage'
import { KeywordTag } from './_keyword'
import { RichHeadline } from './_rich'
import { Trio, WHO, trioLayout } from './_trio'

/** same-ai の図を 8 割に縮め、札のぶんだけ上を空ける */
const GEOM = { cx: 640, foot: 640, scale: 0.8 }
const L = trioLayout(GEOM)
/** 札の高さ (20px × 1.4 + 枠と余白) と、線の先の丸からの間 */
const TAG_H = 36
const TAG_GAP = 22

function Callback() {
  const step = useStep()
  const active = useActive()
  const title = step >= 1
  return (
    <>
      {/* 演題が出る状態だけ、見出しを少し大きくして右端まで使う。文字の大きさは CSS の transition で移す */}
      <RichHeadline
        items={[
          '線を越えさせるのは 専門性と個性です',
          {
            key: 'title',
            node: (
              <>
                AI に任せられるのは <span style={{ color: 'var(--accent-strong)' }}>磨いてきたものだけ</span>
              </>
            ),
          },
        ]}
        style={{ right: 96, fontSize: title ? 50 : 44, fontWeight: title ? 800 : 700, transition: 'font-size 0.5s' }}
      />

      {/* 戻ってきた図なので、線は引き直さず一度に出す */}
      <Trio geom={GEOM} on={active} lines beyond label stagger={0} />

      {/* 線の先の札。シーンに入って図が出てから付く (状態ではなく入場に合わせるので Reveal ではなく active で出す) */}
      <motion.div
        initial={false}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : 8 }}
        transition={t({ delay: active ? 0.7 : 0 })}
        style={{ position: 'absolute', left: L.xs[WHO], top: L.beyondY - TAG_GAP - TAG_H, transform: 'translateX(-50%)', display: 'flex', gap: 12, height: TAG_H, alignItems: 'center' }}
      >
        <KeywordTag word="専門性" />
        <KeywordTag word="個性" />
      </motion.div>
    </>
  )
}

export default defineScene({ id: 'callback', steps: 2, Component: Callback })
