// 画面の入口。ホーム → 作品の画面 → 面 の 2 階層を、ルータ (lib/router.ts) で振り分ける (design.md 3 章)
import { createRoot } from 'react-dom/client'
import './index.css'
import { Toaster } from './lib/notice'
import { useRoute } from './lib/router'
import { Home } from './Home'
import { WorkScreen } from './work/WorkScreen'

function App() {
  const route = useRoute()
  return (
    <>
      {route.page === 'work' ? <WorkScreen key={route.key} routeKey={route.key} face={route.face} place={route.place} seq={route.seq} /> : <Home />}
      <Toaster />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

// フィードバック用に、どの画面にも agentation を置く。コピーした見出しに、画面の URL (作品の面はハッシュ) が載る
import('agentation').then(({ Agentation }) => {
  createRoot(document.body.appendChild(document.createElement('div'))).render(<Agentation useHashLocation appName="hokuchi studio" />)
})
