// 公開用の書き出し。AI に渡せるトーク全体のテキストと、1 状態 1 ページの PDF を作る。
// どちらも、静止画モード (?shot=all) で全状態を並べたページから作る
import { SITE } from './talk.mjs'

/** 全状態の、画面に出た文字を集める。ブランド枠 (ロゴ・著作権表示) はシーンの外なので入らない */
export async function collectFrames(page) {
  return page.$$eval('[data-frame]', (els) =>
    els.map((el) => {
      const [id, step] = el.getAttribute('data-frame').split('/')
      const text = el.querySelector('.scene')?.innerText ?? ''
      return { id, step: Number(step), lines: text.split('\n').map((l) => l.trim()).filter(Boolean) }
    }),
  )
}

/**
 * トーク全体のテキスト (Markdown)。シーンごとに、状態の順に「画面に出た文字」と「話したこと」を並べる。
 * 画面に出た文字は、同じシーンの前の状態に無かったものだけにする (見出しや数字を状態の数だけ繰り返さない)
 */
export function talkText(talk, info, frames) {
  const event = talk.event ? [talk.event.name, talk.event.title].filter(Boolean).join(' — ') : null
  const head = [
    `# ${talk.title}`,
    '',
    `- 登壇者: ${talk.speaker}${talk.affiliation ? `（${talk.affiliation}）` : ''}`,
    event && `- イベント: ${event}`,
    info.date && `- 日付: ${info.date}`,
    info.public && `- URL: ${SITE}/${info.slug}/`,
    talk.description && `- 概要: ${talk.description}`,
    '',
    'この文書は、発表資料をテキストにしたものです。シーンごとに、状態の順に「画面に出た文字」と「話したこと」を並べています。「画面に出た文字」は、その状態でスライドに新しく出た文字です。「話したこと」は、登壇者が口頭で補足した内容です。',
  ].filter((l) => l !== null && l !== false && l !== undefined)

  const body = talk.scenes.map((scene, i) => {
    const mine = frames.filter((f) => f.id === scene.id).sort((a, b) => a.step - b.step)
    const states = mine.map((f, k) => {
      const before = new Set(k > 0 ? mine[k - 1].lines : [])
      const fresh = f.lines.filter((l) => !before.has(l))
      const note = scene.notes?.[f.step]?.trim()
      return [
        mine.length > 1 ? `### ${i + 1}-${f.step + 1}\n` : null,
        fresh.length ? `画面に出た文字:\n${fresh.map((l) => `- ${l}`).join('\n')}\n` : null,
        note ? `話したこと:\n${note}\n` : null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    return [`## ${i + 1}. ${scene.title ?? scene.id}\n`, ...states].join('\n')
  })
  return [...head, '', ...body].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** 全状態を 1 状態 1 ページの PDF にする。文字は画像にせず、選んでコピーできるまま残す。戻り値は PDF の中身 */
export async function renderPdf(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  try {
    await page.goto(`${url}?shot=all`)
    await page.waitForFunction(() => window.__STAGE_READY__ === true, null, { timeout: 30000 })
    await page.emulateMedia({ media: 'print' })
    return await page.pdf({ width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true })
  } finally {
    await page.close()
  }
}

/** 公開用の画面に渡す書き出しの情報。HTML の中に JSON で埋める (単一 HTML でも読めるように) */
export function exportTag(data) {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c')
  return `<script id="stage-export" type="application/json">${json}</script>`
}
