// slides.y-kaz.com のトップページ・404 ページ・sitemap.xml。公開用の組み立て (build.mjs) と、開発サーバ (dev.mjs) で同じものを使う
import { SITE } from '../../packages/stage/node/talk.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function sitemap(entries) {
  const urls = [`${SITE}/`, ...entries.map((e) => `${SITE}/${e.slug}/`)]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #13110e; color: #ebe5d8; font-family: 'LINE Seed JP', system-ui, sans-serif; }
  a { color: inherit; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
  header { padding: 64px 0 24px; }
  h1 { font-size: 28px; margin: 0; letter-spacing: 0.02em; }
  header p { color: #a8a094; margin: 8px 0 0; }
  h2 { font-size: 15px; color: #a8a094; margin: 40px 0 16px; font-weight: 700; letter-spacing: 0.08em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 28px; }
  .talk { text-decoration: none; display: grid; gap: 8px; }
  .talk img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; background: #1a1814; border: 1px solid #26221c; transition: border-color .3s; }
  .talk:hover img { border-color: #f47d3a; }
  .meta { font-size: 13px; color: #a8a094; display: flex; gap: 8px; align-items: center; }
  .tag { border: 1px solid #3a342b; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
  .title { font-size: 17px; font-weight: 700; line-height: 1.5; }
  footer { color: #7d7468; font-size: 13px; padding: 64px 0 48px; }
`

export function indexHtml(entries) {
  const byYear = new Map()
  for (const e of entries) {
    const y = (e.date ?? '').slice(0, 4) || '—'
    byYear.set(y, [...(byYear.get(y) ?? []), e])
  }
  const sections = [...byYear]
    .map(
      ([y, list]) => `<h2>${esc(y)}</h2>
      <div class="grid">
        ${list
          .map(
            (e) => `<a class="talk" href="./${esc(e.slug)}/">
          <img src="./${esc(e.slug)}/og.png" alt="" loading="lazy" />
          <div class="meta"><span>${esc(e.date)}</span>${e.tag ? `<span class="tag">#${esc(e.tag)}</span>` : ''}${e.event?.name ? `<span>${esc(e.event.name)}</span>` : ''}${e.public === false ? '<span class="tag">非公開 (開発サーバだけに出る)</span>' : ''}</div>
          <div class="title">${esc(e.title)}</div>
        </a>`,
          )
          .join('\n        ')}
      </div>`,
    )
    .join('\n      ')
  const desc = '焚き火を愛するエンジニア 山本一将の発表資料です。'
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>slides.y-kaz.com</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${SITE}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="slides.y-kaz.com" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${SITE}/" />
    ${entries[0] ? `<meta property="og:image" content="${SITE}/${esc(entries[0].slug)}/og.png" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&display=swap" rel="stylesheet" />
    <style>${PAGE_STYLE}</style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>slides.y-kaz.com</h1>
        <p>${desc}</p>
      </header>
      ${sections || '<p>まだ公開しているトークはありません。</p>'}
      <footer>© 山本一将</footer>
    </div>
  </body>
</html>
`
}

export function notFoundHtml() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>見つかりません ・ slides.y-kaz.com</title><style>${PAGE_STYLE}</style></head>
<body><div class="wrap"><header><h1>見つかりません</h1><p>このページはありません。<a href="/">トップページ</a>から探してみてください。</p></header></div></body></html>
`
}
