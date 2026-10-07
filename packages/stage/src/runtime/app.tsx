import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MODE, OG_H, OG_W, SHOT, setMotionScale } from './config'
import { Player, Presenter } from './player'
import { StaticFrame } from './scene'
import type { TalkDef } from './types'
import './base.css'

/** 撮影の準備ができたことを CLI に知らせる */
function useReady() {
  useEffect(() => {
    document.fonts.ready.then(() => setTimeout(() => ((window as any).__STAGE_READY__ = true), 500))
  }, [])
}

function Shots({ talk }: { talk: TalkDef }) {
  useReady()
  const frames =
    SHOT === 'all'
      ? talk.scenes.flatMap((s, i) => [...Array(s.steps).keys()].map((step) => ({ i, step })))
      : (() => {
          const [id, step] = SHOT.split('/')
          const i = Math.max(0, talk.scenes.findIndex((s) => s.id === id))
          return [{ i, step: Number(step) || 0 }]
        })()
  return (
    <div className="shots">
      {frames.map(({ i, step }) => (
        <div key={`${i}-${step}`} className="shot" data-frame={`${talk.scenes[i].id}/${step}`}>
          <StaticFrame talk={talk} index={i} step={step} />
        </div>
      ))}
    </div>
  )
}

function Og({ talk }: { talk: TalkDef }) {
  useReady()
  const { OgCard } = talk.theme
  return (
    <div className={`og ${talk.theme.className}`} style={{ width: OG_W, height: OG_H }}>
      <OgCard talk={talk} />
    </div>
  )
}

export async function mount(original: TalkDef) {
  // 開発中は ?theme=<名前> でテーマを差し替えて見比べられる
  let talk = original
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get('theme')
    const { themes } = await import('../themes')
    if (override && themes[override]) talk = { ...original, theme: await themes[override]() }
  }
  setMotionScale((talk.theme.motion?.scale ?? 1) * (talk.tempo ?? 1))
  document.title = talk.title
  document.body.dataset.mode = MODE
  const el = document.getElementById('root')!
  const view =
    MODE === 'presenter' ? <Presenter talk={talk} /> : MODE === 'shot' ? <Shots talk={talk} /> : MODE === 'og' ? <Og talk={talk} /> : <Player talk={talk} />
  createRoot(el).render(view)
}
