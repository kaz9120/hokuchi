// studio の振る舞いの固定 (作り直しの段 0。apps/studio/docs/rebuild.md 2 章)。
// 確かめるのは、ファイルの形 (作りの棚卸し 6.2) と振る舞いの規則 (同 6.3) で、実装の中身には頼らない。
// studio を一時ディレクトリの置き場で立て、client.ts を通して操作し、置き場のファイルを読んで確かめる。
//
//   bun run test:studio   (= node --experimental-strip-types --test apps/studio/test/studio.test.ts)
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import YAML from 'yaml'
import { client, type Client, type HomeEntry } from './client.ts'
import { repoRoot, startStudio, treeHash, until, type Studio } from './harness.ts'
// @ts-expect-error JS のモジュール (型が無い)
import { toPasteText } from '../../../tools/notes/src/paste.mjs'

const TALK_A = '2026-11-01-fixturea'
const TALK_B = '2026-11-02-fixtureb'
const DEVSGARDEN = '2026-09-29-devsgarden'
const KOMEKAIGI = '2026-10-31-komekaigi'
const archiveRoot = join(repoRoot, 'articles/note')
const archives = readdirSync(archiveRoot).filter((n) => /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(n) && existsSync(join(archiveRoot, n, 'index.md')))
const TRASHED = (what: string) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-(?:[a-z]+-)?${what.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
const headOf = (text: string) => text.replace(/\s+/g, '').slice(0, 20)

let s: Studio
let c: Client
let archiveHashBefore = ''
const yaml = (file: string) => YAML.parse(readFileSync(file, 'utf8'))
const text = (file: string) => readFileSync(file, 'utf8')
const briefFile = (id: string) => join(s.priv, 'works', id, 'brief.yaml')
const brief = (id: string) => yaml(briefFile(id))
/** Claude Code が企画シートを直すのと同じように、ファイルを直接書き換える */
const editBrief = (id: string, fn: (b: any) => void) => {
  const doc = YAML.parseDocument(text(briefFile(id)))
  const b = doc.toJS()
  fn(b)
  writeFileSync(briefFile(id), YAML.stringify(b, { lineWidth: 0 }))
}
const item = async (pred: (i: HomeEntry) => boolean) => (await c.home()).items.filter(pred)
const trashEntry = (what: string) => readdirSync(join(s.priv, 'trash')).find((n) => TRASHED(what).test(n))

before(async () => {
  archiveHashBefore = treeHash(archiveRoot)
  s = await startStudio()
  c = client(s.url)
})
after(async () => {
  await s?.stop()
})

describe('作品と企画シート', () => {
  it('作品を作ると、企画シートが決まった形で書かれ、一覧に下書きで出る', async () => {
    const id = await c.createWork('talk')
    assert.match(id, /^\d{4}-\d{2}-\d{2}-[a-z0-9]{4}$/)
    const b = brief(id)
    assert.equal(b.id, id)
    assert.equal(b.kind, 'talk')
    assert.equal(b.title, '')
    assert.equal(b.seedId, null)
    assert.deepEqual(b.fields, {})
    assert.deepEqual(b.gates, {})
    assert.deepEqual(b.candidates, {})
    assert.match(String(b.createdAt), /^\d{4}-\d{2}-\d{2}T/)
    const [it] = await item((i) => i.briefId === id)
    assert.equal(it.state, '下書き')
    assert.equal(it.kind, 'talk')
  })

  it('ネタから作ると、ネタの中身を企画に写し、ネタに作品を記録する', async () => {
    const seed = await c.addSeed('気になったこと', 'なぜなら')
    const seedFile = join(s.priv, 'seeds', `${seed.id}.yaml`)
    const sy = yaml(seedFile)
    assert.equal(sy.happening, '気になったこと')
    assert.equal(sy.why, 'なぜなら')
    assert.deepEqual(sy.workIds, [])
    const id = await c.createWork('note', seed.id)
    const b = brief(id)
    assert.equal(b.kind, 'note')
    assert.equal(b.seedId, seed.id)
    assert.equal(b.fields.happening, '気になったこと\nなぜそう感じたか: なぜなら')
    assert.deepEqual(yaml(seedFile).workIds, [id])
    assert.ok((await c.home()).seeds.some((x) => x.id === seed.id))
  })

  it('企画シートを直しても、知らない欄と変えてはいけない欄は残る', async () => {
    const id = await c.createWork('talk')
    editBrief(id, (b) => {
      b.memo = 'Claude のメモ'
      b.fields.extra = '手で足した欄'
    })
    const before = brief(id)
    const r = await c.patchBrief(id, { title: '題', fields: { oneLiner: '1 文' } })
    assert.ok(r.ok, JSON.stringify(r.data))
    const b = brief(id)
    assert.equal(b.title, '題')
    assert.equal(b.fields.oneLiner, '1 文')
    assert.equal(b.fields.extra, '手で足した欄')
    assert.equal(b.memo, 'Claude のメモ')
    assert.equal(b.id, id)
    assert.equal(b.kind, 'talk')
    assert.equal(b.createdAt, before.createdAt)
  })

  it('完成にすると finishedAt を書き、下書きに戻すと消す', async () => {
    const id = await c.createWork('note')
    assert.ok((await c.finish(id)).ok)
    assert.match(String(brief(id).finishedAt), /^\d{4}-\d{2}-\d{2}T/)
    assert.equal((await c.work(id)).state, '完成')
    assert.equal((await item((i) => i.briefId === id))[0].state, '完成')
    assert.ok((await c.unfinish(id)).ok)
    assert.ok(!('finishedAt' in brief(id)))
    assert.equal((await c.work(id)).state, '下書き')
  })
})

describe('状態の導出', () => {
  it('外のトークは、talk.tsx が public: true でも非公開の下書き', async () => {
    const list = await item((i) => i.talkSlug === TALK_A)
    assert.equal(list.length, 1)
    assert.equal(list[0].kind, 'talk')
    assert.equal(list[0].state, '下書き')
  })

  it('リポジトリのトークは、public: true なら公開、そうでなければ下書き', async () => {
    assert.equal((await item((i) => i.talkSlug === DEVSGARDEN))[0].state, '公開')
    assert.equal((await item((i) => i.talkSlug === KOMEKAIGI))[0].state, '下書き')
  })

  it('企画の無いアーカイブの記事は、公開', async () => {
    const notes = await item((i) => i.kind === 'note' && !!i.archiveDir && !i.briefId)
    assert.ok(notes.length > 0)
    assert.ok(notes.every((n) => n.state === '公開'))
    assert.equal(notes.length, archives.length)
  })

  it('企画シートをトークに紐づけると、一覧では 1 枚にまとまる', async () => {
    const id = await c.createWork('talk')
    editBrief(id, (b) => (b.talk = TALK_A))
    const list = await item((i) => i.talkSlug === TALK_A)
    assert.equal(list.length, 1)
    assert.equal(list[0].briefId, id)
  })

  it('公開したトークに紐づく作品は公開で、削除できない', async () => {
    const id = await c.createWork('talk')
    editBrief(id, (b) => (b.talk = DEVSGARDEN))
    assert.equal((await c.work(id)).state, '公開')
    assert.equal((await item((i) => i.talkSlug === DEVSGARDEN)).length, 1)
    assert.ok(!(await c.remove(id)).ok)
    assert.ok(existsSync(briefFile(id)))
  })

  it('完成した作品は削除できない', async () => {
    const id = await c.createWork('talk')
    await c.finish(id)
    assert.ok(!(await c.remove(id)).ok)
    assert.ok(existsSync(briefFile(id)))
  })
})

describe('削除', () => {
  it('下書きを削除すると、企画シートと外のトークをごみ箱に移し、ネタからも外す', async () => {
    const seed = await c.addSeed('消すネタ', '')
    const id = await c.createWork('talk', seed.id)
    editBrief(id, (b) => (b.talk = TALK_B))
    const name = basename(s.talkDirs.b)
    const r = await c.remove(id)
    assert.ok(r.ok, JSON.stringify(r.data))
    const entry = trashEntry(id)
    assert.ok(entry, `ごみ箱に ${id} がありません`)
    assert.ok(existsSync(join(s.priv, 'trash', entry, 'works', id, 'brief.yaml')))
    assert.ok(existsSync(join(s.priv, 'trash', entry, 'talks', name, 'talk.tsx')))
    assert.ok(!existsSync(join(s.priv, 'works', id)))
    assert.ok(!existsSync(s.talkDirs.b))
    assert.equal((await item((i) => i.briefId === id || i.talkSlug === TALK_B)).length, 0)
    assert.deepEqual(yaml(join(s.priv, 'seeds', `${seed.id}.yaml`)).workIds, [])
  })

  it('記事の下書きを削除すると、原稿もごみ箱に移す', async () => {
    const id = await c.createWork('note')
    assert.ok((await c.createDraft(id, 'test-delete-me')).ok)
    assert.ok((await c.remove(id)).ok)
    const entry = trashEntry(id)
    assert.ok(entry)
    assert.ok(existsSync(join(s.priv, 'trash', entry, 'notes', 'test-delete-me', 'index.md')))
    assert.ok(!existsSync(join(s.priv, 'notes', 'test-delete-me')))
  })

  it('リポジトリのトークに紐づく下書きを削除しても、トークには触らない', async () => {
    const dir = join(repoRoot, 'talks', readdirSync(join(repoRoot, 'talks')).find((n) => n.startsWith('2026_10_31_KomeKaigi'))!)
    const hash = treeHash(dir)
    const id = await c.createWork('talk')
    editBrief(id, (b) => (b.talk = KOMEKAIGI))
    assert.ok((await c.remove(id)).ok)
    assert.ok(existsSync(join(dir, 'talk.tsx')))
    assert.equal(treeHash(dir), hash)
    assert.equal((await item((i) => i.talkSlug === KOMEKAIGI)).length, 1)
  })
})

describe('発表の絵コンテ', () => {
  const board = () => text(join(s.talkDirs.a, 'storyboard.md'))

  it('話すことを直すと、そのコマの行だけが書き換わる', async () => {
    const before = board()
    const r = await c.saveTalkNotes(TALK_A, 'intro', 2, '新しい一行目\n\n新しい二行目')
    assert.ok(r.ok, JSON.stringify(r.data))
    assert.equal(board(), before.replace('   > 二つ目の話すことです。\n   > 二行目です。', '   > 新しい一行目\n   > 新しい二行目'))
    const t = await c.talk(TALK_A)
    assert.equal(t.board.scenes.find((x: any) => x.id === 'intro').notes[1], '新しい一行目\n新しい二行目')
  })

  it('シーンの情報を直す。無いキーは、情報の並びの最後に足す', async () => {
    assert.ok((await c.saveSceneMeta(TALK_A, 'body', '伝えること', '直した要点')).ok)
    assert.ok((await c.saveSceneMeta(TALK_A, 'body', '粗密', '中（1 分 20 秒）')).ok)
    const md = board()
    assert.ok(!md.includes('伝えること: 本題の要点'))
    assert.ok(md.includes('### body — 本題\n\n伝えること: 直した要点\n粗密: 中（1 分 20 秒）\n\n1. 見出し「本題」'))
  })

  it('シーンは章の中でだけ動かせる', async () => {
    assert.ok((await c.moveScene(TALK_A, 'body', -1)).ok)
    let md = board()
    assert.ok(md.indexOf('### body') < md.indexOf('### intro'))
    md = board()
    assert.ok(!(await c.moveScene(TALK_A, 'outro', -1)).ok)
    assert.equal(board(), md)
    assert.ok((await c.moveScene(TALK_A, 'body', 1)).ok)
    md = board()
    assert.ok(md.indexOf('### intro') < md.indexOf('### body'))
  })

  it('トークの場所は、外なら絶対パス、リポジトリの中なら相対パスで見せる', async () => {
    assert.equal((await c.talk(TALK_A)).dir, s.talkDirs.a)
    assert.match((await c.talk(DEVSGARDEN)).dir, /^talks\/2026_09_29_DevsGarden/)
  })
})

describe('指摘のスレッド', () => {
  const file = () => join(s.talkDirs.a, 'feedback.yaml')
  const threads = () => yaml(file()).threads as any[]

  it('指摘を書くと、頭書きつきの feedback.yaml にスレッドが入る', async () => {
    const r = await c.openTalkThread(TALK_A, 'intro', 1, 'コマへの指摘')
    assert.ok(r.ok)
    assert.ok(text(file()).startsWith('# 指摘のスレッド (ADR-0040)'))
    const [t] = threads()
    assert.deepEqual({ ...t, at: undefined }, { id: 't001', scene: 'intro', state: 1, by: '話者', text: 'コマへの指摘', at: undefined, ball: 'Claude' })
    assert.match(t.at, /^\d{4}-\d{2}-\d{2}T/)
    assert.ok((await c.openTalkThread(TALK_A, 'body', null, 'シーンへの指摘')).ok)
    const t2 = threads()[1]
    assert.equal(t2.id, 't002')
    assert.ok(!('state' in t2))
  })

  it('返信・閉じる・開き直すで、番と終わり方が決まる', async () => {
    assert.ok((await c.threadOp({ talk: TALK_A }, 't001', 'reply', { text: '返信' })).ok)
    let t = threads()[0]
    assert.equal(t.ball, 'Claude')
    assert.equal(t.replies[0].by, '話者')
    assert.equal(t.replies[0].text, '返信')
    assert.ok((await c.threadOp({ talk: TALK_A }, 't001', 'close', { how: 'そのままにした' })).ok)
    t = threads()[0]
    assert.equal(t.ball, 'none')
    assert.equal(t.closed, 'そのままにした')
    assert.ok((await c.threadOp({ talk: TALK_A }, 't001', 'reopen')).ok)
    t = threads()[0]
    assert.equal(t.ball, 'Claude')
    assert.ok(!('closed' in t))
    assert.ok((await c.threadOp({ talk: TALK_A }, 't002', 'close')).ok)
    assert.equal(threads()[1].closed, '直した')
  })

  it('Claude が手で書いたコメントと並びを保つ', async () => {
    const hand = ['  - id: t010', '    scene: intro', '    by: 話者', '    text: 手で足した件', '    ball: 話者', '    replies:', '      - by: Claude', '        thinking: 考えた', '        change: 変えた', ''].join('\n')
    writeFileSync(file(), text(file()).replace('threads:', '# Claude のメモ\nthreads:') + hand)
    const r = await c.openTalkThread(TALK_A, 'outro', 1, '次の指摘')
    assert.ok(r.ok)
    assert.ok(text(file()).includes('# Claude のメモ'))
    assert.deepEqual(threads().map((x) => x.id), ['t001', 't002', 't010', 't011'])
    assert.deepEqual(threads()[2].replies, [{ by: 'Claude', thinking: '考えた', change: '変えた' }])
  })
})

describe('聴衆役の読み (発表)', () => {
  const reads = (n: number) => join(s.talkDirs.a, 'reads', `${String(n).padStart(3, '0')}.yaml`)
  const threads = () => yaml(join(s.talkDirs.a, 'feedback.yaml')).threads as any[]

  it('読んでもらうと、読みの結果とスレッドが決まった形で残る', async () => {
    writeFileSync(join(s.talkDirs.a, 'readers.yaml'), 'readers:\n  - persona: mid-backend\n    why: 理由\n  - persona: stranger\n')
    const before = threads().length
    assert.ok((await c.readTalk(TALK_A)).ok)
    await until(() => existsSync(reads(1)))
    await until(async () => (await c.talk(TALK_A)).reading === null)
    const r = yaml(reads(1))
    assert.equal(r.id, 1)
    assert.equal(r.scenes, 3)
    assert.equal(r.states, 4)
    assert.deepEqual(r.failed, [])
    assert.equal(r.readers.length, 2)
    const one = r.readers[0]
    assert.equal(one.persona, 'mid-backend')
    assert.deepEqual(Object.keys(one.scores), ['got', 'trouble', 'insight', 'follow', 'glance', 'convinced', 'action', 'recommend'])
    assert.equal(one.scores.got.score, 5)
    assert.equal(one.scores.trouble.score, 1)
    assert.equal(one.scores.insight.score, 3)
    assert.equal(one.notes.length, 12)
    assert.deepEqual(one.notes[0], { scene: 'intro', state: 1, kind: 'word', text: '分からない言葉がありました' })
    assert.deepEqual(one.notes[2], { scene: '*', state: 0, kind: 'unconvinced', text: '存在しないシーンへの感想' })
    assert.deepEqual(one.notes[3], { scene: 'intro', state: 0, kind: 'jump', text: '存在しないコマへの感想' })
    const added = threads().slice(before)
    assert.equal(added.length, 24)
    assert.ok(added.every((t) => t.by === '聴衆役' && t.read === 1 && t.name))
    const good = added.filter((t) => t.kind === 'good')
    assert.ok(good.length > 0 && good.every((t) => t.ball === 'none' && t.closed === '良かった点'))
    assert.ok(added.filter((t) => t.kind !== 'good').every((t) => t.ball === 'Claude'))
    // 聴衆役は、リポジトリの文脈を拾わない場所で起動する
    const calls = text(s.claudeLog).trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.prompt.includes('登壇を聞きに来ています'))
    assert.ok(calls.length >= 2 && calls.every((x) => !x.cwd.startsWith(repoRoot)))
    assert.ok(calls.every((x) => x.args.includes('-p')))
  })

  it('もう一度読むと、前の読みの Claude の番の感想は閉じ、あなたの番の感想は残す', async () => {
    const file = join(s.talkDirs.a, 'feedback.yaml')
    const doc = YAML.parseDocument(text(file))
    const seq = doc.get('threads') as any
    const target = seq.items.find((t: any) => t.get('by') === '聴衆役' && t.get('ball') === 'Claude')
    const keep = target.get('id')
    target.set('ball', '話者')
    writeFileSync(file, doc.toString({ lineWidth: 0 }))
    const mine = threads().filter((t) => t.by === '話者').map((t) => JSON.stringify(t))
    assert.ok((await c.readTalk(TALK_A)).ok)
    await until(() => existsSync(reads(2)))
    await until(async () => (await c.talk(TALK_A)).reading === null)
    const all = threads()
    const first = all.filter((t) => t.by === '聴衆役' && t.read === 1)
    assert.equal(first.find((t) => t.id === keep).ball, '話者')
    assert.ok(first.filter((t) => t.id !== keep && t.kind !== 'good').every((t) => t.ball === 'none' && t.closed === '読み直した'))
    assert.ok(all.filter((t) => t.read === 2 && t.kind !== 'good').every((t) => t.ball === 'Claude'))
    assert.deepEqual(all.filter((t) => t.by === '話者').map((t) => JSON.stringify(t)), mine)
    assert.equal(yaml(reads(2)).id, 2)
  })
})

describe('記事の原稿', () => {
  const slug = 'test-draft'
  let id = ''
  const file = () => join(s.priv, 'notes', slug, 'index.md')
  const draft = async () => {
    const r = await c.draft(slug)
    assert.ok(r.ok, JSON.stringify(r.data))
    return r.data
  }
  const fm = () => text(file()).match(/^---\n[\s\S]*?\n---\n/)![0]
  const body = () => text(file()).slice(fm().length)
  const threads = () => yaml(join(s.priv, 'notes', slug, 'feedback.yaml')).threads as any[]

  it('原稿は slug を確かめてから作り、企画シートに紐づける', async () => {
    id = await c.createWork('note')
    await c.patchBrief(id, { title: '記事の題' })
    assert.ok(!(await c.createDraft(id, 'Bad Slug')).ok)
    assert.ok(!(await c.createDraft(id, archives[0].slice(11))).ok)
    assert.ok((await c.createDraft(id, slug)).ok)
    assert.equal(text(file()), '---\ntitle: 記事の題\n---\n\n')
    assert.equal(brief(id).note, slug)
    assert.ok(!(await c.createDraft(id, 'another')).ok)
  })

  it('段落を数える。コードの囲みは 1 つ、見出し・画像・埋め込みも 1 つ', async () => {
    const md = [
      '---',
      'title: 記事の題',
      'hashtags:',
      '  - a',
      '---',
      '',
      '冒頭の段落です。',
      '二行目も同じ段落です。',
      '',
      '## 見出し',
      '',
      '```js',
      'const a = 1',
      '',
      'const b = 2',
      '```',
      '',
      '![画像の説明](assets/x.png)',
      '',
      'https://example.com/embed',
      '',
      '- 箇条 1',
      '- 箇条 2',
      '',
      '> 引用です',
      '',
      '<!-- コメント -->',
      '',
      '最後の 段落 です 。とても長い書き出しにして二十字を超えるようにします。',
      '',
    ].join('\n')
    writeFileSync(file(), md)
    const d = await draft()
    assert.deepEqual(
      d.blocks.map((b: any) => [b.n, b.kind]),
      [[1, 'prose'], [2, 'heading'], [3, 'code'], [4, 'image'], [5, 'embed'], [6, 'list'], [7, 'quote'], [8, 'comment'], [9, 'prose']],
    )
    assert.equal(d.blocks[0].text, '冒頭の段落です。\n二行目も同じ段落です。')
    assert.equal(d.blocks[2].text, '```js\nconst a = 1\n\nconst b = 2\n```')
    for (const b of d.blocks) assert.equal(b.head, headOf(b.text))
    assert.equal(d.title, '記事の題')
    assert.deepEqual(d.tags, ['a'])
  })

  it('段落を直す。読んだときと違えば保存しない。空にすると消す', async () => {
    const before = text(file())
    const r = await c.saveBlock(slug, 1, '違う段落', '上書き')
    assert.equal(r.status, 409)
    assert.equal(text(file()), before)
    const f = fm()
    const d = await draft()
    assert.ok((await c.saveBlock(slug, 1, d.blocks[0].text, '直した冒頭。')).ok)
    assert.equal(fm(), f)
    assert.ok(body().startsWith('\n直した冒頭。\n\n## 見出し'))
    assert.ok((await c.saveBlock(slug, 8, '<!-- コメント -->', '')).ok)
    assert.ok(body().includes('> 引用です\n\n最後の'))
    assert.equal((await draft()).blocks.length, 8)
  })

  it('末尾に段落を足す', async () => {
    assert.ok((await c.append(slug, '足した段落')).ok)
    assert.ok(text(file()).endsWith('\n\n足した段落\n'))
  })

  it('指摘は、段落の番号と書き出しで持ち、番号がずれたら書き出しで付け直す', async () => {
    let d = await draft()
    const list = d.blocks.find((b: any) => b.kind === 'list')
    const r = await c.openNoteThread(slug, list.n, '箇条への指摘')
    assert.ok(r.ok)
    const feedback = join(s.priv, 'notes', slug, 'feedback.yaml')
    assert.ok(text(feedback).startsWith('# 指摘のスレッド (ADR-0040・ADR-0046)'))
    const tid = threads()[0].id
    assert.deepEqual({ para: threads()[0].para, head: threads()[0].head, by: threads()[0].by, ball: threads()[0].ball }, { para: list.n, head: list.head, by: '話者', ball: 'Claude' })
    assert.ok((await c.openNoteThread(slug, '*', '記事全体への指摘')).ok)
    const whole = threads()[1]
    assert.equal(whole.para, '*')
    assert.ok(!('head' in whole))

    // Claude Code が冒頭に段落を足した → 番号は 1 つずれ、書き出しは同じ
    writeFileSync(file(), fm() + '\n新しい冒頭の段落。\n' + body())
    d = await draft()
    const moved = threads().find((t) => t.id === tid)
    assert.equal(moved.para, list.n + 1)
    assert.equal(moved.head, list.head)

    // 画面でその段落を直した → 新しい書き出しで持ち直す
    const cur = d.blocks.find((b: any) => b.kind === 'list')
    assert.ok((await c.saveBlock(slug, cur.n, cur.text, '- 変えた箇条')).ok)
    assert.deepEqual([threads().find((t) => t.id === tid).para, threads().find((t) => t.id === tid).head], [cur.n, headOf('- 変えた箇条')])

    // 画面でその段落を消した → 記事全体への指摘に寄せる
    assert.ok((await c.saveBlock(slug, cur.n, '- 変えた箇条', '')).ok)
    const gone = threads().find((t) => t.id === tid)
    assert.equal(gone.para, '*')
    assert.ok(!('head' in gone))

    // 付け直せないほど変わった → 記事全体へ
    d = await draft()
    const quote = d.blocks.find((b: any) => b.kind === 'quote')
    await c.openNoteThread(slug, quote.n, '引用への指摘')
    const qid = threads().at(-1).id
    writeFileSync(file(), text(file()).replace('> 引用です', '> まったく別の文に変えた'))
    await draft()
    assert.equal(threads().find((t) => t.id === qid).para, '*')
  })

  it('構成は決まった形で保存し、先頭はいつも「冒頭」', async () => {
    const r = await c.saveOutline(slug, [
      { title: '冒頭', point: 'フック', grain: '粗', budget: 60 },
      { title: '見出し', point: 'p', grain: '中', budget: 12.6 },
      { title: ' 次 ', point: '', grain: '密', budget: -5 },
    ])
    assert.ok(r.ok)
    const of = join(s.priv, 'notes', slug, 'outline.yaml')
    assert.ok(text(of).startsWith('# 記事の構成'))
    assert.deepEqual(yaml(of).sections, [
      { title: '冒頭', point: 'フック', grain: '粗', budget: 60 },
      { title: '見出し', point: 'p', grain: '粗', budget: 13 },
      { title: '次', point: '', grain: '密', budget: 0 },
    ])
    writeFileSync(of, 'sections:\n  - title: 手で書いた見出し\n    grain: 密\n    budget: 300\n')
    const d = await draft()
    assert.equal(d.outline.exists, true)
    assert.deepEqual(d.outline.sections.map((x: any) => x.title), ['冒頭', '手で書いた見出し'])
  })

  it('front matter を直し、タイトルは企画シートにも揃える。本文には触らない', async () => {
    const b = body()
    assert.ok((await c.setMeta(slug, { tags: ['#タグ1', ' タグ2 ', ''] })).ok)
    assert.ok((await c.setMeta(slug, { eyecatch: 'assets/x.png' })).ok)
    let meta = YAML.parse(fm().slice(4, -4))
    assert.deepEqual(meta.hashtags, ['タグ1', 'タグ2'])
    assert.equal(meta.eyecatch, 'assets/x.png')
    assert.ok((await c.setMeta(slug, { eyecatch: null })).ok)
    assert.ok((await c.setMeta(slug, { title: '新しい題' })).ok)
    meta = YAML.parse(fm().slice(4, -4))
    assert.ok(!('eyecatch' in meta))
    assert.equal(meta.title, '新しい題')
    assert.equal(brief(id).title, '新しい題')
    assert.equal(body(), b)
  })

  it('note に貼る本文は、tools/notes の paste と同じ', async () => {
    assert.equal((await c.paste(slug)).text, toPasteText(text(file())).text)
  })

  it('lint の結果を、段落か記事全体に寄せる', async () => {
    const d = await draft()
    assert.ok(Array.isArray(d.lint))
    const ns = new Set(d.blocks.map((b: any) => b.n))
    for (const f of d.lint) {
      assert.ok(['error', 'warn', 'info'].includes(f.severity))
      assert.equal(typeof f.message, 'string')
      assert.ok(f.n === null || ns.has(f.n))
    }
  })

  it('記事の読み手を選んで読んでもらう。感想は段落の番号と書き出しで残る', async () => {
    assert.ok((await c.saveNoteReaders(slug, [{ persona: 'stranger', why: '理由' }, { persona: 'fan-reader' }])).ok)
    const rf = join(s.priv, 'notes', slug, 'readers.yaml')
    assert.ok(text(rf).startsWith('# 聴衆役の読み手'))
    assert.deepEqual(yaml(rf).readers, [{ persona: 'stranger', why: '理由' }, { persona: 'fan-reader' }])
    const before = threads().length
    const d = await draft()
    assert.ok((await c.readNote(slug)).ok)
    const out = join(s.priv, 'notes', slug, 'reads', '001.yaml')
    await until(() => existsSync(out))
    await until(async () => (await draft()).reading === null)
    const r = yaml(out)
    assert.equal(r.id, 1)
    assert.equal(r.paragraphs, d.blocks.length)
    assert.equal(r.readers.length, 2)
    assert.ok('hook' in r.readers[0].scores && !('glance' in r.readers[0].scores))
    const first = d.blocks.filter((b: any) => b.kind !== 'comment')[0]
    assert.deepEqual(r.readers[0].notes, [
      { para: first.n, head: first.head, kind: 'jump', text: '最初の段落で話が飛んだ' },
      { para: '*', kind: 'good', text: '全体として良かった' },
      { para: '*', kind: 'word', text: '無い段落への感想' },
    ])
    const added = threads().slice(before)
    assert.equal(added.length, 6)
    assert.ok(added.every((t) => t.by === '聴衆役' && t.read === 1))
    assert.ok(added.filter((t) => t.kind === 'good').every((t) => t.closed === '良かった点' && t.ball === 'none'))
  })
})

describe('改稿', () => {
  const dir = archives.find((n) => existsSync(join(archiveRoot, n, 'assets'))) ?? archives[0]
  const slug = dir.slice(11)
  let id = ''
  const file = () => join(s.priv, 'notes', slug, 'index.md')

  it('改稿は、アーカイブを原稿に写して企画シートに紐づける。アーカイブは書き換えない', async () => {
    const hash = treeHash(join(archiveRoot, dir))
    const r = await c.revise(dir)
    assert.ok(r.ok, JSON.stringify(r.data))
    id = r.data.work
    assert.equal(r.data.slug, slug)
    const src = text(join(archiveRoot, dir, 'index.md'))
    const out = text(file())
    const meta = YAML.parse(out.match(/^---\n([\s\S]*?)\n---\n/)![1])
    assert.equal(meta.revises, dir)
    assert.equal(out.replace(/^---\n[\s\S]*?\n---\n/, ''), src.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\n?/, '\n'))
    if (existsSync(join(archiveRoot, dir, 'assets'))) assert.deepEqual(readdirSync(join(s.priv, 'notes', slug, 'assets')).sort(), readdirSync(join(archiveRoot, dir, 'assets')).sort())
    const b = brief(id)
    assert.equal(b.kind, 'note')
    assert.equal(b.note, slug)
    assert.equal((await c.work(id)).state, '改稿中')
    const list = await item((i) => i.archiveDir === dir)
    assert.equal(list.length, 1)
    assert.equal(list[0].briefId, id)
    assert.equal(list[0].state, '改稿中')
    assert.equal(treeHash(join(archiveRoot, dir)), hash)
  })

  it('同じ記事をもう一度改稿すると、いまの原稿をそのまま開く', async () => {
    assert.ok((await c.append(slug, '改稿で足した段落')).ok)
    const r = await c.revise(dir)
    assert.ok(r.ok)
    assert.equal(r.data.work, id)
    assert.ok(text(file()).includes('改稿で足した段落'))
  })

  it('改稿をやめると、原稿だけをごみ箱に移し、公開に戻る', async () => {
    assert.ok((await c.cancelRevision(id)).ok)
    const entry = trashEntry(slug)
    assert.ok(entry, 'ごみ箱に改稿の原稿がありません')
    assert.ok(text(join(s.priv, 'trash', entry, 'notes', slug, 'index.md')).includes('改稿で足した段落'))
    assert.ok(!existsSync(join(s.priv, 'notes', slug)))
    assert.equal(brief(id).note, slug)
    assert.equal((await c.work(id)).state, '公開')
    assert.ok(!(await c.cancelRevision(id)).ok)
  })
})

describe('Claude に頼む', () => {
  it('候補は企画シートに残す。無い依頼は断る', async () => {
    const id = await c.createWork('talk')
    const r = await c.ask(id, 'oneLiner.candidates')
    assert.ok(r.ok, JSON.stringify(r.data))
    assert.equal(r.data.items.length, 3)
    const cand = brief(id).candidates['oneLiner.candidates']
    assert.deepEqual(cand.items, [1, 2, 3].map((n) => ({ text: `案 ${n}`, note: `補足 ${n}` })))
    assert.match(cand.at, /^\d{4}-\d{2}-\d{2}T/)
    assert.ok(!(await c.ask(id, 'no-such-task')).ok)
  })

  it('記事のタイトルの案には、原稿を渡す', async () => {
    const id = (await item((i) => i.title === '新しい題'))[0].briefId!
    assert.ok((await c.ask(id, 'title.candidates')).ok)
    const last = JSON.parse(text(s.claudeLog).trim().split('\n').at(-1)!)
    assert.ok(last.prompt.includes('## 原稿'))
    assert.ok(last.prompt.includes('足した段落'))
  })
})

describe('リポジトリを書き換えない', () => {
  it('アーカイブとリポジトリのトーク・ペルソナは変わらない', () => {
    assert.equal(treeHash(archiveRoot), archiveHashBefore)
    assert.equal(execFileSync('git', ['-C', repoRoot, 'status', '--porcelain', '--', 'talks', 'articles', 'personas'], { encoding: 'utf8' }), '')
  })
})
