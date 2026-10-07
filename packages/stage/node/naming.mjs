// トークのディレクトリ名の規則 (YYYY_MM_DD_<タグ>_<演題>) と、URL の slug
import { basename } from 'node:path'

/**
 * ディレクトリ名から、日付・タグ・演題と URL の slug を読む。
 * 命名は過去資料と同じ YYYY_MM_DD_<タグ>_<演題> (例: 2026_09_29_DevsGarden_強いチームの作り方は AI で変わるのか)。
 * slug は日付とタグから作る (例: 2026-09-29-devsgarden)。タグに英数字が無いときは、talk.tsx の slug で指定する
 */
export function talkInfo(dir) {
  const name = basename(dir)
  const m = name.match(/^(\d{4})_(\d{2})_(\d{2})_([^_]+)_(.+)$/)
  if (!m) return { name, date: null, tag: null, title: name, slug: null }
  const [, y, mo, d, tag, title] = m
  const ascii = tag.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return { name, date: `${y}-${mo}-${d}`, tag, title, slug: ascii ? `${y}-${mo}-${d}-${ascii}` : null }
}
