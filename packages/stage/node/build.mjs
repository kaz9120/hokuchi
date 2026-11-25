// 公開用のビルド。OGP 画像 (表紙の静止画)・メタタグ・同梱フォントつきの静的ファイル一式を出す。
// 画面は公開用で、トーク全体のテキスト (talk.md) と PDF も書き出す
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build as viteBuild } from 'vite'
import { stageConfig } from './vite.mjs'
import { bundleFonts, familiesIn } from './fonts.mjs'
import { SITE, launch, loadTalk, shootStates, startServer, talkInfo } from './talk.mjs'
import { collectFrames, exportTag, renderPdf, talkText } from './export.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function metaTags(talk, slug) {
  const url = `${SITE}/${slug}/`
  const title = esc(talk.title)
  const desc = esc(talk.description)
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="slides.y-kaz.com" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${url}og.png" />`,
    `<meta property="og:image:width" content="1280" />`,
    `<meta property="og:image:height" content="720" />`,
    `<meta property="og:locale" content="ja_JP" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${url}og.png" />`,
    // AI に読ませたい人とクローラのために、トーク全体のテキストの在りかを示す
    `<link rel="alternate" type="text/markdown" href="talk.md" />`,
  ].join('\n    ')
}

/** 公開画面の帯に出る文字。hokuchi 系は帯も同梱フォントで描くので、その字を同梱に足す (runtime/public.tsx) */
const BAR_TEXT = '‹›0123456789 / 一覧全画面このページのリンクテキストをコピーしましたPDF'

/**
 * ページごとの共有用 HTML (/<slug>/<n>/index.html) と、その状態の静止画の OGP 画像を書く。
 * # の後ろはサーバに届かないので、#/<scene>/<step> の URL を貼っても OGP は表紙になる。
 * そこでパスの URL を状態ごとに作り、メタタグだけ持たせて、開いた人は再生画面の該当の位置へ送る。
 * n は帯の「n / 全体」と同じ 1 始まりの通し番号
 */
// 再生画面はアドレス欄を /<slug>/<n>/ に書き換える (nav.ts の paths)。そのあと読み込む assets/ などの相対パスが
// /<slug>/<n>/assets/ を指さないよう、開いた時点のトークの根を <base> に固定する。配信先のパスに依らないよう実行時に作る
const BASE_TAG = `<script>document.write('<base href="' + location.href.replace(/[?#].*$/, '').replace(/index\\.html$/, '').replace(/"/g, '%22') + '">')</script>`

function writePages(talk, info, shots, outDir) {
  const byName = new Map(shots.map((s) => [s.name, s.png]))
  const states = talk.scenes.flatMap((s) => Array.from({ length: s.steps }, (_, step) => ({ id: s.id, step })))
  const root = `${SITE}/${info.slug}/`
  const title = esc(talk.title)
  const desc = esc(talk.description)
  states.forEach(({ id, step }, i) => {
    const n = i + 1
    const png = byName.get(`${id}-${step}`)
    if (!png) throw new Error(`${info.name}: ${id}/${step} の静止画がありません`)
    const url = `${root}${n}/`
    const dir = join(outDir, String(n))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'og.png'), png)
    const target = `../#/${encodeURIComponent(id)}/${step}`
    const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>${title} (${n} / ${states.length})</title>
    <meta name="description" content="${desc}" />
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="${root}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="slides.y-kaz.com" />
    <meta property="og:title" content="${title} (${n} / ${states.length})" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${url}og.png" />
    <meta property="og:image:width" content="1280" />
    <meta property="og:image:height" content="720" />
    <meta property="og:locale" content="ja_JP" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title} (${n} / ${states.length})" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${url}og.png" />
    <script>location.replace(${JSON.stringify(target)})</script>
  </head>
  <body>
    <a href="${esc(target)}">${title} の ${n} ページ目を開く</a>
  </body>
</html>
`
    writeFileSync(join(dir, 'index.html'), html)
  })
}

/** トークの公開情報。slug は talk.tsx の指定を優先し、無ければディレクトリ名から作る */
export function publicInfo(talkDir, talk) {
  const info = talkInfo(talkDir)
  const slug = talk.slug ?? info.slug
  if (!slug) throw new Error(`${info.name}: URL の slug を決められません。ディレクトリ名を YYYY_MM_DD_<タグ>_<演題> にするか、talk.tsx に slug を書いてください`)
  return {
    slug,
    name: info.name,
    title: talk.title,
    description: talk.description,
    date: talk.date ?? info.date,
    tag: info.tag,
    event: talk.event ?? null,
    speaker: talk.speaker,
    theme: talk.theme.name,
    public: talk.public === true,
    scenes: talk.scenes.length,
  }
}

/**
 * 公開用にビルドする。states を true にすると、見た目の差分検査のために全状態の静止画も返す。
 * 戻り値は { info, states }
 */
export async function buildTalk(talkDir, outDir, { states = false } = {}) {
  const { server, url } = await startServer(talkDir)
  const talk = await loadTalk(server)
  const info = publicInfo(talkDir, talk)
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  // 全状態を撮る。OGP 画像は最初の状態 (表紙) そのもので、別のカードは描かない
  const shots = await shootStates(page, url)
  const og = shots[0].png
  // 公開用の書き出し。テキストは全状態の画面の文字とノートから、PDF は全状態を並べたページから作る
  const doc = talkText(talk, info, await collectFrames(page))
  const pdf = await renderPdf(browser, url)
  // 同梱するフォントのために、全状態に出てくる文字と、テーマの書体を集める
  const { text, fontFamily } = await page.evaluate(() => ({
    text: document.body.innerText,
    fontFamily: getComputedStyle(document.querySelector('.stage')).fontFamily,
  }))
  await browser.close()
  await server.close()

  const families = familiesIn(fontFamily)
  const marker = '<!--stage:bundled-fonts-->'
  await viteBuild(stageConfig(talkDir, { outDir, meta: metaTags(talk, info.slug), fonts: marker, view: 'public' }))
  const bundled = await bundleFonts(families, text + talk.title + BAR_TEXT, outDir)
  const html = join(outDir, 'index.html')
  const pdfName = `${info.slug}.pdf`
  writeFileSync(html, readFileSync(html, 'utf8').replace('<head>', `<head>${BASE_TAG}`).replace(marker, bundled.link).replace('</body>', `${exportTag({ text: doc, pdf: `./${pdfName}`, pages: true })}</body>`))
  writeFileSync(join(outDir, 'talk.md'), doc)
  writeFileSync(join(outDir, pdfName), pdf)
  writeFileSync(join(outDir, 'og.png'), og)
  writePages(talk, info, shots, outDir)
  writeFileSync(join(outDir, 'stage.json'), JSON.stringify(info, null, 2) + '\n')
  console.log(`  ${info.name} → /${info.slug}/ (フォント ${families.join(', ')} を ${bundled.chars} 字・${Math.round(bundled.bytes / 1024)} KB で同梱)`)
  return { info, states: states ? shots : [] }
}
