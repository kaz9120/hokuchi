// 画面のルータ。パスとハッシュは、ここでだけ読む。
// 画面は ホーム → 作品の画面 → 面 の 2 階層。URL は /works/<key>#<面>/<場所>。
// 面の切り替えは履歴に積み、面の中の場所 (読んでいるシーン・段落) は積まずに書き換える。移動でページを読み込み直さない
import { useSyncExternalStore } from 'react'

/** 作品の画面の面。発表は 企画・流れ・コマ・読み・公開、記事は 企画・構成・原稿・読み・公開 */
export type Face = 'plan' | 'flow' | 'koma' | 'outline' | 'draft' | 'reads' | 'publish'
const FACES: Face[] = ['plan', 'flow', 'koma', 'outline', 'draft', 'reads', 'publish']
/** 前の URL の企画の段階 (#seed など)。企画の面の場所として読む */
const LEGACY_STAGES = ['seed', 'audience', 'goal', 'oneLiner']

export type Route =
  | { page: 'home' }
  | {
      page: 'work'
      key: string
      /** 面。ハッシュに無ければ null (作品の画面が既定の面を選ぶ) */
      face: Face | null
      /** 面の中の場所。企画は段階の key、コマはシーンの id、原稿は段落の番号 */
      place: string | null
      /** 移動のたびに増える数。同じ場所へもう一度移るときも、面が動けるように */
      seq: number
    }

let seq = 0

function parse(): Route {
  const work = location.pathname.match(/^\/works\/([^/]+)/)?.[1]
  if (!work) return { page: 'home' }
  const [head, ...rest] = decodeURIComponent(location.hash.slice(1)).split('/')
  const place = rest.join('/') || null
  if (FACES.includes(head as Face)) return { page: 'work', key: decodeURIComponent(work), face: head as Face, place, seq }
  if (LEGACY_STAGES.includes(head)) return { page: 'work', key: decodeURIComponent(work), face: 'plan', place: head, seq }
  return { page: 'work', key: decodeURIComponent(work), face: null, place: null, seq }
}

// 前の画面の URL (/talks/<slug>・/notes/<dir>) は、作品の画面に移す
{
  const talk = location.pathname.match(/^\/talks\/([^/]+)/)?.[1]
  const note = location.pathname.match(/^\/notes\/([^/]+)/)?.[1]
  if (talk) history.replaceState(null, '', `/works/${encodeURIComponent(`talk:${decodeURIComponent(talk)}`)}${location.hash || '#koma'}`)
  if (note) history.replaceState(null, '', `/works/${encodeURIComponent(`note:${decodeURIComponent(note)}`)}#draft`)
}

let current = parse()
const listeners = new Set<() => void>()
function emit() {
  seq++
  current = parse()
  for (const fn of listeners) fn()
}
addEventListener('popstate', emit)
// 手でハッシュを書き換えたとき (agentation のリンクなど) も拾う
addEventListener('hashchange', emit)

/** 移る。to はパス (ハッシュ付きでもよい) か、ハッシュだけ ("#koma/xxx") */
export function navigate(to: string, { replace = false } = {}) {
  const url = new URL(to, location.href)
  const next = url.pathname + url.search + url.hash
  if (replace) history.replaceState(null, '', next)
  else if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next)
  emit()
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
  )
}

export const workHref = (key: string, face?: Face | null, place?: string | null) => `/works/${encodeURIComponent(key)}${face ? `#${face}${place ? `/${place}` : ''}` : ''}`

/** リンク。左クリックは読み込み直さずに移る。⌘・Ctrl・中クリックは、ブラウザに任せる (新しいタブ) */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  navigate(href)
}

// ---------------------------------------------------------------- 読んでいる場所
// 面がスクロールしたときの「いま読んでいる場所」。URL は履歴に積まずに書き換え、レールの目次に映す。
// ルータの place (話者が選んで移った場所) とは分ける。分けないと、スクロールのたびに面が飛ぶ

let reading: { face: Face; place: string | null } | null = null
const readingListeners = new Set<() => void>()

export function setReading(face: Face, place: string | null) {
  if (reading?.face === face && reading.place === place) return
  reading = { face, place }
  const r = current
  if (r.page === 'work') history.replaceState(null, '', workHref(r.key, face, place))
  for (const fn of readingListeners) fn()
}

export function useReading() {
  return useSyncExternalStore(
    (fn) => {
      readingListeners.add(fn)
      return () => readingListeners.delete(fn)
    },
    () => reading,
  )
}
