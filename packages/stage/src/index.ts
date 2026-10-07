// シーンを書くための入口。テーマは '@hokuchi/stage/themes/<name>' から読む
export { defineScene, defineTalk, type SceneDef, type TalkDef, type Theme, type FrameProps } from './runtime/types'
export { useStep, useActive, useTalk, pick } from './runtime/scene'
export { t, EASE, STATIC, W, H } from './runtime/config'
export { Reveal, Swap, Headline, Morph, CountUp } from './kit/motion'
export { Connect, DrawPath, Flow, route } from './kit/connect'
