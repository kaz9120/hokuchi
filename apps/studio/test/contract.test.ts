// 作り直しで決めた API の規則を確かめる。studio.test.ts (段 0 の固定) と違い、作り直した API (shared/api.ts) に直接当てる。
//   版つきの書き込み・状態の表・タイトルの正・ごみ箱の名前・key の解決・立て直さずにトークを足す
//
//   bun run test:studio
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { HomeData, WorkView } from '../shared/api.ts'
import { repoRoot, startStudio, until, type Studio } from './harness.ts'

const TALK_A = '2026-11-01-fixturea'
let s: Studio
const archive = readdirSync(join(repoRoot, 'articles/note')).find((n) => /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(n) && existsSync(join(repoRoot, 'articles/note', n, 'index.md')))!

const call = async (path: string, method = 'GET', body?: unknown) => {
  const r = await fetch(s.url + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
  return { status: r.status, data: await r.json().catch(() => null) }
}
const w = (key: string) => `/api/works/${encodeURIComponent(key)}`
const view = async (key: string) => (await call(w(key))).data as WorkView
const briefFile = (id: string) => join(s.priv, 'works', id, 'brief.yaml')
const create = async (kind: 'talk' | 'note') => (await call('/api/works', 'POST', { kind })).data.key as string

before(async () => {
  s = await startStudio()
})
after(async () => {
  await s?.stop()
})

describe('版つきの書き込み', () => {
  it('企画シートは、読んだ版と違えば書かない。渡した欄だけを変え、null で消す', async () => {
    const id = await create('talk')
    const v = await view(id)
    assert.equal((await call(`${w(id)}/brief`, 'PATCH', { base: v.brief!.version, set: { fields: { a: '1', b: '2' } } })).status, 200)
    const before = readFileSync(briefFile(id), 'utf8')
    assert.equal((await call(`${w(id)}/brief`, 'PATCH', { base: v.brief!.version, set: { fields: { a: 'x' } } })).status, 409)
    assert.equal(readFileSync(briefFile(id), 'utf8'), before)
    const v2 = await view(id)
    assert.equal((await call(`${w(id)}/brief`, 'PATCH', { base: v2.brief!.version, set: { fields: { a: null, c: '3' } } })).status, 200)
    assert.deepEqual(YAML.parse(readFileSync(briefFile(id), 'utf8')).fields, { b: '2', c: '3' })
  })

  it('話すこと・シーンの情報・並びは、読んだときと違えば書かない', async () => {
    const key = `talk:${TALK_A}`
    const file = join(s.talkDirs.a, 'storyboard.md')
    const before = readFileSync(file, 'utf8')
    assert.equal((await call(`${w(key)}/units/intro/1`, 'PUT', { orig: '古い話すこと', text: 'x' })).status, 409)
    assert.equal((await call(`${w(key)}/outline`, 'PATCH', { op: 'meta', scene: 'intro', key: '伝えること', orig: '古い', value: 'x' })).status, 409)
    assert.equal((await call(`${w(key)}/outline`, 'PATCH', { op: 'move', scene: 'body', dir: -1, base: 'stale' })).status, 409)
    assert.equal(readFileSync(file, 'utf8'), before)
    assert.equal((await call(`${w(key)}/units/intro/9`, 'PUT', { orig: '', text: 'x' })).status, 400)
  })

  it('構成と front matter は、読んだ版と違えば書かない。本文を直しても front matter の版は変わらない', async () => {
    const id = await create('note')
    assert.equal((await call(`${w(id)}/body`, 'POST', { slug: 'contract-draft' })).status, 200)
    let v = await view(id)
    const b = v.body as any
    assert.equal((await call(`${w(id)}/outline`, 'PATCH', { op: 'replace', base: 'stale', sections: [] })).status, 409)
    assert.equal((await call(`${w(id)}/outline`, 'PATCH', { op: 'replace', base: b.outline.version, sections: [{ title: '冒頭', point: '', grain: '粗', budget: 0 }] })).status, 200)
    assert.equal((await call(`${w(id)}/units`, 'POST', { text: '本文' })).status, 200)
    v = await view(id)
    assert.equal((v.body as any).metaVersion, b.metaVersion)
    assert.equal((await call(`${w(id)}/meta`, 'PATCH', { base: 'stale', tags: ['a'] })).status, 409)
    assert.equal((await call(`${w(id)}/meta`, 'PATCH', { base: b.metaVersion, tags: ['a'] })).status, 200)
  })

  it('指摘の操作は、読んだときのスレッドと違えば断る', async () => {
    const key = `talk:${TALK_A}`
    const { data } = await call(`${w(key)}/threads`, 'POST', { at: { scene: 'intro', state: 1 }, text: '指摘' })
    const rev = (await view(key)).threads.items.find((t) => t.id === data.id)!.rev
    assert.equal((await call(`${w(key)}/threads/${data.id}/reply`, 'POST', { rev, text: '返信' })).status, 200)
    assert.equal((await call(`${w(key)}/threads/${data.id}/close`, 'POST', { rev })).status, 409)
    assert.equal((await call(`${w(key)}/threads`, 'POST', { at: { scene: 'no-such' }, text: 'x' })).status, 400)
  })
})

describe('状態の表', () => {
  it('状態ごとに、押せる操作が決まっている。押せない操作は断る', async () => {
    const id = await create('talk')
    let v = await view(id)
    assert.deepEqual([v.state.word, v.state.actions], ['下書き', ['finish', 'delete']])
    assert.equal((await call(`${w(id)}/actions/unfinish`, 'POST', {})).status, 400)
    assert.equal((await call(`${w(id)}/actions/finish`, 'POST', {})).status, 200)
    v = await view(id)
    assert.deepEqual([v.state.word, v.state.actions], ['完成', ['unfinish', 'publish-howto']])
    assert.equal((await call(`${w(id)}/actions/delete`, 'POST', {})).status, 400)
    const pub = await view(`note:${archive}`)
    assert.deepEqual([pub.state.word, pub.state.actions, pub.state.visibility], ['公開', ['revise'], 'public'])
    assert.equal((await view('talk:2026-09-29-devsgarden')).state.actions.length, 0)
    assert.equal((await call(`${w(id)}/actions/no-such`, 'POST', {})).status, 404)
  })

  it('外のトークに紐づく完成は「完成（社内）」と書き、企画の意図と食い違えば知らせる', async () => {
    const id = await create('talk')
    const b = YAML.parse(readFileSync(briefFile(id), 'utf8'))
    writeFileSync(briefFile(id), YAML.stringify({ ...b, talk: TALK_A, fields: { publish: '公開する' }, finishedAt: new Date().toISOString() }))
    const v = await view(id)
    assert.equal(v.state.label, '完成（社内）')
    assert.equal(v.state.notices.length, 1)
    // 紐づいたトークは、どの key で開いても企画シートの作品になる
    assert.equal((await view(`talk:${TALK_A}`)).key, id)
  })
})

describe('タイトルの正', () => {
  it('発表のタイトルは talk.tsx に書き、企画シートにも写す', async () => {
    const id = (await view(`talk:${TALK_A}`)).key
    const v = await view(id)
    assert.equal((await call(`${w(id)}/title`, 'PUT', { orig: 'ちがう', title: 'x' })).status, 409)
    assert.equal((await call(`${w(id)}/title`, 'PUT', { orig: v.title, title: "新しい 'タイトル'" })).status, 200)
    assert.ok(readFileSync(join(s.talkDirs.a, 'talk.tsx'), 'utf8').includes("title: '新しい \\'タイトル\\'',"))
    assert.equal(YAML.parse(readFileSync(briefFile(id), 'utf8')).title, "新しい 'タイトル'")
    assert.equal((await view(id)).title, "新しい 'タイトル'")
  })
})

describe('ごみ箱と改稿', () => {
  it('ごみ箱の名前は <日時>-<何を>-<id か slug>', async () => {
    const id = await create('note')
    const { data } = await call(`${w(id)}/actions/delete`, 'POST', {})
    assert.match(data.trash, new RegExp(`/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-work-${id}$`))
    const r = await call(`${w(`note:${archive}`)}/actions/revise`, 'POST', {})
    const c = await call(`${w(r.data.key)}/actions/cancel-revision`, 'POST', {})
    assert.match(c.data.trash, new RegExp(`/\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-revision-${archive.slice(11)}$`))
  })
})

describe('原稿の名前と読み手 (段 4)', () => {
  it('原稿は slug を渡さずに作れ、Claude が名前を付ける。Claude がだめならタイトルのローマ字、空や日本語だけのタイトルでも作れる', async () => {
    const id = await create('note')
    const v0 = await view(id)
    assert.equal((await call(`${w(id)}/title`, 'PUT', { orig: v0.title, title: 'ジャンプしよう' })).status, 200)
    assert.equal((await call(`${w(id)}/body`, 'POST', {})).status, 200)
    assert.equal((await view(id)).brief!.note, 'jump-for-joy')
    assert.ok(readFileSync(s.claudeLog, 'utf8').includes('原稿の置き場の名前 (slug)'))
    const bad = await create('note')
    const b0 = await view(bad)
    await call(`${w(bad)}/title`, 'PUT', { orig: b0.title, title: 'ちょっと悪い名前' })
    assert.equal((await call(`${w(bad)}/body`, 'POST', {})).status, 200)
    assert.equal((await view(bad)).brief!.note, 'chotto-i')
    const empty = await create('note')
    assert.equal((await call(`${w(empty)}/body`, 'POST', {})).status, 200)
    assert.match((await view(empty)).brief!.note!, /^note-\d{4}-\d{2}-\d{2}(-\d+)?$/)
    const kanji = await create('note')
    const k0 = await view(kanji)
    await call(`${w(kanji)}/title`, 'PUT', { orig: k0.title, title: '将棋開発日誌' })
    assert.equal((await call(`${w(kanji)}/body`, 'POST', {})).status, 200)
    assert.notEqual((await view(kanji)).brief!.note, (await view(empty)).brief!.note)
  })
  it('原稿の名前を変えられる。使っている名前と、改稿中の原稿は断る', async () => {
    const id = await create('note')
    await call(`${w(id)}/body`, 'POST', {})
    const other = (await view(id)).brief!.note!
    assert.equal((await call(`${w(id)}/slug`, 'PUT', { slug: 'renamed-draft' })).status, 200)
    assert.equal((await view(id)).brief!.note, 'renamed-draft')
    assert.ok(existsSync(join(s.priv, 'notes', 'renamed-draft', 'index.md')))
    assert.ok(!existsSync(join(s.priv, 'notes', other)))
    assert.equal((await call(`${w(id)}/slug`, 'PUT', { slug: 'Bad Name' })).status, 400)
    const r = await call(`${w(`note:${archive}`)}/actions/revise`, 'POST', {})
    assert.equal((await call(`${w(r.data.key)}/slug`, 'PUT', { slug: 'x-y-z' })).status, 400)
    await call(`${w(r.data.key)}/actions/cancel-revision`, 'POST', {})
  })
  it('企画で描いた聴衆を、読み手にできる。readers.yaml には persona の id だけを書く', async () => {
    const v = await view(`talk:${TALK_A}`)
    assert.ok(v.brief, 'TALK_A は前のテストで企画シートに紐づいている')
    const id = v.brief!.id
    await call(`${w(id)}/brief`, 'PATCH', { base: v.brief!.version, set: { fields: { personas: [{ name: '佐藤さん（新人）', who: '入社 2 年目', why: '上司に言われて', trouble: '', solve: '', action: '', pushback: '', approach: '' }] } } })
    const v2 = await view(id)
    assert.deepEqual(v2.audiencePersonas.map((p) => p.id), ['brief:佐藤さん'])
    const preset = v2.personas[0].id
    assert.equal((await call(`${w(id)}/readers`, 'PUT', { base: v2.readersVersion, readers: [{ persona: 'brief:佐藤さん', why: '上司に言われて' }, { persona: preset }] })).status, 200)
    const v3 = await view(id)
    assert.deepEqual(v3.readers.map((r) => r.id), ['brief:佐藤さん', preset])
    assert.equal(v3.readers[0].why, '上司に言われて')
    assert.equal((await call(`${w(id)}/readers`, 'PUT', { base: v3.readersVersion, readers: [{ persona: 'brief:だれか' }] })).status, 400)
  })
})

describe('置き場を開く', () => {
  it('どの作品も置き場を開ける。無い作品は 404', async () => {
    const id = await create('note')
    assert.equal((await call(`${w(id)}/reveal`, 'POST', {})).status, 200)
    assert.equal((await call(`${w(`note:${archive}`)}/reveal`, 'POST', {})).status, 200)
    assert.equal((await call(`${w('talk:no-such-talk')}/reveal`, 'POST', {})).status, 404)
  })
})

describe('画像', () => {
  it('ホームの表紙と、公開済みの記事の画像が読める', async () => {
    const home = (await call('/api/home')).data as HomeData
    const covers = home.items.filter((i) => i.kind === 'note' && i.cover).slice(0, 3)
    assert.ok(covers.length > 0)
    for (const i of covers) assert.equal((await fetch(s.url + i.cover!)).status, 200, i.cover!)
    const v = await view(covers[0].key)
    const src = v.archive!.html!.match(/src="([^"]+)"/)?.[1]
    if (src) assert.equal((await fetch(s.url + src)).status, 200, src)
  })
})

describe('購読とトークの追加', () => {
  it('ホームを購読すると、置き場が変わったときに知らせが届く', async () => {
    const ctl = new AbortController()
    const res = await fetch(`${s.url}/api/events?home=1`, { signal: ctl.signal })
    const reader = res.body!.getReader()
    let got = ''
    const reading = (async () => {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        got += new TextDecoder().decode(value)
      }
    })().catch(() => {})
    await call('/api/seeds', 'POST', { happening: '知らせのテスト' })
    await until(() => got.includes('event: home'), 5000)
    ctl.abort()
    await reading
  })

  it('置き場にトークを足すと、立て直さずにホームに並ぶ', async () => {
    const name = '2026_11_03_fixturec_足した発表C'
    cpSync(s.talkDirs.a, join(s.priv, 'talks', name), { recursive: true })
    const home = (await call('/api/home')).data as HomeData
    assert.ok(home.items.some((i) => i.talk?.slug === '2026-11-03-fixturec'), s.serverLog())
  })
})
