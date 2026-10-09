import { createRoot } from 'react-dom/client'

// 画面の振り分け。発表資料の編集画面 (/talks/<slug>) は前からの見た目 (styles.css) のまま。
// それ以外は shadcn/ui の見た目 (index.css)。互いの全体の指定がぶつからないよう、画面ごとに片方だけ読む
const path = location.pathname
const talk = path.match(/^\/talks\/([^/]+)/)?.[1]
const work = path.match(/^\/works\/([^/]+)/)?.[1]
const note = path.match(/^\/notes\/([^/]+)/)?.[1]

async function render() {
  const root = createRoot(document.getElementById('root')!)
  if (talk) {
    await import('./styles.css')
    const { TalkEditor } = await import('./App')
    return root.render(<TalkEditor slug={decodeURIComponent(talk)} />)
  }
  await import('./index.css')
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
