// 再生位置。URL のハッシュ (#/<scene-id>/<step>) と、同じトークを開いた別ウィンドウ (発表者ビュー) と同期する
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TalkDef } from './types'

export type Pos = { scene: number; step: number; dir: 1 | -1 }

export function fromHash(talk: TalkDef): Pos {
  const [, id, step] = location.hash.split('/')
  const i = talk.scenes.findIndex((s) => s.id === decodeURIComponent(id ?? ''))
  if (i < 0) return { scene: 0, step: 0, dir: 1 }
  return { scene: i, step: clampStep(talk, i, Number(step) || 0), dir: 1 }
}

const clampStep = (talk: TalkDef, i: number, step: number) => Math.max(0, Math.min(step, talk.scenes[i].steps - 1))

export function nextPos(talk: TalkDef, p: Pos): Pos | null {
  if (p.step + 1 < talk.scenes[p.scene].steps) return { ...p, step: p.step + 1, dir: 1 }
  if (p.scene + 1 < talk.scenes.length) return { scene: p.scene + 1, step: 0, dir: 1 }
  return null
}

export function prevPos(talk: TalkDef, p: Pos): Pos | null {
  if (p.step > 0) return { ...p, step: p.step - 1, dir: -1 }
  if (p.scene > 0) return { scene: p.scene - 1, step: talk.scenes[p.scene - 1].steps - 1, dir: -1 }
  return null
}

/** 全体の中での位置 (0〜1)。進捗バーに使う */
export function progress(talk: TalkDef, p: Pos) {
  const total = talk.scenes.reduce((n, s) => n + s.steps, 0)
  const done = talk.scenes.slice(0, p.scene).reduce((n, s) => n + s.steps, 0) + p.step + 1
  return { done, total }
}

export function useNav(talk: TalkDef) {
  const [pos, setPos] = useState<Pos>(() => fromHash(talk))
  const chan = useRef<BroadcastChannel | null>(null)
  const remote = useRef<string>('')

  useEffect(() => {
    const c = new BroadcastChannel(`stage:${location.pathname}`)
    c.onmessage = (e) => {
      const { scene, step } = e.data as Pos
      remote.current = `${scene}/${step}`
      setPos((p) => (p.scene === scene && p.step === step ? p : { scene, step, dir: scene < p.scene || (scene === p.scene && step < p.step) ? -1 : 1 }))
    }
    chan.current = c
    return () => c.close()
  }, [])

  useEffect(() => {
    history.replaceState(null, '', `${location.search}#/${talk.scenes[pos.scene].id}/${pos.step}`)
    const key = `${pos.scene}/${pos.step}`
    if (remote.current !== key) chan.current?.postMessage({ scene: pos.scene, step: pos.step })
    remote.current = ''
  }, [pos, talk])

  const next = useCallback(() => setPos((p) => nextPos(talk, p) ?? p), [talk])
  const prev = useCallback(() => setPos((p) => prevPos(talk, p) ?? p), [talk])
  const jump = useCallback(
    (scene: number, step = 0) => setPos((p) => ({ scene, step: clampStep(talk, scene, step), dir: scene < p.scene ? -1 : 1 })),
    [talk],
  )
  return { pos, next, prev, jump }
}

/** 共通のキー操作。追加の操作は extra に渡す */
export function useKeys(handlers: { next: () => void; prev: () => void; extra?: Record<string, () => void> }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) {
        e.preventDefault()
        handlers.next()
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        handlers.prev()
      } else handlers.extra?.[e.key]?.()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [handlers])
}

/** 枠に収まる縮尺 */
export function useFit(box: () => { w: number; h: number }, W: number, H: number) {
  const calc = () => {
    const b = box()
    return Math.min(b.w / W, b.h / H)
  }
  const [s, setS] = useState(calc)
  useEffect(() => {
    const on = () => setS(calc())
    on()
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  })
  return s
}
