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

export const EASE = [0.22, 1, 0.36, 1] as const

// シーンの中で動きの既定値を作る。静止画モードでは 0 秒になる
export const t = (base: Transition = {}): Transition => (STATIC ? { duration: 0 } : { duration: 0.6, ease: EASE, ...base })
