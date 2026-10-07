import type { Transition } from 'motion/react'

export const W = 1280
export const H = 720
export const OG_W = 1200
export const OG_H = 630

// ビルド時に Node からトークの情報だけを読むことがあるので、location の無い環境でも落ちないようにする
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)

// 表示モード。URL のクエリで切り替える
//   (なし)        ライブ再生
//   ?presenter    発表者ビュー
//   ?shot=all     検証用。全シーンの全状態を静止画で縦に並べる
//   ?shot=<id>/<n> 検証用。1 状態だけ
//   ?og           OGP 画像用のカード
export type Mode = 'live' | 'presenter' | 'shot' | 'og'
export const MODE: Mode = q.has('presenter') ? 'presenter' : q.has('shot') ? 'shot' : q.has('og') ? 'og' : 'live'
export const SHOT = q.get('shot') ?? ''

// 静止画を撮るモードでは、すべての動きを 0 秒にして最終状態だけを描く
export const STATIC = MODE === 'shot' || MODE === 'og'

/** 要素の動きの緩急。立ち上がりを鋭くしすぎない (鋭いと「速い」と感じる) */
export const EASE = [0.25, 0.8, 0.35, 1] as const
/** カメラのパン。物理的なカメラのように、加速してから減速する */
export const PAN_EASE = [0.65, 0, 0.35, 1] as const

// 動きの時間の倍率。テーマの motion.scale とトークの tempo を掛け合わせる (mount が設定する)
let scale = 1
export function setMotionScale(s: number) {
  scale = s
}

// シーンの中で動きの既定値を作る。時間と遅れには倍率がかかる。静止画モードでは 0 秒になる
export const t = (base: Transition = {}): Transition => {
  if (STATIC) return { duration: 0 }
  const b = base as { duration?: number; delay?: number }
  return { ease: EASE, ...base, duration: (b.duration ?? 0.75) * scale, delay: (b.delay ?? 0) * scale }
}

/** シーン間のパン */
export const panT = (): Transition => (STATIC ? { duration: 0 } : { duration: 1.0 * scale, ease: PAN_EASE })
