// 「専門性」「個性」の言葉の札。baseline で差の所に大きく並び、expertise / individuality では見出しの上へ小さく移る。
// シーンをまたぐので、位置と見た目をここで 1 つにしておく。individuality は <KeywordAtHeadline word="個性" /> を置くだけでよい
import { motion } from 'motion/react'
import { t, useActive } from '@hokuchi/stage'
import type { CSSProperties } from 'react'

export type KeywordName = '専門性' | '個性'

/** baseline のシーンで並ぶ位置 (拡大前の左上) と倍率。いまのトップと AI だけで届く線の間に、上下 2 段で入る */
export const KEYWORD_HOME: Record<KeywordName, { left: number; top: number }> = { 専門性: { left: 920, top: 288 }, 個性: { left: 920, top: 360 } }
export const KEYWORD_HOME_SCALE = 1.6
/** 見出しの上に置くときの位置 (見出しは left 96 / top 60) */
export const KEYWORD_REST = { left: 96, top: 18 }

const pill: CSSProperties = {
  position: 'absolute',
  transformOrigin: 'left top',
  padding: '2px 16px',
  borderRadius: 999,
  fontSize: 20,
  lineHeight: 1.4,
  fontWeight: 800,
  letterSpacing: '0.06em',
  background: 'var(--accent-bg)',
  border: '2px solid var(--accent)',
  color: 'var(--accent-strong)',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
}

/** 言葉の札。位置と倍率は呼び出す側が状態に合わせて決める */
export function Keyword({ word, left, top, scale = 1, delay = 0 }: { word: KeywordName; left: number; top: number; scale?: number; delay?: number }) {
  return (
    <motion.div style={pill} initial={false} animate={{ left, top, scale }} transition={t({ duration: 0.9, delay })}>
      {word}
    </motion.div>
  )
}

/** 流れの中に置く札 (位置は親が決める)。callback で線の先に付ける */
export function KeywordTag({ word }: { word: KeywordName }) {
  return <span style={{ ...pill, position: 'static' }}>{word}</span>
}

/** 見出しの上の札。シーンに入ってから、baseline で並んでいた位置から見出しの上へ移る〔画面の演出〕 */
export function KeywordAtHeadline({ word }: { word: KeywordName }) {
  const active = useActive()
  const pos = active ? { ...KEYWORD_REST, scale: 1 } : { ...KEYWORD_HOME[word], scale: KEYWORD_HOME_SCALE }
  return <Keyword word={word} {...pos} delay={0.1} />
}
