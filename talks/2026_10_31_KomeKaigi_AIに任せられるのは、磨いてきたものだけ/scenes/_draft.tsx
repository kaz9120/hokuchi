// 構成を固めているあいだの画面。見出しは絵コンテ (storyboard.md) の状態の 1 行目から読み、
// 絵は _sketch.tsx のラフを出す。絵の無いシーンは、見出しを大きな文として見せる。
// 仕上げるときに、1 シーン 1 ファイルの実装へ置き換える
import { Headline, Swap, defineScene, useStep, type SceneDef } from '@hokuchi/stage'
import cover from '@hokuchi/stage/themes/mosh/assets/bg-cover.svg'
import { PICTURES } from './_sketch'

type BoardScene = { id: string; title: string; chapter: string | null; states: { screen: string }[] }

const HEADLINE = /(?:見出し|演題|問い|答え)[^「。]{0,6}「([^」]+)」/
const SUB = /(?:下に|続きの文|1 文)[^「。]{0,8}「([^」]+)」/

/** 状態ごとの見出し。その状態に見出しの指定が無ければ、前の状態の見出しを引き継ぐ */
function headlines(states: BoardScene['states']) {
  let last = ''
  return states.map((s) => (last = s.screen.match(HEADLINE)?.[1] ?? last))
}

export function draftScene(board: BoardScene): SceneDef {
  const heads = headlines(board.states).map((h) => h || board.title)
  const subs = board.states.map((s) => s.screen.match(SUB)?.[1] ?? '')
  const picture = PICTURES[board.id]
  function Draft() {
    const step = useStep()
    const pic = picture?.(step)
    if (pic)
      return (
        <>
          <Headline>{heads}</Headline>
          {pic}
        </>
      )
    // 絵の無いシーン: 見出しを大きな文として真ん中に置く
    return (
      <div style={{ position: 'absolute', left: 120, right: 120, top: 0, bottom: 0, display: 'grid', alignContent: 'center', gap: 36 }}>
        <Swap style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.4, letterSpacing: '0.02em' }}>{heads[step]}</Swap>
        <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--accent-strong)', minHeight: 50 }}>{subs[step]}</div>
      </div>
    )
  }
  return defineScene({ id: board.id, steps: board.states.length, Component: Draft })
}

export const coverBackground = `url(${cover}) center / cover`
