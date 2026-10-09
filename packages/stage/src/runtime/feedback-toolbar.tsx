// 画面の要素にメモを付ける道具 (agentation, ADR-0032) を、ページに 1 つ立てる。
// トークの作業用サーバ (feedback.tsx) と、サイト全体の開発サーバのトップページ (apps/slides) の両方から使う
import { Agentation } from 'agentation'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function Toolbar({ appName }: { appName: string }) {
  // 再生機はハッシュを replaceState で書き換えるので、知らせを受けて描き直し、メモの置き場を状態ごとに切り替える
  const [, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((n) => n + 1)
    addEventListener('stage:moved', on)
    return () => removeEventListener('stage:moved', on)
  }, [])
  return <Agentation useHashLocation appName={appName} />
}

export function mountFeedback(appName: string) {
  createRoot(document.body.appendChild(document.createElement('div'))).render(<Toolbar appName={appName} />)
}
