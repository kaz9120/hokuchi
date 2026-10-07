import { createRoot } from 'react-dom/client'
import { Deck, type SceneDef } from './runtime/deck'
import './runtime/stage.css'
import { Title } from './scenes/title'
import { OldProblems } from './scenes/old-problems'
import { Productivity } from './scenes/productivity'
import { Cycle } from './scenes/cycle'
import { Deploys } from './scenes/deploys'

const scenes: SceneDef[] = [
  { id: 'title', steps: 1, Component: Title },
  { id: 'old-problems', steps: 4, print: [0, 2, 3], Component: OldProblems },
  { id: 'productivity', steps: 3, print: [0, 2], Component: Productivity },
  { id: 'cycle', steps: 4, print: [3], Component: Cycle },
  { id: 'deploys', steps: 3, print: [2], Component: Deploys },
]

// ブランドの枠はパンの外に置く。カメラが動いても、ロゴとフッターは画面に留まる
const frame = (s: SceneDef) => (
  <div className={s.cover ? 'cover-frame' : ''}>
    <img className="brand-logo" src={s.cover ? '/brand/logo-mosh-white.svg' : '/brand/logo-mosh.svg'} alt="MOSH" />
    <div className="footer">© MOSH, Inc.</div>
  </div>
)

createRoot(document.getElementById('root')!).render(<Deck scenes={scenes} frame={frame} />)
