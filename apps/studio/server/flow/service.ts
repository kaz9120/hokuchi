// 話者の操作と、画面に渡す形。状態 × イベントの表 (steps.ts) どおりに作品を動かす。
// 外に出す操作 (取り込み・記録・push・デプロイ) は、話者が押したときだけここで行う
import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import YAML from 'yaml'
import type { Anchor, Card, Change, FileChange, HomeView, Kind, Neta, Proposals, Section, ShelfItem, Step, Work, WorkView } from '../../shared/types.ts'
import { STEPS } from '../../shared/types.ts'
import { NOTES_CLI, PRIVATE, SITE_BUILD, WRANGLER, gitRoot, places, repoRoot } from '../infra/config.ts'
import { conflict, invalid } from '../infra/errors.ts'
import { readText, yamlText } from '../infra/files.ts'
import { editBlock, ensureDraft, noteView, readOutline, renameDraft, reviseFromArchive, setMeta, writeOutline, existingDraftNames } from '../media/notes.ts'
import { editNote, siteTalkOf, talkView } from '../media/talks.ts'
import { listArchives } from '../store/archive.ts'
import { reveal } from '../infra/reveal.ts'
import { assetsDirOf, noteDir, talkDirOf } from '../store/places.ts'
import { appendChat, appendMaterial, appendRun, readRuns, costOf, createWork, filesDir, isWork, listWorkIds, madeDir, materialFile, readMaterial, readChat, readProposals, readQueue, readWork, updateWork, workDir, workFile, writeProposals } from '../store/works.ts'
import { Conductor, type Job, type Kept } from './conductor.ts'
import { cleanLearning } from '../../shared/learning.ts'
export { cleanLearning }
import { advanceOf, askOf, choresOf, today, turnOf } from './steps.ts'
import { theSite } from '../infra/site.ts'
import { saveStamps, settle } from '../store/stamps.ts'
import { read as readByListeners, readSummary, reopen, setReaders } from './reads.ts'

const run = promisify(execFile)

export type Attachment = { name: string; data: string }

/** 作品ごとの変化を画面に知らせる。home は一覧の更新 */
export type Notify = (id: string | 'home') => void

/**
 * 絵コンテの頭に「見た目: 話者が認めた (日付)」を書く。Claude への指示を「見た目を守って直す」に切り替える印で、
 * out/look/ (作業出力で消えうる) が無くても切り替わるよう、絵コンテに残す
 */
function markLook(talkDir: string) {
  const file = join(talkDir, 'storyboard.md')
  if (!existsSync(file)) return
  const md = readFileSync(file, 'utf8')
  const line = `見た目: 話者が認めた (${new Date().toLocaleDateString('sv-SE')})。直すのは話者が指した所と頼んだことだけ。認めた静止画は out/look/`
  if (/^見た目[:：].*$/m.test(md)) return writeFileSync(file, md.replace(/^見た目[:：].*$/m, line))
  // 最初の章 (## ) の前、トーク全体の情報の終わりに足す
  const at = md.search(/^## /m)
  writeFileSync(file, at < 0 ? `${md.trimEnd()}\n${line}\n` : `${md.slice(0, at).trimEnd()}\n${line}\n\n${md.slice(at)}`)
}

export class Studio {
  conductor: Conductor
  /** 取り込み・デプロイなど、サーバの中の作業 */
  private chores = new Map<string, string>()
  thumbs = new Map<string, { version: number; errors: string[] }>()
  private notify: Notify
  constructor(notify: Notify) {
    this.notify = notify
    this.conductor = new Conductor(
      (id) => {
        notify(id)
        notify('home')
      },
      (id, step, ok) => {
        // 片付けの実行が学びの案を 0 件で終えたら、学びは済んだことにする
        if (ok && step === 'shipped' && !readProposals(id).proposals.learnings?.length) updateWork(id, (w) => (w.learned = true))
      },
    )
  }

  // ---------------------------------------------------------------- 読む

  private dirtyFiles(work: Work): FileChange[] {
    return gitChanges(recordPaths(work))
  }

  view(id: string): WorkView {
    const { work, version } = readWork(id)
    const { proposals } = readProposals(id)
    const live = this.conductor.live(id)
    const serverJob = this.chores.get(id)
    const running = live.state !== 'idle' || !!serverJob
    const uncommitted = work.shipped && work.learned && !work.recorded ? this.dirtyFiles(work) : []
    const chores = choresOf(work, proposals, work.shipped && !work.recorded ? this.dirtyFiles(work).length > 0 : false)
    const turn = turnOf(work, running, chores)
    const lastRun = readRuns(id).filter((r) => r.type === 'end').at(-1)
    const stalled = turn === 'you' && !!lastRun && lastRun.result !== 'done' && lastRun.result !== 'stopped' && readChat(id).at(-1)?.tone === 'error'
    const ask = serverJob ?? (stalled ? 'Claude の作業が止まりました。続けてもらうか、話しかける' : askOf(work, proposals, turn, chores))
    if (!work.title) work.title = (work.kind === 'note' ? noteView(work)?.title?.replace(/^無題$/, '') : talkTitle(work)) || provisionalTitle(id)
    return {
      work,
      proposals,
      version,
      turn,
      ask,
      live: serverJob ? { state: 'running', text: '', tools: [serverJob] } : live,
      chat: readChat(id),
      costUsd: costOf(id),
      chores,
      note: work.kind === 'note' ? noteView(work) : undefined,
      talk: work.kind === 'talk' ? this.talkOf(work) : undefined,
      uncommitted,
      unpushed: work.shipped && work.recorded ? unpushedCount() : 0,
      revising: !!work.revising,
      reads: readSummary(work),
    }
  }

  private refreshing = false
  /** 発表の中身。トークのフォルダができたのにサイトが拾っていなければ、拾い直してから知らせる */
  private talkOf(work: Work) {
    const view = talkView(work, this.thumbs.get(work.id) ?? { version: 0, errors: [] })
    if (view.exists && !siteTalkOf(work) && !this.refreshing) {
      this.refreshing = true
      Promise.resolve()
        .then(() => theSite().refresh())
        .catch(() => {})
        .finally(() => {
          this.refreshing = false
          if (siteTalkOf(work)) this.notify(work.id)
        })
    }
    return view
  }

  card(id: string): Card {
    const v = this.view(id)
    const w = v.work
    return {
      id,
      kind: w.kind,
      title: w.title || v.note?.title || firstLine(readChat(id).find((c) => c.role === 'you')?.text) || '無題',
      step: w.step,
      turn: v.turn,
      ask: v.ask,
      scope: w.kind === 'note' ? 'public' : (w.decided.scope ?? 'internal'),
      date: w.decided.event?.date,
      updatedAt: w.updatedAt,
      doing: v.live.state === 'queued' ? '順番待ち' : v.live.tools.at(-1),
      failed: v.chat.at(-1)?.tone === 'error',
    }
  }

  home(): HomeView {
    const cards = listWorkIds().map((id) => this.card(id))
    const byDate = (a: Card, b: Card) => b.updatedAt.localeCompare(a.updatedAt)
    let siteUrl = ''
    try {
      siteUrl = theSite().url
    } catch {}
    const pendingWorks = listWorkIds()
      .map((id) => readWork(id).work)
      .filter((w) => w.shipped && w.learned && !w.recorded)
      .map((w) => ({ id: w.id, n: gitChanges(recordPaths(w)).length }))
      .filter((x) => x.n > 0)
    return {
      uncommitted: { count: pendingWorks.reduce((s, x) => s + x.n, 0), workId: pendingWorks[0]?.id },
      todo: cards.filter((c) => c.turn === 'you').sort(byDate),
      working: cards.filter((c) => c.turn === 'claude').sort(byDate),
      neta: listNeta(),
      shelfCount: this.shelf().length,
      siteUrl,
    }
  }

  /** 出したもの。作品のある記事と発表、作品の無いアーカイブと公開の発表 */
  shelf(): ShelfItem[] {
    const works = listWorkIds().map((id) => readWork(id).work)
    const items: ShelfItem[] = []
    const keys = new Set<string>()
    const talkDirs = new Set<string>()
    for (const w of works) {
      if (w.kind === 'note' && w.note?.key) keys.add(w.note.key)
      const td = talkDirOf(w)
      if (td) talkDirs.add(td)
      if (!w.shipped && !w.presented) continue
      if (w.dropped) continue
      const archive = w.note?.key ? listArchives().find((a) => a.url?.endsWith(`/n/${w.note!.key}`)) : null
      items.push({
        key: w.id,
        kind: w.kind,
        title: archive?.title ?? w.title,
        date: (w.shipped?.at ?? w.presented?.at ?? w.updatedAt).slice(0, 10),
        scope: w.kind === 'note' ? 'public' : (w.decided.scope ?? 'internal'),
        url: archive?.url ?? undefined,
        cover: archive?.eyecatch ? `/api/archive/${archive.dir}/${archive.eyecatch}` : talkCover(w),
        workId: w.id,
        event: w.decided.event?.name,
      })
    }
    for (const a of listArchives()) {
      const key = a.url?.match(/\/n\/(\w+)/)?.[1]
      if (key && keys.has(key)) continue
      items.push({ key: `note:${a.dir}`, kind: 'note', title: a.title, date: a.publishedAt, scope: 'public', url: a.url ?? undefined, cover: a.eyecatch ? `/api/archive/${a.dir}/${a.eyecatch}` : undefined })
    }
    try {
      for (const t of theSite().talks.values()) {
        if (talkDirs.has(t.dir) || !t.info.public || t.outside) continue
        items.push({ key: `talk:${t.info.slug}`, kind: 'talk', title: t.info.title, date: t.info.date ?? '', scope: 'public', url: `https://slides.y-kaz.com/${t.info.slug}/`, cover: `${theSite().url}/${t.info.slug}/og.png`, event: t.info.event?.name })
      }
    } catch {}
    return items.sort((a, b) => b.date.localeCompare(a.date))
  }

  // ---------------------------------------------------------------- 始める・話す

  start(kind: Kind, text: string, files: Attachment[] = [], seed?: string): string {
    if (!text.trim() && !files.length) throw invalid('話したことか、画像を入れてください')
    const work = createWork(kind)
    if (kind === 'note') ensureDraft(work.note!.slug, '')
    if (seed) {
      updateWork(work.id, (w) => (w.seed = seed))
      markNeta(seed, work.id)
    }
    this.say(work.id, { text, files, mode: 'after' })
    this.notify('home')
    return work.id
  }

  /**
   * 同じ材料から、もう一方の作品 (発表なら記事、記事なら発表) を始める。
   * 話者の言葉は 1 つのネタから記事にも発表にもなる。材料の原文と、確定した伝えたいこと・発表なら絵コンテの話すことを、新しい作品の材料に写す
   */
  derive(id: string): string {
    const { work: src } = readWork(id)
    if (src.dropped) throw invalid('やめた作品からは始められません')
    const kind: Kind = src.kind === 'talk' ? 'note' : 'talk'
    const work = createWork(kind)
    if (kind === 'note') ensureDraft(work.note!.slug, '')
    updateWork(work.id, (w) => (w.from = src.id))
    const what = src.kind === 'talk' ? '発表' : '記事'
    const parts = [`## ${what}「${src.title || src.id}」の材料 (原文)\n\n${readMaterial(src.id).replace(/^# 材料\n\n[^\n]*\n/, '').trim()}`]
    if (src.decided.core) parts.push(`## ${what}で確定した伝えたいこと\n\n${src.decided.core}`)
    const talk = src.kind === 'talk' ? talkDirOf(src) : null
    const board = talk ? join(talk, 'storyboard.md') : null
    if (board && existsSync(board)) parts.push(`## 発表の絵コンテ (話すことは話者と合意した言葉)\n\n${readFileSync(board, 'utf8').trim()}`)
    appendFileSync(materialFile(work.id), '\n' + parts.join('\n\n') + '\n')
    const text = kind === 'note' ? `発表「${src.title || src.id}」と同じ材料から、記事を書きたい。発表で話したことを、記事として読める形にしたい。` : `記事「${src.title || src.id}」と同じ材料から、発表を作りたい。`
    this.say(work.id, { text, mode: 'after' })
    this.notify('home')
    return work.id
  }

  say(id: string, { text, files = [], anchors = [], mode = 'after' }: { text: string; files?: Attachment[]; anchors?: Anchor[]; mode?: 'after' | 'interrupt' }) {
    const { work } = readWork(id)
    if (work.dropped) throw invalid('やめた作品には話しかけられません')
    if (!text.trim() && !files.length && !anchors.length) throw invalid('話したことを入れてください')
    let saved: string[] = []
    this.write(id, () => (saved = this.saveFiles(work, files)))
    const job = this.sayJob(work, { text, saved, anchors })
    if (mode === 'interrupt') this.conductor.interrupt(id, job)
    else this.conductor.ask(id, job)
  }

  private sayJob(work: Work, keep: Kept): Job {
    const { id } = work
    const { text, saved, anchors } = keep
    const step: Step | 'shipped' = work.shipped && !work.revising && !work.reworking ? 'shipped' : work.step
    // 会話と材料には、Claude に渡す時に書く (待っている間に止まったら、送らずに残すため)
    const record = () => {
      appendChat(id, { role: 'you', text, files: saved.length ? saved : undefined, anchors: anchors.length ? anchors : undefined })
      appendMaterial(id, work.step, [anchors.length ? anchors.map((a) => `［${a.label}${a.quote ? `「${a.quote}」` : ''}について］`).join(' ') : '', text].filter(Boolean).join('\n'), saved)
    }
    const prompt = [
      anchors.length ? `指している場所:\n${anchors.map((a) => `- ${a.label}${a.quote ? `「${a.quote}」` : ''}`).join('\n')}` : '',
      saved.length ? `貼った画像: ${saved.map((f) => join(workDir(id), f)).join('、')}${assetsDirOf(work) ? `（${assetsDirOf(work)} にも写した）` : ''}` : '',
      text,
    ]
      .filter(Boolean)
      .join('\n\n')
    return { prompt, step, onStart: record, label: text || anchors.map((a) => a.label).join('・'), keep }
  }

  private saveFiles(work: Work, files: Attachment[]): string[] {
    if (!files.length) return []
    mkdirSync(filesDir(work.id), { recursive: true })
    const assets = assetsDirOf(work)
    if (assets) mkdirSync(assets, { recursive: true })
    return files.map((f, i) => {
      const ext = (f.name.match(/\.(png|jpe?g|gif|webp)$/i)?.[0] ?? '.png').toLowerCase()
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const name = `${stamp}-${i + 1}${ext}`
      const buf = Buffer.from(f.data.replace(/^data:[^,]+,/, ''), 'base64')
      writeFileSync(join(filesDir(work.id), name), buf)
      if (assets) copyFileSync(join(filesDir(work.id), name), join(assets, name))
      return `files/${name}`
    })
  }

  stop(id: string) {
    this.conductor.stop(id)
  }

  // ---------------------------------------------------------------- 話者がその場で直す

  /** studio が中身を書く。外の変化を先に拾い、書いたあとの版を記録する */
  private write(id: string, fn: () => void) {
    const { work } = readWork(id)
    settle(work, (files) => updateWork(id, (w) => {
      const list = (w.changes ??= [])
      for (const f of files.slice(0, 20)) if (!list.some((c) => c.where === f)) list.push({ kind: 'outside', where: f, at: new Date().toISOString() })
    }), fn)
  }

  private noteChange(id: string, where: string) {
    saveStamps(readWork(id).work)
    updateWork(id, (w) => {
      const list = (w.changes ??= [])
      if (!list.some((c) => c.where === where)) list.push({ kind: 'you', where, at: new Date().toISOString() })
    })
  }

  private guardIdle(id: string) {
    if (this.conductor.busy(id)) throw invalid('Claude が作業中なので、終わってから直してください')
  }

  editParagraph(id: string, n: number, text: string, base: string) {
    this.guardIdle(id)
    const { work } = readWork(id)
    if (!work.note?.slug) throw invalid('原稿がありません')
    this.write(id, () => editBlock(work.note!.slug, n, text, base))
    this.noteChange(id, `原稿の段落 ${n}`)
    this.notify(id)
  }

  editOutline(id: string, sections: Section[], base: string) {
    this.guardIdle(id)
    const { work } = readWork(id)
    if (!work.note?.slug) throw invalid('原稿がありません')
    this.write(id, () => writeOutline(work.note!.slug, sections, base))
    this.noteChange(id, '構成 (outline.yaml)')
    this.notify(id)
  }

  editKoma(id: string, scene: string, n: number, orig: string, text: string) {
    this.guardIdle(id)
    const { work } = readWork(id)
    const dir = talkDirOf(work)
    if (!dir) throw invalid('絵コンテがありません')
    this.write(id, () => editNote(dir, scene, n, orig, text))
    this.noteChange(id, `絵コンテの ${scene} のコマ ${n} の話すこと`)
    this.notify(id)
  }

  /** 候補の欄を話者が直す (確定の前の下書き)。proposals.yaml を書き換える */
  editProposals(id: string, patch: Partial<Proposals>) {
    this.guardIdle(id)
    writeProposals(id, (p) => Object.assign(p, patch))
    this.notify(id)
  }

  /** 外で変わったファイル。次の実行の頭に添える */
  outsideChange(id: string, where: string) {
    if (this.conductor.busy(id)) return
    updateWork(id, (w) => {
      const list = (w.changes ??= [])
      if (!list.some((c) => c.where === where && c.kind === 'outside')) list.push({ kind: 'outside', where, at: new Date().toISOString() })
    })
  }

  // ---------------------------------------------------------------- 押す

  async press(id: string, action: string, payload: any = {}) {
    const { work } = readWork(id)
    const busy = this.conductor.busy(id) || this.chores.has(id)
    const refused = refuseAction(work, action, busy, readProposals(id).proposals)
    if (refused) throw conflict(refused)
    const adv = advanceOf(work.kind, work.step)
    if (adv && adv.action === action) {
      if (busy) throw invalid('Claude が作業中です。終わってから押してください')
      return this.advance(work, adv.to, adv.prompt, payload)
    }
    switch (action) {
      case 'revise-core': {
        const core = String(payload.core ?? '').trim()
        if (!core) throw invalid('伝えたいことを入れてください')
        updateWork(id, (w) => (w.decided.core = core))
        writeProposals(id, (p) => delete p.coreRevision)
        appendChat(id, { role: 'system', text: `伝えたいことを変えました:「${core}」`, tone: 'step' })
        return this.conductor.ask(id, { prompt: `伝えたいことを「${core}」に変えた。構成と原稿を見直す必要があれば、構成を直す案を書いて`, step: work.step })
      }
      case 'accept-outline': {
        const { proposals } = readProposals(id)
        if (!proposals.outlineRevision?.length || !work.note?.slug) throw invalid('構成を直す案がありません')
        this.write(id, () => writeOutline(work.note!.slug, proposals.outlineRevision!))
        writeProposals(id, (p) => delete p.outlineRevision)
        appendChat(id, { role: 'system', text: '構成を直す案を採りました', tone: 'step' })
        return this.conductor.ask(id, { prompt: work.step === 'outline' ? '構成を直す案を採った。構成はこれで進めるので、ほかに聞きたい材料があれば聞いて' : '構成を直す案を採った。原稿を新しい構成に合わせて直して', step: work.step })
      }
      case 'accept-map': {
        const { proposals } = readProposals(id)
        if (!proposals.mapRevision?.length) throw invalid('構成を直す案がありません')
        updateWork(id, (w) => (w.decided.map = proposals.mapRevision))
        writeProposals(id, (p) => delete p.mapRevision)
        return this.conductor.ask(id, { prompt: 'メッセージマップを直す案を採った。絵コンテを合わせて直して', step: work.step })
      }
      case 'choose-title': {
        const title = String(payload.title ?? '').trim()
        if (!title) throw invalid('タイトルを入れてください')
        updateWork(id, (w) => (w.title = title))
        if (work.note?.slug) this.write(id, () => setMeta(work.note!.slug, { title }))
        this.notify(id)
        return
      }
      case 'choose-tags': {
        const tags = (payload.tags ?? []).map((t: string) => String(t).replace(/^#/, '').trim()).filter(Boolean)
        if (work.note?.slug) this.write(id, () => setMeta(work.note!.slug, { hashtags: tags }))
        this.notify(id)
        return
      }
      case 'choose-slug': {
        if (!work.note?.slug) throw invalid('原稿がありません')
        if (busy) throw invalid('Claude が作業中です')
        const name = renameDraft(work.note.slug, String(payload.slug ?? ''))
        updateWork(id, (w) => (w.note!.slug = name))
        saveStamps(readWork(id).work)
        appendChat(id, { role: 'system', text: `原稿の名前を ${name} にしました`, tone: 'step' })
        this.notify(id)
        return
      }
      case 'choose-motif': {
        const motif = String(payload.motif ?? '').trim()
        if (!motif) throw invalid('モチーフを選んでください')
        return this.say(id, { text: `見出し画像のモチーフはこれにする:「${motif}」。下地を作って` })
      }
      case 'ship-note':
        return this.shipNote(id, String(payload.url ?? ''))
      case 'note-updated':
        return this.shipNote(id, work.note?.url ?? '', true)
      case 'learn':
        return this.learn(id, Number(payload.index), !!payload.accept, payload.text)
      case 'learned-none': {
        updateWork(id, (w) => (w.learned = true))
        this.notify(id)
        this.notify('home')
        return
      }
      case 'record':
        return this.record(id)
      case 'push':
        return this.push(id)
      case 'revise':
        return this.revise(id)
      case 'cancel-revise': {
        if (!work.revising || !work.note?.slug) throw invalid('改稿中ではありません')
        moveToMade(work)
        updateWork(id, (w) => (w.revising = false))
        appendChat(id, { role: 'system', text: '改稿をやめました', tone: 'step' })
        this.notify(id)
        return
      }
      case 'presented': {
        updateWork(id, (w) => {
          w.presented = { at: new Date().toISOString() }
          if (w.decided.scope !== 'public') {
            w.shipped = { at: new Date().toISOString(), by: 'presented' }
            w.learned = false
            w.recorded = false
          }
        })
        appendChat(id, { role: 'system', text: '発表しました', tone: 'step' })
        return this.conductor.ask(id, { prompt: work.decided.scope === 'public' ? '発表が終わった。ノートを公開物として読み直して直し、学びの案を書いて' : '発表が終わった。学びの案を書いて', step: 'shipped', fresh: true })
      }
      case 'set-date': {
        updateWork(id, (w) => ((w.decided.event ??= {}).date = String(payload.date ?? '')))
        this.notify(id)
        return
      }
      case 'set-scope':
        return this.setScope(id, payload.scope === 'public' ? 'public' : 'internal')
      case 'deploy':
        return this.deploy(id, !!payload.accept)
      case 'allow-parts': {
        const extra = [join(repoRoot, 'packages/stage/src/kit') + '/', join(repoRoot, 'parts') + '/']
        updateWork(id, (w) => touch(w, 'packages/stage/src/kit', 'parts'))
        appendChat(id, { role: 'system', text: 'この作業だけ、部品 (packages/stage/src/kit/・parts/) を直すのを許しました', tone: 'step' })
        return this.conductor.ask(id, { prompt: '部品を直すのを、この作業に限って許した。必要な部品を足して直して', step: work.step, extraWritable: extra })
      }
      case 'drop': {
        if (work.shipped) throw invalid('出した作品はやめられません')
        this.conductor.stop(id)
        updateWork(id, (w) => (w.dropped = { at: new Date().toISOString() }))
        if (work.note?.slug && existsSync(noteDir(work.note.slug))) {
          const trash = join(places.trash, `${new Date().toISOString().replace(/[:.]/g, '-')}-notes-${work.note.slug}`)
          mkdirSync(places.trash, { recursive: true })
          renameSync(noteDir(work.note.slug), trash)
        }
        appendChat(id, { role: 'system', text: 'この作品をやめました', tone: 'step' })
        this.notify(id)
        this.notify('home')
        return
      }
      case 'set-readers': {
        setReaders(work, payload.readers ?? [])
        this.notify(id)
        return
      }
      case 'read': {
        if (busy) throw invalid('Claude が作業中です。終わってから頼んでください')
        return this.serverJob(id, '聴衆役が読んでいます', async () => {
          let cost = 0
          const open = await readByListeners(
            work,
            (done, total) => {
              this.chores.set(id, `聴衆役が読んでいます（${done}/${total} 人）`)
              this.notify(id)
            },
            (usd) => (cost += usd),
          )
          appendRun(id, { id: Math.random().toString(36).slice(2, 10), type: 'end', step: work.step, what: 'reads', result: 'done', costUsd: cost })
          appendChat(id, { role: 'system', text: `聴衆役が読みました。直すか考えてほしい感想が ${open} 件あります`, tone: 'step' })
          this.chores.delete(id)
          this.conductor.ask(id, { prompt: '聴衆役が読んだ。feedback.yaml の ball: Claude の感想を 1 件ずつ判断して直し、返事に「直した n 件・見送った n 件」と見送った理由を書いて', step: work.step })
        })
      }
      case 'reopen': {
        reopen(work, String(payload.thread ?? ''))
        this.notify(id)
        return
      }
      case 'send-reopened':
        return this.conductor.ask(id, { prompt: '見送った感想のうち、話者が戻したもの (feedback.yaml で ball: Claude に戻したもの) を直して', step: work.step })
      case 'send-held':
        return this.conductor.flush(id)
      case 'drop-held':
        return this.conductor.drop(id)
      case 'trash-file':
      case 'keep-file': {
        const { proposals } = readProposals(id)
        const item = proposals.trash?.[Number(payload.index)]
        if (!item) throw invalid('そのファイルはもう一覧にありません')
        if (action === 'trash-file') {
          const base = work.kind === 'note' ? (work.note?.slug ? noteDir(work.note.slug) : null) : talkDirOf(work)
          const file = base ? join(base, item.path) : null
          if (!base || !file || !file.startsWith(base + '/') || item.path.includes('..')) throw invalid('中身のフォルダの外のファイルは移せません')
          if (existsSync(file)) {
            mkdirSync(places.trash, { recursive: true })
            renameSync(file, join(places.trash, `${new Date().toISOString().replace(/[:.]/g, '-')}-${basename(file)}`))
            if (work.kind === 'talk' && work.decided.scope === 'public') updateWork(id, (w) => touch(w, file.slice(repoRoot.length + 1)))
          }
          appendChat(id, { role: 'system', text: `${item.path} をごみ箱へ移しました`, tone: 'info' })
        }
        this.write(id, () => writeProposals(id, (p) => {
          p.trash = (p.trash ?? []).filter((x) => x.path !== item.path)
          if (!p.trash.length) delete p.trash
        }))
        this.notify(id)
        return
      }
      case 'step-back': {
        const steps = STEPS[work.kind]
        const prev = steps[steps.indexOf(work.step) - 1]
        updateWork(id, (w) => (w.step = prev))
        appendChat(id, { role: 'system', text: `「${STEP_NAMES[prev]}」に戻りました`, tone: 'step' })
        return this.conductor.ask(id, { prompt: `話者がステップを「${STEP_NAMES[prev]}」に戻した。いまの中身を読み直し、このステップで直すべき所があれば候補を出して`, step: prev, fresh: true })
      }
      case 'rework': {
        updateWork(id, (w) => {
          w.reworking = true
          w.step = 'present'
        })
        appendChat(id, { role: 'system', text: 'スライドの手直しを始めました。直したら、もう一度サイトに出してください', tone: 'step' })
        this.notify(id)
        return
      }
      case 'export': {
        const dir = talkDirOf(work)
        if (!dir) throw invalid('発表のフォルダがありません')
        return this.serverJob(id, '1 つの HTML と PDF に書き出しています', async () => {
          await run('node', ['packages/stage/cli.mjs', 'single', dir, ...(payload.present ? ['--present'] : [])], { cwd: repoRoot, maxBuffer: 20 << 20, timeout: 15 * 60_000 })
          appendChat(id, { role: 'system', text: `書き出しました: ${join(dir, 'out')} の HTML と PDF`, tone: 'step' })
          reveal(join(dir, 'out'))
        })
      }
      case 'accept-look': {
        const dir = talkDirOf(work)
        if (!dir) throw invalid('発表のフォルダがありません')
        // 話者が気に入った見た目を、以後の直しで崩さないための基準にする。Claude には許していない操作
        return this.serverJob(id, 'いまの見た目を撮っています', async () => {
          await run('node', ['packages/stage/cli.mjs', 'look', dir], { cwd: repoRoot, maxBuffer: 20 << 20, timeout: 15 * 60_000 })
          markLook(dir)
          appendChat(id, { role: 'system', text: 'いまの見た目を認めました。以後の直しでは、ここから変わった状態を Claude が返事で知らせます', tone: 'step' })
        })
      }
      case 'link-archive': {
        const dir = String(payload.dir ?? '')
        if (!work.linkCandidates?.includes(dir)) throw invalid('その記事は候補にありません')
        const a = listArchives().find((x) => x.dir === dir)
        const key = a?.url?.match(/\/n\/(\w+)/)?.[1]
        if (!a || !key) throw invalid('記事が見つかりません')
        updateWork(id, (w) => {
          w.note = { ...w.note!, key, url: a.url ?? undefined }
          w.shipped = { at: `${a.publishedAt}T12:00:00.000Z`, by: 'note', ref: a.dir }
          w.learned = true
          w.recorded = true
          w.title = a.title
          w.step = 'publish'
          delete w.linkCandidates
        })
        appendChat(id, { role: 'system', text: `公開済みの記事（${a.dir}）と結びました`, tone: 'step' })
        this.notify(id)
        this.notify('home')
        return
      }
      case 'retry':
        return this.conductor.ask(id, { prompt: '前の作業が途中で止まった。続きをして', step: work.shipped && !work.revising && !work.reworking ? 'shipped' : work.step })
      default:
        throw invalid(`いまは「${action}」はできません`)
    }
  }

  private advance(work: Work, to: Step, prompt: string, payload: any) {
    const id = work.id
    updateWork(id, (w) => {
      const d = payload.decided ?? {}
      if (w.step === 'core') {
        if (d.core !== undefined) w.decided.core = String(d.core).trim()
        if (!w.decided.core) throw invalid('伝えたいことを決めてください')
        if (d.reader) w.decided.reader = d.reader
        if (d.takeaway !== undefined) w.decided.takeaway = d.takeaway
        if (d.audience) w.decided.audience = d.audience
        if (d.event) w.decided.event = { ...w.decided.event, ...d.event }
        if (d.scope) w.decided.scope = d.scope === 'public' ? 'public' : 'internal'
      }
      if (w.kind === 'talk' && w.step === 'outline') {
        const { proposals } = readProposals(id)
        const map = d.map ?? proposals.map
        if (!map?.length) throw invalid('メッセージマップがまだありません')
        w.decided.map = map
        const name = sanitizeDir(String(payload.talkDir ?? proposals.talkDir ?? '') || `${(w.decided.event?.date ?? today()).replace(/-/g, '_')}_${w.id}`)
        w.talk = { ...w.talk, dir: name }
      }
      w.step = to
    })
    // 確定に使った候補と「直す案」は役目を終えたので外す
    writeProposals(id, (p) => {
      delete p.coreRevision
      delete p.picked
      if (to === 'draft') delete p.outlineRevision
      if (to === 'storyboard') delete p.mapRevision
    })
    const { work: next } = readWork(id)
    if (next.kind === 'talk' && to === 'storyboard') prepareTalkDir(next)
    appendChat(id, { role: 'system', text: `「${STEP_NAMES[to]}」に進みました`, tone: 'step' })
    if (prompt) this.conductor.ask(id, { prompt, step: to, fresh: true })
    else {
      this.notify(id)
      this.notify('home')
    }
  }

  // ---------------------------------------------------------------- 出す

  private async serverJob(id: string, label: string, fn: () => Promise<void>, retry?: { action: string; label: string; payload?: unknown }, failure = label) {
    if (this.chores.has(id)) throw invalid('いま別の作業をしています')
    failure = FAILURE[label] ?? failure
    this.chores.set(id, label)
    this.notify(id)
    const runId = Math.random().toString(36).slice(2, 10)
    appendRun(id, { id: runId, type: 'start', step: 'shipped', what: 'ingest' })
    try {
      await fn()
      appendRun(id, { id: runId, type: 'end', step: 'shipped', what: 'ingest', result: 'done' })
    } catch (e) {
      appendRun(id, { id: runId, type: 'end', step: 'shipped', what: 'ingest', result: 'failed', message: String((e as Error).message) })
      appendChat(id, { role: 'system', text: `${failure}: ${String((e as Error).message).slice(0, 400)}`, tone: 'error', retry })
    } finally {
      this.chores.delete(id)
      this.notify(id)
      this.notify('home')
    }
  }

  /** note の URL を受けて取り込む。改稿のときは同じ key で取り込み直す */
  shipNote(id: string, url: string, again = false) {
    const key = url.match(/note\.com\/[^/]+\/n\/(n[0-9a-z]+)/)?.[1]
    if (!key) throw invalid('note の記事の URL を貼ってください (https://note.com/<名前>/n/<key>)')
    const { work } = readWork(id)
    if (!work.note?.slug) throw invalid('原稿がありません')
    for (const other of listWorkIds()) if (other !== id && readWork(other).work.note?.key === key) throw invalid(`この記事は、ほかの作品（${other}）と結ばれています`)
    return this.serverJob(id, 'note から取り込んでいます', async () => {
      const slugsFile = join(places.archive, 'slugs.json')
      const slugs = JSON.parse(readText(slugsFile) ?? '{}')
      if (!slugs[key]) {
        slugs[key] = work.note!.slug
        writeFileSync(slugsFile, JSON.stringify(slugs, null, 2) + '\n')
      }
      // 取り込みが変えたファイル (ほかの記事の source.json や索引を含む) を、この作品の記録の対象にするため、前後の差を取る
      const before = new Set(gitChanges(['articles/note']).map((f) => f.path))
      let verifyError = ''
      try {
        await run('node', [NOTES_CLI, 'sync', '--only', key], { cwd: repoRoot, maxBuffer: 20 << 20 })
      } catch (e: any) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
        if (/verify/.test(out) && archiveByKey(key)) verifyError = out.split('\n').filter((l) => /error|warn/.test(l)).slice(0, 5).join('\n')
        else throw new Error(out.split('\n').slice(-6).join('\n') || e.message)
      }
      const archive = archiveByKey(key)
      if (!archive) throw new Error('取り込んだ記事が見つかりませんでした。URL を確かめてください')
      moveToMade(readWork(id).work)
      updateWork(id, (w) => {
        touch(w, `articles/note/${archive.dir}`, 'articles/note/slugs.json', 'articles/note/README.md', ...gitChanges(['articles/note']).map((f) => f.path).filter((p) => !before.has(p)))
        w.note = { ...w.note!, key, url: archive.url ?? url }
        w.title = archive.title
        w.shipped = { at: new Date().toISOString(), by: 'note', ref: archive.dir }
        w.revising = false
        w.learned = false
        w.recorded = false
        w.step = 'publish'
      })
      appendChat(id, { role: 'system', text: again ? 'note から取り込み直しました' : `公開した記事を取り込みました（${archive.dir}）`, tone: 'step' })
      if (verifyError) appendChat(id, { role: 'system', text: `取り込みの検査で問題が見つかりました。取り込みは済んでいます:\n${verifyError}`, tone: 'error' })
      this.conductor.ask(id, { prompt: '記事を note で公開し、アーカイブに取り込んだ。公開版と原稿の差を読み、学びの案を書いて', step: 'shipped', fresh: true })
    }, { action: again ? 'note-updated' : 'ship-note', label: 'もう一度取り込む', payload: { url } })
  }

  learn(id: string, index: number, accept: boolean, text?: string) {
    const { work } = readWork(id)
    const { proposals } = readProposals(id)
    const item = proposals.learnings?.[index]
    if (!item) throw invalid('その学びの案はありません')
    if (accept) {
      const file = work.kind === 'note' ? join(repoRoot, '.claude/skills/writing-note/references/voice.md') : join(repoRoot, '.claude/skills/crafting-presentation/references/style-defaults.md')
      const title = work.title || work.id
      const body = cleanLearning(String(text ?? item.text))
      const cur = readText(file) ?? ''
      // 同じ作品の 2 行目からは「(同)」にする (voice.md の書き方)
      const head = `(${today()}「${title}」)`
      const line = `- ${lastHeadOf(cur) === head ? '(同)' : head} ${body}\n`
      writeFileSync(file, cur.endsWith('\n') ? cur + line : cur + '\n' + line)
      updateWork(id, (w) => {
        touch(w, file.slice(repoRoot.length + 1))
        w.recorded = false
      })
    }
    writeProposals(id, (p) => {
      p.learnings = (p.learnings ?? []).filter((_, i) => i !== index)
    })
    if (!readProposals(id).proposals.learnings?.length) updateWork(id, (w) => (w.learned = true))
    appendChat(id, { role: 'system', text: accept ? `学びを足しました: ${String(text ?? item.text).slice(0, 80)}` : '学びの案を 1 つ捨てました', tone: 'step' })
    this.notify(id)
    this.notify('home')
  }

  record(id: string) {
    const { work } = readWork(id)
    if (!work.learned) throw invalid('学びの案を選び終えてから記録してください')
    return this.serverJob(id, '変更を記録しています', async () => {
      const branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: gitRoot })).stdout.trim()
      if (branch !== 'main') throw new Error(`いまのブランチが ${branch} なので記録しませんでした。main に戻してから押してください`)
      const files = gitChanges(recordPaths(work)).map((f) => f.path)
      if (files.length) {
        await run('git', ['add', '--', ...files], { cwd: gitRoot })
        const msg = work.kind === 'note' ? `「${work.title}」を取り込み、学びを追加` : `「${work.title}」の発表を記録`
        await run('git', ['commit', '-m', msg, '--', ...files], { cwd: gitRoot })
      }
      updateWork(id, (w) => (w.recorded = true))
      appendChat(id, { role: 'system', text: files.length ? `変更を記録しました（${files.length} ファイル）` : '記録する変更はありませんでした', tone: 'step' })
    }, { action: 'record', label: 'もう一度記録する' })
  }

  push(id: string) {
    return this.serverJob(id, 'GitHub に送っています', async () => {
      await run('git', ['push'], { cwd: gitRoot })
      appendChat(id, { role: 'system', text: 'GitHub に送りました', tone: 'step' })
    }, { action: 'push', label: 'もう一度送る' })
  }

  revise(id: string) {
    const { work } = readWork(id)
    if (!work.shipped || work.kind !== 'note' || !work.shipped.ref) throw invalid('公開した記事だけ改稿できます')
    if (work.revising) return
    const name = reviseFromArchive(join(places.archive, work.shipped.ref), work.note?.slug ?? work.shipped.ref.slice(11), madeDir(id))
    updateWork(id, (w) => {
      w.note = { ...w.note!, slug: name }
      w.revising = true
      w.step = 'draft'
      w.learned = false
      w.recorded = false
    })
    appendChat(id, { role: 'system', text: '改稿を始めました。直したら note の記事を更新し、「note を更新した」を押してください', tone: 'step' })
    this.notify(id)
  }

  setScope(id: string, scope: 'public' | 'internal') {
    const { work } = readWork(id)
    if (work.kind !== 'talk') throw invalid('公開範囲を選べるのは発表だけです')
    if (work.decided.scope === scope) return
    if (scope === 'internal' && work.shipped?.by === 'site') throw invalid('サイトに出した発表は、社内に戻せません')
    const from = talkDirOf(work)
    updateWork(id, (w) => {
      w.decided.scope = scope
      if (scope === 'public' && w.shipped?.by === 'presented') {
        w.shipped = null
        w.learned = false
        w.recorded = false
      }
    })
    const { work: next } = readWork(id)
    const to = talkDirOf(next)
    if (from && to && existsSync(from) && from !== to) {
      mkdirSync(join(to, '..'), { recursive: true })
      renameSync(from, to)
      const tsx = join(to, 'talk.tsx')
      const src = readText(tsx)
      if (src) writeFileSync(tsx, src.replace(/public:\s*(true|false)/, `public: ${scope === 'public'}`))
      try {
        theSite().refresh()
      } catch {}
    }
    appendChat(id, { role: 'system', text: scope === 'public' ? '公開する発表にしました（フォルダを talks/ に移しました）' : '社内の発表にしました', tone: 'step' })
    if (scope === 'public' && next.presented) this.conductor.ask(id, { prompt: '社内で発表したこの発表を公開することにした。ノートを公開物として読み直して直し、学びの案も書いて', step: 'shipped', fresh: true })
    this.notify(id)
  }

  deploy(id: string, accept: boolean) {
    const { work } = readWork(id)
    if (work.kind !== 'talk' || work.decided.scope !== 'public') throw invalid('サイトに出せるのは公開の発表だけです')
    return this.serverJob(id, 'サイトを組み立てています', async () => {
      try {
        await run('node', [SITE_BUILD, ...(accept ? ['--accept'] : [])], { cwd: repoRoot, maxBuffer: 50 << 20, timeout: 30 * 60_000 })
      } catch (e: any) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
        const m = out.match(/見た目が変わった状態が (\d+) 件/)
        if (m) {
          appendChat(id, { role: 'system', text: `前回と画像が違う状態が ${m[1]} 件あります。前・後・差を右に並べました。目に見える変化かを確かめ、意図した変化なら「この変化で出す」を押してください`, tone: 'info' })
          updateWork(id, (w) => (w.deployBlocked = Number(m[1])))
          return
        }
        throw new Error(out.split('\n').slice(-8).join('\n') || e.message)
      }
      try {
        await run(WRANGLER[0], [...WRANGLER.slice(1), 'deploy'], { cwd: join(repoRoot, 'apps/slides'), maxBuffer: 20 << 20, timeout: 10 * 60_000 })
      } catch (e: any) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
        // ログインは Cloudflare のブラウザの画面で許可する必要があり、studio からは代われない
        if (/login|authenticat|not authorized|CLOUDFLARE_API_TOKEN/i.test(out))
          throw new Error('Cloudflare へのログインが切れています。ターミナルで、リポジトリの apps/slides に移って `bunx wrangler login` を実行し、ブラウザで許可してから「もう一度出す」を押してください。サイトは組み立て済みです')
        throw new Error(out.split('\n').slice(-8).join('\n') || e.message)
      }
      updateWork(id, (w) => {
        w.deployBlocked = 0
        w.reworking = false
        w.shipped = { at: new Date().toISOString(), by: 'site' }
        w.learned = w.learned ?? false
        w.recorded = false
      })
      appendChat(id, { role: 'system', text: 'サイトに出しました', tone: 'step' })
    }, { action: 'deploy', label: 'もう一度出す', payload: { accept } })
  }

  // ---------------------------------------------------------------- 起動時

  recover() {
    const ids = listWorkIds()
    this.conductor.recover(ids)
    for (const id of ids) {
      const kept = readQueue(id).filter((k): k is Kept => !!k && typeof (k as Kept).text === 'string' && Array.isArray((k as Kept).saved) && Array.isArray((k as Kept).anchors))
      if (!kept.length) continue
      try {
        const { work } = readWork(id)
        if (!work.dropped) this.conductor.restore(id, kept.map((k) => this.sayJob(work, k)))
      } catch {}
    }
  }
}

/**
 * 状態 × イベントの表の「起きない」マス。画面で押せなくしているが、サーバでも確かめて断る (409)。
 * 断る理由を返す。押してよければ null
 */
export function refuseAction(w: Work, action: string, busy: boolean, p: Proposals): string | null {
  const BUSY_OK = new Set(['send-held', 'drop-held'])
  if (busy && !BUSY_OK.has(action)) return 'Claude かサーバが作業中です。終わってから押してください'
  if (w.dropped) return 'やめた作品です'
  const shipped = !!w.shipped && !w.revising && !w.reworking
  const note = w.kind === 'note'
  const talk = w.kind === 'talk'
  const need: Record<string, () => boolean> = {
    'revise-core': () => !shipped && w.step !== 'core',
    'accept-outline': () => note && !shipped && !!p.outlineRevision?.length,
    'accept-map': () => talk && !shipped && !!p.mapRevision?.length,
    'choose-title': () => note && w.step === 'publish',
    'choose-tags': () => note && w.step === 'publish',
    'choose-slug': () => note && w.step === 'publish' && !w.revising,
    'choose-motif': () => note && w.step === 'publish',
    'ship-note': () => note && w.step === 'publish' && !w.shipped,
    'note-updated': () => note && !!w.revising,
    learn: () => !!w.shipped && !w.learned && !!p.learnings?.length,
    'learned-none': () => !!w.shipped && !w.learned,
    record: () => !!w.shipped && !!w.learned && !w.recorded,
    push: () => !!w.shipped,
    revise: () => note && shipped,
    'cancel-revise': () => note && !!w.revising,
    presented: () => talk && w.step === 'present' && !w.presented,
    'set-date': () => talk && !w.presented,
    'set-scope': () => talk && !(w.shipped?.by === 'site'),
    deploy: () => talk && w.decided.scope === 'public' && w.step === 'present' && !!w.presented && (!w.shipped || !!w.reworking),
    'allow-parts': () => talk && !shipped,
    'accept-look': () => talk && !shipped && (w.step === 'slides' || w.step === 'present'),
    'set-readers': () => !shipped,
    read: () => !shipped,
    reopen: () => !shipped,
    'send-reopened': () => !shipped,
    drop: () => !w.shipped,
    'trash-file': () => !!p.trash?.length,
    'keep-file': () => !!p.trash?.length,
    'step-back': () => !shipped && w.step !== 'core',
    rework: () => talk && !!w.shipped && w.decided.scope === 'public' && !w.reworking,
    export: () => talk,
    'link-archive': () => note && !w.shipped,
  }
  const ok = need[action]
  if (ok && !ok()) return `いまの状態では「${action}」はできません`
  return null
}

/** サーバの中の作業が失敗したときの文 */
const FAILURE: Record<string, string> = {
  'note から取り込んでいます': '取り込めませんでした',
  '変更を記録しています': '記録できませんでした',
  'GitHub に送っています': 'GitHub に送れませんでした',
  'サイトを組み立てています': 'サイトに出せませんでした',
  '聴衆役が読んでいます': '聴衆役が読めませんでした',
  '1 つの HTML と PDF に書き出しています': '書き出せませんでした',
}

const STEP_NAMES: Record<Step, string> = { core: '伝えたいこと', outline: '構成', draft: '原稿', publish: '公開', storyboard: '絵コンテ', slides: 'スライド', present: '発表' }

/** 規範のファイルの最後の学びの見出し「(日付「題」)」。(同) の行はさかのぼって探す */
export function lastHeadOf(text: string): string | null {
  const lines = text.trimEnd().split('\n').filter((l) => l.startsWith('- ('))
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('- (同)')) continue
    return lines[i].match(/^- (\([^)]*\))/)?.[1] ?? null
  }
  return null
}

/** 学びの案の先頭に付いた「- 」「(同)」「(日付「題」)」を落とす。studio が付け直す */

const firstLine = (t?: string) => t?.split('\n').find((l) => l.trim())?.slice(0, 40)

/** 発表の題。トークの題か、フォルダの名前 (YYYY_MM_DD_タグ_演題) の演題 */
function talkTitle(work: Work): string {
  const site = siteTalkOf(work)
  if (site?.info.title) return site.info.title
  return work.talk?.dir?.split('_').slice(4).join(' ') ?? ''
}

/** 題が決まるまでの仮の題。最初に話した文の頭 */
function provisionalTitle(id: string) {
  const first = readChat(id).find((c) => c.role === 'you')?.text ?? ''
  const line = first.split('\n').find((l) => l.trim()) ?? ''
  return line.length > 32 ? `${line.slice(0, 32)}…` : line || '無題'
}

function sanitizeDir(name: string) {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

/** 絵コンテのステップに進むとき、トークのフォルダを作り、それまでに貼った画像を写す */
function prepareTalkDir(work: Work) {
  const dir = talkDirOf(work)
  if (!dir) return
  mkdirSync(join(dir, 'assets'), { recursive: true })
  const files = filesDir(work.id)
  if (existsSync(files)) for (const f of readdirSync(files)) if (!existsSync(join(dir, 'assets', f))) copyFileSync(join(files, f), join(dir, 'assets', f))
}

/** 発表の表紙。サイトの開発サーバが撮る og.png */
function talkCover(w: Work): string | undefined {
  const t = w.kind === 'talk' ? siteTalkOf(w) : null
  try {
    return t ? `${theSite().url}/${t.info.slug}/og.png` : undefined
  } catch {
    return undefined
  }
}

function archiveByKey(key: string) {
  return listArchives().find((a) => a.url?.endsWith(`/n/${key}`)) ?? null
}

/** 公開した原稿のフォルダを、作品の made/ に移す (制作の記録。正はアーカイブ) */
function moveToMade(work: Work) {
  const slug = work.note?.slug
  if (!slug || !existsSync(noteDir(slug))) return
  const made = madeDir(work.id)
  if (existsSync(made)) renameSync(made, `${made}-${Date.now()}`)
  renameSync(noteDir(slug), made)
}

/** GitHub にまだ送っていないコミットの数。上流が無いときは 0 */
function unpushedCount(): number {
  try {
    return Number(execFileSync('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: gitRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) || 0
  } catch {
    return 0
  }
}

/** 記録の対象のパス (リポジトリからの相対)。この作品が変えたファイルと、公開のトークのフォルダだけ */
function recordPaths(work: Work): string[] {
  const paths = [...(work.touched ?? [])]
  // 記録の対象を持つ前に出した記事は、取り込みで必ず変わるファイルを補う
  if (!paths.length && work.kind === 'note' && work.shipped?.ref && !work.recorded) paths.push(`articles/note/${work.shipped.ref}`, 'articles/note/slugs.json', 'articles/note/README.md')
  const talk = talkDirOf(work)
  if (talk && talk.startsWith(join(repoRoot, 'talks') + '/')) paths.push(talk.slice(repoRoot.length + 1))
  return paths.length ? paths : ['__nothing__']
}

const touch = (w: Work, ...paths: string[]) => (w.touched = [...new Set([...(w.touched ?? []), ...paths])])

/** git の変わったファイル。paths の下だけ */
export function gitChanges(paths: string[]): FileChange[] {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...paths], { cwd: gitRoot, encoding: 'utf8' }) as string
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3) }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------- ネタ

export function listNeta(): Neta[] {
  if (!existsSync(places.neta)) return []
  return readdirSync(places.neta)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const text = readFileSync(join(places.neta, file), 'utf8')
      const fm = text.match(/^---\n([\s\S]*?)\n---\n?/)
      let meta: any = {}
      try {
        meta = fm ? (YAML.parse(fm[1]) ?? {}) : {}
      } catch {}
      const body = fm ? text.slice(fm[0].length) : text
      const title = body.match(/^#\s+(.+)$/m)?.[1] ?? body.split('\n').find((l) => l.trim())?.slice(0, 40) ?? file
      return { file, title, text: body.trim(), at: file.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? file.slice(0, 10) : statSync(join(places.neta, file)).mtime.toISOString().slice(0, 10), workId: meta.work }
    })
    .filter((n) => !n.workId)
    .sort((a, b) => b.at.localeCompare(a.at))
}

export function addNeta(text: string): string {
  if (!text.trim()) throw invalid('ネタを入れてください')
  mkdirSync(places.neta, { recursive: true })
  const head = text.trim().split('\n')[0].slice(0, 40)
  const file = `${today()}-${Math.random().toString(36).slice(2, 6)}.md`
  writeFileSync(join(places.neta, file), `# ${head}\n\n${text.trim()}\n`)
  return file
}

function markNeta(file: string, workId: string) {
  const path = join(places.neta, basename(file))
  const text = readText(path)
  if (text === null) return
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/)
  let meta: any = {}
  try {
    meta = fm ? (YAML.parse(fm[1]) ?? {}) : {}
  } catch {}
  meta.work = workId
  writeFileSync(path, `---\n${yamlText(meta)}---\n${fm ? text.slice(fm[0].length) : text}`)
}

export function trashNeta(file: string) {
  const path = join(places.neta, basename(file))
  if (!existsSync(path)) throw invalid('そのネタはありません')
  mkdirSync(places.trash, { recursive: true })
  renameSync(path, join(places.trash, `${new Date().toISOString().replace(/[:.]/g, '-')}-neta-${basename(file)}`))
}

export const readNeta = (file: string) => readText(join(places.neta, basename(file))) ?? ''
export { workFile, isWork, PRIVATE }
