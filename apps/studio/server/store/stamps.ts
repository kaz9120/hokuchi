// 中身のフォルダのファイルの版。実行の終わりと studio が書いたあとに記録し、次の実行の前に比べる。
// 比べて変わっていたファイルは「外で変わった」として Claude に添える (画面を閉じていた間の、ターミナルやエディタでの直しも拾う)
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Work } from '../../shared/types.ts'
import { readJson, workDir } from './works.ts'
import { noteDir, talkDirOf } from './places.ts'
import { writeFileSync } from 'node:fs'

const SKIP = /(^|\/)(out|node_modules|\.[^/]+|reads)(\/|$)/
const stampFile = (id: string) => join(workDir(id), 'stamps.json')

function walk(dir: string, base: string, out: Record<string, string>) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = relative(base, abs)
    if (SKIP.test(rel)) continue
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, base, out)
    else out[rel] = `${st.size}:${Math.round(st.mtimeMs)}`
  }
}

/** 作品の中身のフォルダの、いまの版 */
export function currentStamps(work: Work): Record<string, string> {
  const out: Record<string, string> = {}
  const dirs = [work.note?.slug ? noteDir(work.note.slug) : null, talkDirOf(work)].filter(Boolean) as string[]
  for (const d of dirs) {
    const part: Record<string, string> = {}
    walk(d, d, part)
    const name = d.split('/').pop()!
    for (const [k, v] of Object.entries(part)) out[`${name}/${k}`] = v
  }
  return out
}

export function saveStamps(work: Work) {
  writeFileSync(stampFile(work.id), JSON.stringify(currentStamps(work)))
}

/**
 * studio が中身を書く前に呼ぶ。前に記録したときから外で変わったファイルを作品に記録し、版を記録し直す。
 * write を渡したら、それを書いてから版を記録する (studio 自身の書き込みは外の変化に数えない)
 */
export function settle(work: Work, addChanges: (files: string[]) => void, write?: () => void) {
  const outside = changedSince(work)
  if (outside.length) addChanges(outside)
  write?.()
  saveStamps(work)
}

/** 前に記録したときから変わったファイル。記録が無ければ空 */
export function changedSince(work: Work): string[] {
  if (!existsSync(stampFile(work.id))) return []
  let before: Record<string, string> = {}
  try {
    before = readJson(stampFile(work.id))
  } catch {
    return []
  }
  const now = currentStamps(work)
  const keys = new Set([...Object.keys(before), ...Object.keys(now)])
  return [...keys].filter((k) => before[k] !== now[k]).sort()
}
