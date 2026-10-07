import type { ComponentType } from 'react'

export type SceneDef = {
  /** URL と検証出力に使う安定キー */
  id: string
  /** 状態の数。クリックごとに 0 から steps-1 まで進む */
  steps: number
  Component: ComponentType
  /** 状態ごとの話す内容。発表者ビューと、ノートを読むモードに出る */
  notes?: string[]
  /** 一覧と発表者ビューに出す短い名前 */
  title?: string
}

export type FrameProps = { talk: TalkDef; scene: SceneDef; index: number }

export type Theme = {
  name: string
  /** ステージの根に付けるクラス。トークンはこのクラスの下に定義する */
  className: string
  /** ロゴやフッターなどのブランド枠。シーンのパンの外に置かれ、画面に留まる */
  Frame: ComponentType<FrameProps>
  /** OGP 画像 (1200×630) のカード */
  OgCard: ComponentType<{ talk: TalkDef }>
}

export type TalkDef = {
  title: string
  /** OGP と一覧に出す説明。1〜2 文 */
  description: string
  /** 発表日 YYYY-MM-DD */
  date: string
  event?: { name: string; url?: string }
  speaker: string
  /** slides.y-kaz.com に載せるか。社内向けの発表は false にする (既定は false) */
  public?: boolean
  theme: Theme
  scenes: SceneDef[]
}

export const defineTalk = (talk: TalkDef) => talk
export const defineScene = (scene: SceneDef) => scene
