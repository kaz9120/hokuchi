// 開発中だけ出す、画面の要素にメモを付ける道具 (agentation, ADR-0032)。開発サーバが HTML に差し込み、公開用のビルドには入らない
// コピーした Markdown の見出しに URL のハッシュ (#/<scene-id>/<step>) が載るので、どの状態へのメモかが分かる
import { Agentation } from 'agentation'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import talk from 'virtual:talk'
import { MODE } from './config'

function Feedback() {
  // 再生機はハッシュを replaceState で書き換えるので、知らせを受けて描き直し、メモの置き場を状態ごとに切り替える
  const [, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((n) => n + 1)
    addEventListener('stage:moved', on)
    return () => removeEventListener('stage:moved', on)
  }, [])
  return <Agentation useHashLocation appName={talk.title} />
}

// ライブ再生だけに出す。静止画の撮影と、studio のプレビュー (iframe) には出さない
if (MODE === 'live' && window.parent === window) {
  createRoot(document.body.appendChild(document.createElement('div'))).render(<Feedback />)
}
