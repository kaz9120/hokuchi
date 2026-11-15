// 状態 × イベントの表と、Claude に渡す権限を固定するテスト。偽物の claude で動かす
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const root = mkdtempSync(join(tmpdir(), 'studio-test-'))
const log = join(root, 'claude.log')
process.env.HOKUCHI_PRIVATE = join(root, 'private')
process.env.HOKUCHI_CLAUDE_BIN = join(import.meta.dirname, 'fake-claude.mjs')
process.env.FAKE_LOG = log
process.env.HOKUCHI_ARCHIVE = join(root, 'archive')
process.env.HOKUCHI_TALKS = join(root, 'talks')
process.env.HOKUCHI_GIT_ROOT = join(root, 'repo')
// 時間切れを試すため、出力が 3 秒途切れたら止まったとみなす
process.env.HOKUCHI_STALL_LIMIT_MS = '3000'
process.env.HOKUCHI_SITE_BUILD = join(import.meta.dirname, 'fake-build.mjs')
process.env.HOKUCHI_WRANGLER = join(import.meta.dirname, 'fake-wrangler.mjs')
process.env.FAKE_WRANGLER_LOG = join(root, 'wrangler.log')
process.env.HOKUCHI_NOTES_CLI = join(import.meta.dirname, 'fake-sync.mjs')
mkdirSync(join(root, 'archive'), { recursive: true })
writeFileSync(join(root, 'archive', 'slugs.json'), '{}')
mkdirSync(join(root, 'private', 'works'), { recursive: true })

const { Studio, addNeta, listNeta, trashNeta, refuseAction, cleanLearning, lastHeadOf } = await import('../server/flow/service.ts')
const { changedSince, saveStamps } = await import('../server/store/stamps.ts')
const { claudeArgs } = await import('../server/claude/runner.ts')
const { writableOf } = await import('../server/claude/context.ts')
const { turnOf, choresOf, askOf, ADVANCES } = await import('../server/flow/steps.ts')
const { readWork, readChat, readProposals, appendRun, workFile, updateWork, writeProposals } = await import('../server/store/works.ts')
const { migrate } = await import('../server/store/migrate.ts')
const { PRIVATE } = await import('../server/infra/config.ts')

let studio: InstanceType<typeof Studio>
before(() => {
  studio = new Studio(() => {})
})
after(async () => {
  await studio.conductor.stopAll()
})

/** Claude の番でなくなるまで待つ */
async function idle(id: string, ms = 8000) {
  const end = Date.now() + ms
  while (studio.conductor.busy(id)) {
    if (Date.now() > end) throw new Error('Claude の番のまま終わりませんでした')
    await new Promise((r) => setTimeout(r, 50))
  }
}

test('Claude には、作品の置き場だけを書ける権限と、話者の設定を読まない引数を渡す', () => {
  const args = claudeArgs({ prompt: 'x', sessionId: null, system: 's', writable: ['/p/works/a/proposals.yaml', '/p/notes/a/'], denyWrite: ['/p/notes/a/outline.yaml'] }, 'sess')
  const at = (k: string) => args[args.indexOf(k) + 1]
  assert.equal(at('--setting-sources'), 'project')
  assert.equal(at('--permission-mode'), 'dontAsk')
  const allowed = args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools'))
  assert.ok(allowed.includes('Edit(//p/works/a/proposals.yaml)'))
  assert.ok(allowed.includes('Edit(//p/notes/a/**)'))
  assert.ok(!allowed.some((a) => a.startsWith('Write(')), 'Write(...) の規則は照合されないので使わない')
  assert.ok(!allowed.some((a) => a === 'Edit' || a === 'Write' || a === 'Bash'), '書き込みと Bash を丸ごと許していない')
  assert.ok(!allowed.some((a) => /git|deploy|wrangler/.test(a)))
  const denied = args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--append-system-prompt'))
  assert.ok(denied.includes('Edit(//p/notes/a/outline.yaml)'))
  assert.ok(denied.some((d) => d.includes('git commit')) && denied.some((d) => d.includes('deploy')))
  assert.equal(at('--session-id'), 'sess')
})

test('確定した値 (work.yaml) と材料は、Claude が書ける場所に入らない。構成は確定したあと書けない', () => {
  const work: any = { id: '2026-01-01-aaaa', kind: 'note', note: { slug: 'x' }, decided: {}, step: 'draft' }
  const { allow, deny } = writableOf(work, 'draft')
  assert.ok(allow.every((p) => !p.endsWith('work.yaml') && !p.endsWith('material.md')))
  assert.ok(deny.some((p) => p.endsWith('notes/x/outline.yaml')))
  assert.equal(writableOf({ ...work, step: 'outline' }, 'outline').deny.length, 0)
})

test('記事を始めると、話した文と画像が材料と会話に入り、Claude の返事のあとは話者の番になる', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const id = studio.start('note', '音声入力を再開した話を書きたい', [{ name: 'a.png', data: png }])
  assert.equal(studio.view(id).turn, 'claude')
  await idle(id)
  const v = studio.view(id)
  assert.equal(v.turn, 'you')
  assert.equal(v.ask, '伝えたいことを選ぶ')
  assert.equal(v.proposals.core?.[0].text, '道具が合うかは、仕事のやり方で変わる')
  assert.deepEqual(v.chat.map((c) => c.role), ['you', 'claude'])
  assert.ok(readFileSync(join(PRIVATE, 'works', id, 'material.md'), 'utf8').includes('音声入力を再開した話'))
  assert.ok(existsSync(join(PRIVATE, 'notes', id, 'assets')))
  const call = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1)!)
  assert.equal(call.cwd, join(import.meta.dirname, '../../..'), 'リポジトリで起こす (スキルを読ませる)')
  assert.ok(call.args.join(' ').includes('音声入力を再開した話'), '材料を全文で渡す')
})

test('伝えたいことを決めないと構成へ進めない。進むと値を確定し、新しいセッションで次を頼む', async () => {
  const id = studio.start('note', 'テスト')
  await idle(id)
  await assert.rejects(studio.press(id, 'decide-core', { decided: { core: '' } }), /伝えたいことを決めて/)
  const before = readWork(id).work.sessions?.core
  await studio.press(id, 'decide-core', { decided: { core: '道具が合うかは、仕事のやり方で変わる', reader: { who: 'エンジニア' } } })
  const w = readWork(id).work
  assert.equal(w.step, 'outline')
  assert.equal(w.decided.core, '道具が合うかは、仕事のやり方で変わる')
  await idle(id)
  const after = readWork(id).work.sessions?.outline
  assert.ok(after && after !== before, 'ステップごとにセッションを分ける')
})

test('Claude の作業中は進む操作も原稿の直しも受け付けない', async () => {
  const id = studio.start('note', 'テスト #待つ')
  await assert.rejects(studio.press(id, 'decide-core', { decided: { core: 'x' } }), /作業中/)
  assert.throws(() => studio.editProposals(id, { takeaway: 'x' }), /作業中/)
  studio.stop(id)
  await idle(id, 15000)
  const last = readChat(id).at(-1)!
  assert.match(last.text, /止めました/)
  assert.equal(studio.view(id).turn, 'you')
})

test('候補のファイルが YAML として読めなくなったら、実行の前の形に戻して知らせる', async () => {
  const id = studio.start('note', '最初')
  await idle(id)
  studio.say(id, { text: '直して #壊す' })
  await idle(id)
  assert.equal(readProposals(id).broken, false)
  assert.ok(readChat(id).some((c) => c.tone === 'error' && /戻しました/.test(c.text)))
})

test('途中で終わったら 1 回だけやり直し、それでもだめなら理由を出して話者の番にする', async () => {
  const id = studio.start('note', 'だめ #失敗')
  await idle(id)
  const chat = readChat(id)
  assert.ok(chat.some((c) => /もう一度だけ試します/.test(c.text)))
  assert.equal(chat.at(-1)!.tone, 'error')
  assert.equal(studio.view(id).turn, 'you')
})

test('話者が直した所は次の実行に添え、返事が終わったら消す', async () => {
  const id = studio.start('note', '最初')
  await idle(id)
  studio.outsideChange(id, 'notes/x/index.md')
  assert.equal(readWork(id).work.changes?.length, 1)
  studio.say(id, { text: '続けて' })
  await idle(id)
  const call = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1)!)
  assert.ok(call.args.join(' ').includes('外で変わった: notes/x/index.md'))
  assert.equal(readWork(id).work.changes?.length, 0)
})

test('studio が止まって終わりの記録が無い実行は、起動時に中断したことにする', () => {
  const id = studio.start('note', 'x')
  appendRun(id, { id: 'zz', type: 'start', step: 'core', what: 'claude' })
  studio.recover()
  assert.ok(readChat(id).some((c) => /中断しました/.test(c.text)))
})

test('番: 出した記録があっても片付けが残る間は話者の番。済めば出した', () => {
  const base: any = { kind: 'note', step: 'publish', decided: {}, shipped: { at: 'x', by: 'note' } }
  assert.deepEqual(choresOf({ ...base, learned: false }, {}, true), ['学びの案を出してもらう', '変更を記録する'])
  assert.equal(turnOf({ ...base }, false, ['変更を記録する']), 'you')
  assert.equal(turnOf({ ...base, learned: true }, false, []), 'shipped')
  assert.equal(turnOf({ ...base, revising: true }, false, []), 'you')
  assert.equal(turnOf({ ...base }, true, []), 'claude')
  assert.equal(turnOf({ ...base, dropped: { at: 'x' } }, false, []), 'dropped')
})

test('社内の発表は、発表する日を過ぎても勝手に出したにせず、聞く', () => {
  const w: any = { kind: 'talk', step: 'present', decided: { scope: 'internal', event: { date: '2020-01-01' } } }
  assert.equal(askOf(w, {}, 'you', []), '発表したか、日を直すかを決める')
})

test('進む操作の表は、記事と発表で全ステップをつなぐ', () => {
  for (const kind of ['note', 'talk'] as const) {
    const steps = ADVANCES[kind]
    for (let i = 1; i < steps.length; i++) assert.equal(steps[i].from, steps[i - 1].to)
  }
})

test('ネタは neta/ に Markdown で入り、作品にしたら一覧から消える', () => {
  const file = addNeta('発表資料を AI にも届ける')
  assert.ok(listNeta().some((n) => n.file === file))
  const id = studio.start('note', '発表資料を AI にも届ける', [], file)
  assert.ok(!listNeta().some((n) => n.file === file))
  assert.equal(readWork(id).work.seed, file)
  const other = addNeta('別のネタ')
  trashNeta(other)
  assert.ok(!listNeta().some((n) => n.file === other))
})

test('旧 studio の企画シートを作品に写す。元のファイルは残す', () => {
  const id = '2026-10-19-test'
  mkdirSync(join(PRIVATE, 'works', id), { recursive: true })
  writeFileSync(join(PRIVATE, 'works', id, 'brief.yaml'), 'id: 2026-10-19-test\nkind: talk\ntitle: 社内の発表\ncreatedAt: 2026-10-19T00:00:00Z\nfields:\n  event: 社内勉強会\n  date: 2026-10-19\n  duration: 5分\n  publish: 社内向け\n  oneLiner: 伝えたいこと\ngates: {}\n')
  assert.ok(migrate().includes(id))
  const w = readWork(id).work
  assert.equal(w.decided.scope, 'internal')
  assert.equal(w.decided.event?.minutes, 5)
  assert.equal(w.decided.core, '伝えたいこと')
  assert.ok(existsSync(join(PRIVATE, 'works', id, 'brief.yaml')))
  assert.ok(existsSync(workFile(id)))
  assert.deepEqual(migrate(), [], '2 回目は何もしない')
})

test('学びの案の先頭の印は落とし、同じ作品の 2 行目からは (同) にする', () => {
  assert.equal(cleanLearning('- (同) 体感は言い切らない'), '体感は言い切らない')
  assert.equal(cleanLearning('(2026-11-15「題」) 数字は画像の表記のまま\n書く'), '数字は画像の表記のまま 書く')
  const file = '- (2026-11-15「題」) 一つ目\n- (同) 二つ目\n'
  assert.equal(lastHeadOf(file), '(2026-11-15「題」)')
  assert.equal(lastHeadOf('- (2026-11-08「別」) x\n'), '(2026-11-08「別」)')
})

test('状態 × イベントの表の「起きない」マスは、サーバが断る', () => {
  const note: any = { kind: 'note', step: 'draft', decided: {} }
  assert.match(refuseAction(note, 'ship-note', false, {})!, /できません/)
  assert.match(refuseAction(note, 'decide-outline', true, {})!, /作業中/)
  assert.equal(refuseAction({ ...note, step: 'publish' }, 'ship-note', false, {}), null)
  assert.match(refuseAction({ ...note, shipped: { at: 'x', by: 'note' } }, 'record', false, {})!, /できません/, '学びが済むまで記録できない')
  assert.equal(refuseAction({ ...note, shipped: { at: 'x', by: 'note' }, learned: true }, 'record', false, {}), null)
  const talk: any = { kind: 'talk', step: 'present', decided: { scope: 'public' }, shipped: { at: 'x', by: 'site' } }
  assert.match(refuseAction(talk, 'set-scope', false, {})!, /できません/, 'サイトに出した発表は社内に戻せない')
  assert.match(refuseAction({ ...talk, step: 'slides', shipped: null }, 'presented', false, {})!, /できません/)
})

test('前の実行が止まったら、終わったら送る文は送らずに残す', async () => {
  const id = studio.start('note', 'だめ #失敗')
  studio.say(id, { text: 'あとで送る文' })
  await idle(id)
  const v = studio.view(id)
  assert.equal(v.live.held, true)
  assert.match(v.live.queuedText ?? '', /あとで送る文/)
  assert.ok(!readChat(id).some((c) => c.role === 'you' && c.text === 'あとで送る文'), 'まだ会話に書いていない')
  await studio.press(id, 'drop-held')
  assert.equal(studio.view(id).live.queuedText, null)
})

test('画面を閉じていた間に外で直したファイルも、次の実行に添える', async () => {
  const id = studio.start('note', '最初')
  await idle(id)
  const w = readWork(id).work
  saveStamps(w)
  writeFileSync(join(PRIVATE, 'notes', w.note!.slug, 'index.md'), '---\ntitle: x\n---\n\n外で書いた\n')
  assert.deepEqual(changedSince(w), [`${w.note!.slug}/index.md`])
  studio.say(id, { text: '続けて' })
  await idle(id)
  const call = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1)!)
  assert.match(call.prompt, /外で変わった: .*index\.md/)
})

test('続きのセッションでは材料を作品の文脈に入れない (キャッシュを効かせる)', async () => {
  const id = studio.start('note', '最初の話はとても大事な材料')
  await idle(id)
  studio.say(id, { text: '次の話' })
  await idle(id)
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const last = calls.at(-1)
  const sys = last.args[last.args.indexOf('--append-system-prompt') + 1]
  assert.ok(last.args.includes('--resume'))
  assert.ok(!sys.includes('最初の話はとても大事な材料'))
})

test('公開した記事の URL を貼ると、名前を足して取り込み、原稿を作品に移して学びを頼む。待たせた文は作品のフォルダに残る', async () => {
  const id = studio.start('note', '取り込みを試す記事')
  await idle(id)
  updateWork(id, (w) => {
    w.step = 'publish'
    w.note = { slug: 'ship-test' }
  })
  mkdirSync(join(PRIVATE, 'notes', 'ship-test'), { recursive: true })
  writeFileSync(join(PRIVATE, 'notes', 'ship-test', 'index.md'), '---\ntitle: 原稿の題\n---\n\n本文\n')
  await assert.rejects(() => Promise.resolve(studio.press(id, 'ship-note', { url: 'https://example.com/x' })), /note の記事の URL/)
  await studio.press(id, 'ship-note', { url: 'https://note.com/someone/n/nabc123' })
  const end = Date.now() + 8000
  while (!readWork(id).work.shipped && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  const { work } = readWork(id)
  assert.equal(work.shipped?.ref, '2026-11-15-ship-test')
  assert.equal(work.note?.key, 'nabc123')
  assert.equal(work.title, '公開した題')
  assert.equal(JSON.parse(readFileSync(join(root, 'archive', 'slugs.json'), 'utf8')).nabc123, 'ship-test')
  assert.ok(existsSync(join(PRIVATE, 'works', id, 'made', 'index.md')), '原稿は作品の made/ に移る')
  assert.ok(!existsSync(join(PRIVATE, 'notes', 'ship-test')))
  assert.ok(work.touched?.includes('articles/note/2026-11-15-ship-test'))
  // 学びを頼んでいる間に話した文は、作品のフォルダに残り、起動し直すと送らずに残した文として戻る
  studio.say(id, { text: '取り込み中に話す' })
  assert.match(readFileSync(join(PRIVATE, 'works', id, 'queue.json'), 'utf8'), /取り込み中に話す/)
  const again = new Studio(() => {})
  again.recover()
  assert.equal(again.view(id).live.held, true)
  assert.match(again.view(id).live.queuedText ?? '', /取り込み中に話す/)
  await idle(id)
})

/** 発表の作品を、トークのフォルダつきで指定のステップに置く */
function talkAt(step: 'storyboard' | 'slides' | 'present', scope: 'public' | 'internal', text = '発表を試す') {
  const id = studio.start('talk', text)
  return idle(id).then(() => {
    const dir = `2026_12_01_t${id.slice(-4)}_試す`
    const base = scope === 'public' ? join(root, 'talks') : join(PRIVATE, 'talks')
    mkdirSync(join(base, dir), { recursive: true })
    writeFileSync(join(base, dir, 'talk.tsx'), `export default { public: ${scope === 'public'} }\n`)
    writeFileSync(join(base, dir, 'storyboard.md'), '# 試す\n')
    updateWork(id, (w) => {
      w.step = step
      w.talk = { dir }
      w.decided.scope = scope
    })
    return { id, dir }
  })
}

test('社内の発表を公開にすると、トークのフォルダを公開の置き場に移し talk.tsx を公開にする。サイトに出した発表は社内に戻せない', async () => {
  const { id, dir } = await talkAt('storyboard', 'internal')
  await studio.press(id, 'set-scope', { scope: 'public' })
  assert.equal(readWork(id).work.decided.scope, 'public')
  assert.ok(!existsSync(join(PRIVATE, 'talks', dir)))
  assert.match(readFileSync(join(root, 'talks', dir, 'talk.tsx'), 'utf8'), /public: true/)
  updateWork(id, (w) => (w.shipped = { at: '2026-12-01', by: 'site' }))
  await assert.rejects(() => Promise.resolve(studio.press(id, 'set-scope', { scope: 'internal' })), /社内に戻せません|できません/)
})

test('社内の発表は「発表した」で出したになり、学びを頼む。学びが済むと、作品が変えたファイルだけを記録する', async () => {
  const repo = join(root, 'repo')
  mkdirSync(join(repo, 'articles/note'), { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo })
  writeFileSync(join(repo, 'articles/note/mine.md'), 'この作品の変更\n')
  writeFileSync(join(repo, 'articles/note/other.md'), 'ほかの作品の変更\n')
  const { id } = await talkAt('present', 'internal')
  await studio.press(id, 'presented')
  await idle(id)
  assert.equal(readWork(id).work.shipped?.by, 'presented')
  updateWork(id, (w) => (w.learned = false))
  await assert.rejects(() => Promise.resolve(studio.press(id, 'record')), /学びの案を選び終えて|できません/)
  updateWork(id, (w) => {
    w.learned = true
    w.touched = ['articles/note/mine.md']
  })
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't'
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@example.com'
  await studio.press(id, 'record')
  const end = Date.now() + 8000
  while (!readWork(id).work.recorded && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  assert.equal(readWork(id).work.recorded, true)
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })
  assert.ok(!status.includes('mine.md') && status.includes('other.md'), 'ほかの作品の変更は記録しない')
  assert.equal(studio.view(id).turn, 'shipped')
})

test('サイトに出した発表を手直しすると、出したあとでも話者の番になる', async () => {
  const { id } = await talkAt('present', 'public')
  updateWork(id, (w) => {
    w.presented = { at: '2026-12-01' }
    w.shipped = { at: '2026-12-01', by: 'site' }
    w.learned = true
    w.recorded = true
  })
  assert.equal(studio.view(id).turn, 'shipped')
  await studio.press(id, 'rework')
  assert.equal(studio.view(id).turn, 'you')
  assert.equal(studio.view(id).ask, '変わった見た目を確かめて、サイトに出す')
})

test('サイトに出すと、見た目が変わったら止まって件数を残し、「この変化で出す」で受け入れて公開する', async () => {
  const { id } = await talkAt('present', 'public')
  updateWork(id, (w) => (w.presented = { at: '2026-12-01' }))
  const wait = async (ok: () => boolean) => {
    const end = Date.now() + 8000
    while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  }
  await studio.press(id, 'deploy', { accept: false })
  await wait(() => !!readWork(id).work.deployBlocked)
  assert.equal(readWork(id).work.deployBlocked, 2)
  assert.ok(!existsSync(join(root, 'wrangler.log')), '止まったら公開しない')
  assert.notEqual(readChat(id).at(-1)?.tone, 'error', '止まったのは失敗ではない')
  await studio.press(id, 'deploy', { accept: true })
  await wait(() => readWork(id).work.shipped?.by === 'site')
  assert.equal(readWork(id).work.shipped?.by, 'site')
  assert.equal(readWork(id).work.deployBlocked, 0)
  assert.equal(readFileSync(join(root, 'wrangler.log'), 'utf8').trim(), 'deploy')
})

test('公開した記事を改稿すると、アーカイブを原稿の置き場に写して原稿のステップに戻る', async () => {
  const id = studio.start('note', '改稿を試す')
  await idle(id)
  const dir = join(root, 'archive', '2026-11-15-revise-test')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.md'), '---\ntitle: 改稿する題\nnote_url: https://note.com/someone/n/nrev1\n---\n\n公開した本文\n')
  updateWork(id, (w) => {
    w.step = 'publish'
    w.note = { slug: 'revise-test', key: 'nrev1' }
    w.shipped = { at: '2026-11-15', by: 'note', ref: '2026-11-15-revise-test' }
    w.learned = true
    w.recorded = true
  })
  await studio.press(id, 'revise')
  const { work } = readWork(id)
  assert.equal(work.revising, true)
  assert.equal(work.step, 'draft')
  assert.equal(work.recorded, false)
  assert.match(readFileSync(join(PRIVATE, 'notes', work.note!.slug, 'index.md'), 'utf8'), /公開した本文/)
  assert.equal(studio.view(id).turn, 'you')
})

test('「止めて送る」は走っている実行を止め、待たせずに新しい文を送る', async () => {
  const id = studio.start('note', '長い作業 #待つ')
  await new Promise((r) => setTimeout(r, 300))
  studio.say(id, { text: '割り込む文', mode: 'interrupt' })
  await idle(id, 15000)
  const chat = readChat(id)
  assert.ok(chat.some((c) => c.role === 'you' && c.text === '割り込む文'))
  assert.equal(studio.view(id).live.queuedText ?? null, null)
})

test('同時に走らせるのは 2 本まで。3 本目は順番待ちになり、前が終わると走る', async () => {
  const ids = [studio.start('note', 'ひとつめ #待つ'), studio.start('note', 'ふたつめ #待つ'), studio.start('note', 'みっつめ')]
  assert.equal(studio.view(ids[2]).live.state, 'queued')
  studio.stop(ids[0])
  const end = Date.now() + 8000
  while (studio.view(ids[2]).live.state === 'queued' && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  assert.notEqual(studio.view(ids[2]).live.state, 'queued')
  studio.stop(ids[1])
  for (const id of ids) await idle(id, 15000)
})

test('絵コンテとスライドは、時間切れなら同じセッションで続きを頼む', async () => {
  const { id } = await talkAt('storyboard', 'internal')
  studio.say(id, { text: '長く考える #待つ' })
  await idle(id, 20000)
  const chat = readChat(id)
  assert.ok(chat.some((c) => c.role === 'system' && /続きを頼みます（1\/3 回目）/.test(c.text)))
  assert.equal(studio.view(id).turn, 'you')
})

test('「発表の準備ができた」はステップだけ進め、Claude を動かさない', async () => {
  const { id } = await talkAt('slides', 'internal')
  await studio.press(id, 'ready')
  assert.equal(readWork(id).work.step, 'present')
  assert.equal(studio.conductor.busy(id), false)
  assert.equal(studio.view(id).turn, 'you')
})

test('Claude が要らないと書いたファイルは、話者が押すとごみ箱へ移る。中身のフォルダの外は移せない', async () => {
  const { id, dir } = await talkAt('slides', 'internal')
  const scene = join(PRIVATE, 'talks', dir, 'scenes', 'rule.tsx')
  mkdirSync(join(PRIVATE, 'talks', dir, 'scenes'), { recursive: true })
  writeFileSync(scene, 'export {}\n')
  writeProposals(id, (p) => (p.trash = [{ path: '../../works/x', note: '外' }, { path: 'scenes/rule.tsx', note: '並びから外した' }]))
  await assert.rejects(() => Promise.resolve(studio.press(id, 'trash-file', { index: 0 })), /外のファイル/)
  await studio.press(id, 'trash-file', { index: 1 })
  assert.ok(!existsSync(scene))
  assert.deepEqual(readProposals(id).proposals.trash?.map((f) => f.path), ['../../works/x'])
  await studio.press(id, 'keep-file', { index: 0 })
  assert.equal(readProposals(id).proposals.trash, undefined)
})

test('見た目の差: 数字 1 文字ほどの小さな変化でも「変わった」にし、弱い揺れだけなら揺れ、大きさが違えば変わったにする', async () => {
  const { classifyDiff } = await import('../shared/diff.ts')
  const w = 1280
  const h = 720
  const blank = () => new Uint8ClampedArray(w * h * 4).fill(255)
  const a = blank()
  const digit = blank()
  // 8×12 画素の黒い字 1 つ (全体の 0.01%)
  for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) digit.fill(0, ((100 + y) * w + 100 + x) * 4, ((100 + y) * w + 100 + x) * 4 + 3)
  const r = classifyDiff(a, digit, [w, h], [w, h])
  assert.equal(r.kind, 'changed')
  assert.equal(r.strong, 96)
  const jitter = blank()
  for (let i = 0; i < 40; i++) jitter[i * 4000] = 240
  assert.equal(classifyDiff(a, jitter, [w, h], [w, h]).kind, 'jitter')
  assert.equal(classifyDiff(a, blank(), [w, h], [w, h]).kind, 'same')
  assert.equal(classifyDiff(a, a, [w, h], [w, h - 1]).kind, 'size')
  // テーマの背景色を各色 8 ずつ (和 24) 変えたら、強く変わった画素が 0 でも揺れにしない
  const tinted = blank()
  for (let i = 0; i < tinted.length; i += 4) tinted.fill(247, i, i + 3)
  const t = classifyDiff(a, tinted, [w, h], [w, h])
  assert.equal(t.kind, 'tint')
  assert.equal(t.strong, 0)
})
