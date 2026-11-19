import { createContext, useContext, type ReactNode } from 'react'
import type { SceneDef, TalkDef } from './types'
import { H, W } from './config'

const StepCtx = createContext(0)
const ActiveCtx = createContext(true)
const TalkCtx = createContext<TalkDef | null>(null)

/** いまの状態の番号。シーンの中で、状態ごとに見た目を変えるときに使う */
export const useStep = () => useContext(StepCtx)

/**
 * シーンの登場の動きを始めてよいか。前後のシーンは画面の外で先に組み立てておくので (フィルムの帯)、
 * 登場の動きは、これが true になってから始める。
 * 入ってくるシーンは、カメラのパンが終わって画面に収まってから true になる (パンと中の動きを重ねない)。
 * 出ていくシーンと、もう通り過ぎたシーンは true のまま (出ていく途中で登場前の姿に戻さない)。静止画では常に true
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

/** トーク全体の中での位置。scene はいまのシーンの id、index はその番号、step はシーンの中の状態、at は通しの状態 (0 始まり) */
export type WorldPos = { scene: string; index: number; step: number; at: number; total: number }

const WorldCtx = createContext<WorldPos>({ scene: '', index: 0, step: 0, at: 0, total: 1 })

/** world (トーク全体を通して残る層) の中で、いまの位置を読む。シーンの中で使ってもよい */
export const useWorld = () => useContext(WorldCtx)

/** シーンと状態の番号から、通しの位置を作る */
export function worldPos(talk: TalkDef, index: number, step: number): WorldPos {
  const total = talk.scenes.reduce((n, s) => n + s.steps, 0)
  const at = talk.scenes.slice(0, index).reduce((n, s) => n + s.steps, 0) + step
  return { scene: talk.scenes[index].id, index, step, at, total }
}

/** world の層と、位置の文脈。シーンより下に描く */
export function World({ talk, pos, children }: { talk: TalkDef; pos: WorldPos; children: ReactNode }) {
  const Layer = talk.world
  return (
    <WorldCtx.Provider value={pos}>
      {Layer && (
        <div className="world">
          <Layer />
        </div>
      )}
      {children}
    </WorldCtx.Provider>
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
  const pos = worldPos(talk, index, step)
  return (
    <Stage talk={talk}>
      <World talk={talk} pos={pos}>
        <SceneView key={`${scene.id}-${step}`} scene={scene} step={step} />
        <Frame talk={talk} scene={scene} index={index} step={step} at={pos.at} total={pos.total} />
      </World>
    </Stage>
  )
}
