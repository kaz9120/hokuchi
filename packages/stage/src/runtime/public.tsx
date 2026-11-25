// 公開用の画面。資料を読むことだけに絞る。発表者ビューとノートは出さない。
// ステージの下の帯に、送り・一覧・全画面と、テキスト (AI に渡す用) と PDF の書き出しを置く
import { useRef, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { H, W } from './config'
import { progress, useFit, useKeys, useNav } from './nav'
import { LiveStage, Overview, Scaled } from './player'
import type { TalkDef } from './types'

/** ビルドが HTML に埋めた書き出しの情報 (node/export.mjs)。開発サーバでは無い */
/** pages はページごとの共有用 URL (/<slug>/<n>/) をビルドが作ったか */
type Export = { text?: string; pdf?: string; pages?: boolean }
function readExport(): Export {
  const el = document.getElementById('stage-export')
  if (!el?.textContent) return {}
  try {
    return JSON.parse(el.textContent)
  } catch {
    return {}
  }
}

const BAR = 56
const narrow = () => innerWidth < 720

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // file:// などでクリップボードの API が使えないとき
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.append(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export function PublicPlayer({ talk }: { talk: TalkDef }) {
  const { pos, next, prev, jump } = useNav(talk)
  const [overview, setOverview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linked, setLinked] = useState(false)
  const exp = useRef(readExport()).current
  const pad = narrow() ? 0 : 32
  const scale = useFit(() => ({ w: innerWidth - pad * 2, h: innerHeight - BAR - pad * 2 }), W, H)
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())

  useKeys({
    next,
    prev,
    extra: {
      o: () => setOverview((v) => !v),
      g: () => setOverview((v) => !v),
      Escape: () => setOverview(false),
      f: fullscreen,
    },
  })

  // 画面の左 1/4 をタップすると戻り、それ以外は進む。横スワイプでも送る
  const touch = useRef<number | null>(null)
  const onPointer = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX - r.left < r.width / 4) prev()
    else next()
  }
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touch.current === null) return
      const dx = e.changedTouches[0].clientX - touch.current
      touch.current = null
      if (Math.abs(dx) > 50) {
        e.preventDefault()
        dx < 0 ? next() : prev()
      }
    },
  }

  const onCopy = async () => {
    if (!exp.text) return
    await copy(exp.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { done, total } = progress(talk, pos)
  // X などに貼ったときにそのページの画像が出るよう、# ではなくパスの URL を渡す (# の後ろはサーバに届かない)
  const onLink = async () => {
    await copy(`${location.origin}${location.pathname.replace(/index\.html$/, '')}${done}/`)
    setLinked(true)
    setTimeout(() => setLinked(false), 2000)
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="public" data-theme={talk.theme.name}>
        <div className="public-main">
          <div className="player-stage public-stage" onClick={onPointer} {...swipe}>
            <Scaled scale={scale}>
              <LiveStage talk={talk} pos={pos} />
            </Scaled>
          </div>
        </div>
        <div className="public-bar" style={{ height: BAR }}>
          <div className="public-nav">
            <button onClick={prev} aria-label="前へ" disabled={done === 1}>
              ‹
            </button>
            <span className="public-pos">
              {done} / {total}
            </span>
            <button onClick={next} aria-label="次へ" disabled={done === total}>
              ›
            </button>
          </div>
          <div className="public-title">{talk.title}</div>
          <div className="public-actions">
            <button onClick={() => setOverview(true)}>一覧</button>
            <button onClick={fullscreen} className="public-wide">
              全画面
            </button>
            {exp.pages && (
              <button onClick={onLink} title="このページの画像つきで共有できるリンクをコピーします">
                {linked ? 'コピーしました' : 'このページのリンク'}
              </button>
            )}
            {exp.text && (
              <button onClick={onCopy} title="口頭の補足も含めた全文をコピーします。AI に読み込ませるときに便利です">
                {copied ? 'コピーしました' : 'テキストをコピー'}
              </button>
            )}
            {exp.pdf && (
              <a href={exp.pdf} download>
                PDF
              </a>
            )}
          </div>
        </div>
        <div className="public-progress">
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {overview && <Overview talk={talk} current={pos.scene} onPick={(i) => (jump(i), setOverview(false))} onClose={() => setOverview(false)} />}
      </div>
    </MotionConfig>
  )
}
