import { createRoot } from 'react-dom/client'

// 画面の振り分け。どの画面も shadcn/ui の見た目 (index.css) で作る (ADR-0040)
const path = location.pathname
const talk = path.match(/^\/talks\/([^/]+)/)?.[1]
const work = path.match(/^\/works\/([^/]+)/)?.[1]
const note = path.match(/^\/notes\/([^/]+)/)?.[1]

// フィードバック用に、どの画面にも agentation を置く。コピーした見出しに、画面の URL (作品の段階はハッシュ) が載る
async function feedback() {
  const { Agentation } = await import('agentation')
  createRoot(document.body.appendChild(document.createElement('div'))).render(<Agentation useHashLocation appName="hokuchi studio" />)
}

async function render() {
  const root = createRoot(document.getElementById('root')!)
  await import('./index.css')
  if (talk) {
    const { TalkPage } = await import('./talk/TalkPage')
    return root.render(<TalkPage slug={decodeURIComponent(talk)} />)
  }
  if (work) {
    const { Work } = await import('./Work')
    return root.render(<Work id={decodeURIComponent(work)} />)
  }
  if (note) {
    const { NoteView } = await import('./NoteView')
    return root.render(<NoteView dir={decodeURIComponent(note)} />)
  }
  const { Home } = await import('./Home')
  root.render(<Home />)
}
render()
feedback()
