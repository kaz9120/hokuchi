// ファイルの読み書き。書き込みは「読んだ版と違えば保存しない」にそろえる (rebuild.md 5 章)。
// Claude Code と画面が同じファイルを直すので、どちらの書き込みも黙って消えないようにする
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import YAML from 'yaml'
import { conflict } from './errors.ts'

/** 中身の版。無いファイルは "none" */
export const versionOf = (text: string | null) => (text === null ? 'none' : createHash('sha1').update(text).digest('hex').slice(0, 12))

export const readText = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null)

export function readVersioned(file: string) {
  const text = readText(file)
  return { text, version: versionOf(text) }
}

/** 書く。base を渡したときは、いまの版と比べて違えば書かない */
export function writeText(file: string, text: string, base?: string) {
  if (base !== undefined && versionOf(readText(file)) !== base) throw conflict()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** 読んで、書き換えて、書く。fn が返した文字列が今と同じなら書かない */
export function rewrite(file: string, fn: (text: string) => string, base?: string) {
  const cur = readText(file) ?? ''
  if (base !== undefined && versionOf(cur) !== base) throw conflict()
  const next = fn(cur)
  if (next !== cur) writeFileSync(file, next)
  return next
}

export const readYaml = <T = any>(file: string): T => (YAML.parse(readFileSync(file, 'utf8')) ?? {}) as T
/** YAML を書く。行を折り返さない (人が読めて、AI も直せるように) */
export const yamlText = (data: unknown) => YAML.stringify(data, { lineWidth: 0 })
