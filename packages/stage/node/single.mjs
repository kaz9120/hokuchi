// 単一の HTML ファイルへの書き出し。社内向けの発表など、サイトに載せずにファイルで共有するときに使う。
// JS・CSS・画像・同梱フォントをすべて 1 ファイルに埋め込むので、ネットワークなしで file:// から開いて再生できる
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build as viteBuild } from 'vite'
import { stageConfig } from './vite.mjs'
import { bundleFonts, familiesIn } from './fonts.mjs'
import { publicInfo } from './build.mjs'
import { launch, loadTalk, startServer, waitReady } from './talk.mjs'
import { collectFrames, exportTag, renderPdf, talkText } from './export.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// インラインの <script> と <style> の中で、閉じタグとして読まれないようにする
const safe = (code, tag) => code.replaceAll(`</${tag}`, `<\\/${tag}`)

/**
 * トークを 1 つの HTML にまとめて outDir/<slug>.html に書き出す。戻り値は書き出したパス。
 * 既定は公開用の画面で、PDF を HTML の隣に書き出し、トーク全体のテキストを HTML に埋める。
 * present を true にすると、発表用の画面 (発表者ビュー・ノートつき) で書き出す
 */
export async function buildSingle(talkDir, outDir, { present = false } = {}) {
  const { server, url } = await startServer(talkDir)
  const talk = await loadTalk(server)
  const info = publicInfo(talkDir, talk)
  // 同梱するフォントのために、全状態に出てくる文字と、テーマの書体を集める (build.mjs と同じ)
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`${url}?shot=all`)
  await waitReady(page)
  const { text, fontFamily } = await page.evaluate(() => ({
    text: document.body.innerText,
    fontFamily: getComputedStyle(document.querySelector('.stage')).fontFamily,
  }))
  const doc = present ? null : talkText(talk, info, await collectFrames(page))
  const pdf = present ? null : await renderPdf(browser, url)
  await browser.close()
  await server.close()

  const work = join(talkDir, 'out', '.single')
  rmSync(work, { recursive: true, force: true })
  const fontsDir = join(work, 'fonts')
  const bundled = await bundleFonts(familiesIn(fontFamily), text + talk.title, fontsDir)
  const fontCss = readFileSync(join(fontsDir, 'fonts', 'fonts.css'), 'utf8').replace(/url\(\.\/([^)]+\.woff2)\)/g, (_, f) => {
    return `url(data:font/woff2;base64,${readFileSync(join(fontsDir, 'fonts', f)).toString('base64')})`
  })

  // 動的 import (テーマ) を 1 本の JS に畳み、CSS も 1 本にまとめ、画像はすべて data URI にする
  const meta = [`<title>${esc(talk.title)}</title>`, `<meta name="description" content="${esc(talk.description)}" />`].join('\n    ')
  const appDir = join(work, 'app')
  const cfg = stageConfig(talkDir, { outDir: appDir, meta, fonts: `<style>${safe(fontCss, 'style')}</style>`, view: present ? 'present' : 'public' })
  await viteBuild({
    ...cfg,
    build: {
      ...cfg.build,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: { output: { codeSplitting: false } },
    },
  })

  const assets = join(appDir, 'assets')
  let html = readFileSync(join(appDir, 'index.html'), 'utf8')
  html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/g, (_, f) => {
    return `<script type="module">${safe(readFileSync(join(assets, f), 'utf8'), 'script')}</script>`
  })
  html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/g, (_, f) => {
    return `<style>${safe(readFileSync(join(assets, f), 'utf8'), 'style')}</style>`
  })
  // 埋め込み漏れがあれば、file:// では読めないので止める
  const left = html.match(/(?:src|href)="\.\/[^"]+"/g)
  if (left) throw new Error(`埋め込めなかったファイルがあります: ${left.join(', ')} (assets: ${readdirSync(assets).join(', ')})`)

  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, `${info.slug}.html`)
  if (pdf) {
    writeFileSync(join(outDir, `${info.slug}.pdf`), pdf)
    html = html.replace('</body>', `${exportTag({ text: doc, pdf: `./${info.slug}.pdf` })}</body>`)
  }
  writeFileSync(out, html)
  rmSync(work, { recursive: true, force: true })
  console.log(`  ${info.name} → ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB、フォント ${bundled.chars} 字を同梱)`)
  return out
}
