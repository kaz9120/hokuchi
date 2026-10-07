// 公開用のビルド。OGP 画像・メタタグ・同梱フォントつきの静的ファイル一式を出す
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build as viteBuild } from 'vite'
import { stageConfig } from './vite.mjs'
import { bundleFonts, familiesIn } from './fonts.mjs'
import { SITE, launch, loadTalk, shootStates, startServer, talkInfo, waitReady } from './talk.mjs'

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
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="ja_JP" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${url}og.png" />`,
  ].join('\n    ')
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
  await page.setViewportSize({ width: 1200, height: 630 })
  await page.goto(`${url}?og`)
  await waitReady(page)
  const og = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
  // 同梱するフォントのために、全状態に出てくる文字と、テーマの書体を集める
  await page.setViewportSize({ width: 1280, height: 720 })
  const shots = states ? await shootStates(page, url) : (await page.goto(`${url}?shot=all`), await waitReady(page), [])
  const { text, fontFamily } = await page.evaluate(() => ({
    text: document.body.innerText,
    fontFamily: getComputedStyle(document.querySelector('.stage')).fontFamily,
  }))
  await browser.close()
  await server.close()

  const families = familiesIn(fontFamily)
  const marker = '<!--stage:bundled-fonts-->'
  await viteBuild(stageConfig(talkDir, { outDir, meta: metaTags(talk, info.slug), fonts: marker }))
  const bundled = await bundleFonts(families, text + talk.title, outDir)
  const html = join(outDir, 'index.html')
  writeFileSync(html, readFileSync(html, 'utf8').replace(marker, bundled.link))
  writeFileSync(join(outDir, 'og.png'), og)
  writeFileSync(join(outDir, 'stage.json'), JSON.stringify(info, null, 2) + '\n')
  console.log(`  ${info.name} → /${info.slug}/ (フォント ${families.join(', ')} を ${bundled.chars} 字・${Math.round(bundled.bytes / 1024)} KB で同梱)`)
  return { info, states: shots }
}
