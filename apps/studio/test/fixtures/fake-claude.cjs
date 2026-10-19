#!/usr/bin/env node
// テスト用の claude。studio が `claude -p --output-format json` で呼ぶものの代わりに、決まった答えを返す。
// ハーネスが PATH の先頭に `claude` の名前で置く。呼ばれた cwd と依頼文の頭を FAKE_CLAUDE_LOG に 1 行ずつ残す
const fs = require('node:fs')

let prompt = ''
process.stdin.on('data', (d) => (prompt += d))
process.stdin.on('end', () => {
  if (process.env.FAKE_CLAUDE_LOG) {
    fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), prompt }) + '\n')
  }
  const answer = respond(prompt)
  process.stdout.write(JSON.stringify({ type: 'result', result: answer }))
})

const scores = (keys) =>
  Object.fromEntries(keys.map((k, i) => [k, { score: i === 0 ? 9 : i === 1 ? 0 : 3, reason: `${k} の理由` }]))

function respond(prompt) {
  // 聴衆役 (発表)
  if (prompt.includes('ある登壇を聞きに来ています')) {
    const scenes = [...prompt.matchAll(/【([a-z0-9-]+)】/g)].map((m) => m[1])
    const first = scenes[0]
    const notes = [
      { scene: first, state: 1, kind: 'word', text: '分からない言葉がありました' },
      { scene: first, state: 0, kind: 'good', text: '導入が良かった' },
      { scene: 'no-such-scene', state: 2, kind: 'bogus', text: '存在しないシーンへの感想' },
      { scene: first, state: 99, kind: 'jump', text: '存在しないコマへの感想' },
    ]
    for (let i = 0; i < 12; i++) notes.push({ scene: first, state: 2, kind: 'unreadable', text: `埋め草 ${i}` })
    return (
      '前置きの文\n' +
      JSON.stringify({
        scores: scores(['got', 'trouble', 'insight', 'follow', 'glance', 'convinced', 'action', 'recommend']),
        message: '伝えたかったことの推測',
        wish: 'もっとこうだったら',
        notes,
      }) +
      '\n後ろの文'
    )
  }
  // 聴衆役 (記事)
  if (prompt.includes('note の記事を読みに来ています')) {
    const paras = [...prompt.matchAll(/【(\d+)】/g)].map((m) => Number(m[1]))
    return JSON.stringify({
      scores: scores(['got', 'trouble', 'insight', 'follow', 'hook', 'convinced', 'action', 'recommend']),
      message: '記事の推測',
      wish: '記事への望み',
      notes: [
        { para: paras[0], kind: 'jump', text: '最初の段落で話が飛んだ' },
        { para: 0, kind: 'good', text: '全体として良かった' },
        { para: 999, kind: 'word', text: '無い段落への感想' },
      ],
    })
  }
  // 原稿の名前 (slug)。タイトルで答えを変える (決まりに合わない名前・答えなし は、ローマ字に落ちる)
  if (prompt.includes('原稿の置き場の名前 (slug)')) {
    if (prompt.includes('ジャンプしよう')) return JSON.stringify({ slug: 'jump-for-joy' })
    if (prompt.includes('悪い名前')) return JSON.stringify({ slug: 'Bad Name!' })
    return '{}'
  }
  // 企画の「Claude に頼む」
  if (prompt.includes('あなたは、書き手と一緒に')) {
    return JSON.stringify({ items: [1, 2, 3].map((n) => ({ text: `案 ${n}`, note: `補足 ${n}` })) })
  }
  return '{}'
}
