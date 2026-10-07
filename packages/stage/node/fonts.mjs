// Web フォントの同梱。公開用のビルドに、そのトークで使っている文字だけを切り出したフォントを含める。
// 会場がオフラインでも字形が変わらず、閲覧環境によって字幅が変わることもない。
// 原本は Google Fonts のリポジトリから取り、~/.cache/hokuchi-stage/fonts に置いて使い回す。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import subsetFont from 'subset-font'

const RAW = 'https://github.com/google/fonts/raw/main/ofl'

// 書体名 → 原本。可変フォントは weight の範囲を持つ
export const FAMILIES = {
  'Noto Sans JP': [{ file: 'notosansjp/NotoSansJP%5Bwght%5D.ttf', weight: '100 900' }],
  Nunito: [{ file: 'nunito/Nunito%5Bwght%5D.ttf', weight: '200 1000' }],
  Inter: [{ file: 'inter/Inter%5Bopsz,wght%5D.ttf', weight: '100 900' }],
  'LINE Seed JP': [
    { file: 'lineseedjp/LINESeedJP-Regular.ttf', weight: '400' },
    { file: 'lineseedjp/LINESeedJP-Bold.ttf', weight: '700' },
    { file: 'lineseedjp/LINESeedJP-ExtraBold.ttf', weight: '800' },
  ],
}

const cacheDir = join(homedir(), '.cache', 'hokuchi-stage', 'fonts')

async function original(file) {
  mkdirSync(cacheDir, { recursive: true })
  const path = join(cacheDir, decodeURIComponent(file).replace(/\//g, '__'))
  if (!existsSync(path)) {
    const res = await fetch(`${RAW}/${file}`)
    if (!res.ok) throw new Error(`フォントを取得できません: ${file} (${res.status})`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(path)
}

/** CSS の font-family の値から、同梱できる書体名を取り出す */
export function familiesIn(fontFamily) {
  return fontFamily
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name in FAMILIES)
}

/**
 * 指定した書体を、text に含まれる文字だけに切り出して outDir/fonts に書き出す。
 * 戻り値は <head> に入れる <link>。
 */
export async function bundleFonts(families, text, outDir) {
  // 数の数え上げや記号のために、ASCII の印字可能文字は常に含める
  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')
  const chars = [...new Set(text + ascii + '・、。「」（）〜…→')].join('')
  const dir = join(outDir, 'fonts')
  mkdirSync(dir, { recursive: true })
  const faces = []
  let bytes = 0
  for (const family of families) {
    for (const { file, weight } of FAMILIES[family]) {
      const out = await subsetFont(await original(file), chars, { targetFormat: 'woff2' })
      const name = `${family.replace(/\s+/g, '')}-${weight.replace(/\s+/g, '-')}.woff2`
      writeFileSync(join(dir, name), out)
      bytes += out.length
      faces.push(`@font-face { font-family: '${family}'; src: url(./${name}) format('woff2'); font-weight: ${weight}; font-display: block; }`)
    }
  }
  writeFileSync(join(dir, 'fonts.css'), faces.join('\n') + '\n')
  return { link: '<link rel="stylesheet" href="./fonts/fonts.css" />', bytes, chars: chars.length }
}
