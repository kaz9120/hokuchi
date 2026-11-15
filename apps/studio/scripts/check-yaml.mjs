#!/usr/bin/env node
// Claude が YAML を書いたあと、自分で読めるかを確かめるための検査。
// 使い方: node apps/studio/scripts/check-yaml.mjs <ファイル> [<ファイル> ...]
// 読めないファイルがあれば、場所と理由を出して 1 で終わる
import { readFileSync } from 'node:fs'
import { parseDocument } from 'yaml'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('使い方: node apps/studio/scripts/check-yaml.mjs <ファイル> ...')
  process.exit(2)
}
let bad = 0
for (const f of files) {
  let text
  try {
    text = readFileSync(f, 'utf8')
  } catch (e) {
    console.log(`NG ${f}: 読めません (${e.code ?? e.message})`)
    bad++
    continue
  }
  const doc = parseDocument(text)
  if (doc.errors.length) {
    bad++
    for (const e of doc.errors) {
      const at = e.linePos?.[0] ? `${e.linePos[0].line} 行 ${e.linePos[0].col} 列` : ''
      console.log(`NG ${f} ${at}: ${e.message.split('\n')[0]}`)
    }
    console.log('  「: 」や「#」を含む値は、"..." で囲むか、| のブロックにしてください')
  } else console.log(`OK ${f}`)
}
process.exit(bad ? 1 : 0)
