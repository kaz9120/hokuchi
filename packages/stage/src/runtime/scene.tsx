import { createContext, useContext, type ReactNode } from 'react'
import type { SceneDef, TalkDef } from './types'
import { H, W } from './config'

const StepCtx = createContext(0)
const ActiveCtx = createContext(true)
const TalkCtx = createContext<TalkDef | null>(null)

/** いまの状態の番号。シーンの中で、状態ごとに見た目を変えるときに使う */
export const useStep = () => useContext(StepCtx)

/**
 * シーンがいま画面に出ているか。前後のシーンは画面の外で先に組み立てておくので (フィルムの帯)、
 * シーンに入ったときの登場の動きは、これが true になってから始める。静止画では常に true
 */
export const useActive = () => useContext(ActiveCtx)

/** トークの情報 (発表日など)。部品が日付で中身を選ぶときに使う */
export function useTalk(): TalkDef {
  const talk = useContext(TalkCtx)
  if (!talk) throw new Error('useTalk は Stage の中で使ってください')
  return talk
}

/** 状態ごとの値を選ぶ。配列が短ければ最後の値を使い続ける */
export function pick<T>(step: number, values: readonly T[]): T {
  return values[Math.min(step, values.length - 1)]
}

/** 1 つのシーンを、指定した状態で描く。data-scene-root は部品が位置を測る基準になる */
export function SceneView({ scene, step, active = true }: { scene: SceneDef; step: number; active?: boolean }) {
  return (
    <div className="scene" data-scene-root>
      <ActiveCtx.Provider value={active}>
        <StepCtx.Provider value={step}>
          <scene.Component />
        </StepCtx.Provider>
      </ActiveCtx.Provider>
    </div>
  )
}

/** 1280×720 の舞台。テーマのクラスと背景を持つ */
export function Stage({ talk, children, style }: { talk: TalkDef; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <TalkCtx.Provider value={talk}>
      <div className={`stage ${talk.theme.className}`} style={{ width: W, height: H, ...style }}>
        <div className="stage-bg" />
        {children}
      </div>
    </TalkCtx.Provider>
  )
}

/** 静止した 1 状態。一覧・次の状態のプレビュー・検証の静止画に使う */
export function StaticFrame({ talk, index, step }: { talk: TalkDef; index: number; step: number }) {
  const scene = talk.scenes[index]
  const { Frame } = talk.theme
  return (
    <Stage talk={talk}>
      <SceneView key={`${scene.id}-${step}`} scene={scene} step={step} />
      <Frame talk={talk} scene={scene} index={index} />
    </Stage>
  )
}
