import { createRoot } from 'react-dom/client'
import { Home } from './Home'
import { TalkEditor } from './App'
import './styles.css'

// 画面の振り分け。/ がホーム、/talks/<slug> が発表資料の編集画面
const talk = location.pathname.match(/^\/talks\/([^/]+)/)?.[1]
createRoot(document.getElementById('root')!).render(talk ? <TalkEditor slug={decodeURIComponent(talk)} /> : <Home />)
