// 作品ごとの Claude の実行を回す。1 作品に 1 本、全体で同時に 2 本まで。
//
// 実行の始まりと終わりは runs.jsonl に書く (番と失敗はここから導く)。実行の前に作品の YAML の写しを取り、
// どう終わっても読めなくなったファイルは写しに戻す。話者が直した所は、返事を終えたときだけ消す。
// 起動できない・途中で終わったときは 1 回だけやり直す。絵コンテとスライドは、時間切れなら同じセッションで 3 回まで続ける
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Anchor, Live, Step } from '../../shared/types.ts'
import { changesText, readDenyOf, systemPrompt, writableOf } from '../claude/context.ts'
import { startRun, type Run } from '../claude/runner.ts'
import { noteDir, talkDirOf } from '../store/places.ts'
import { changedSince, saveStamps } from '../store/stamps.ts'
import { brokenYaml, sessionCost } from '../store/works.ts'
import { appendChat, appendRun, openRuns, proposalsFile, queueFile, readProposals, readWork, restoreBroken, snapshot, updateWork, writeProposals } from '../store/works.ts'

export const MAX_PARALLEL = 2
const AUTO_CONTINUE: Step[] = ['storyboard', 'slides']

export type Job = {
  /** 話者の文 (場所の札・直した所はここに入れずに渡す) */
  prompt: string
  step: Step | 'shipped'
  /** 新しいセッションで始める (ステップが進んだとき) */
  fresh?: boolean
  /** この 1 回だけ書いてよい場所 (部品を直すのを許したとき) */
  extraWritable?: string[]
  /** 実行を始めるときに呼ぶ。「終わったら送る」文は、ここで初めて会話と材料に書く */
  onStart?: () => void
  /** 画面に出す、待っている文 */
  label?: string
  /** studio が止まっても残す、話者の文 (queue.json に書く。起動したら送らずに残した文として戻す) */
  keep?: Kept
}

export type Kept = { text: string; saved: string[]; anchors: Anchor[]
}

type Slot = { live: Live; run: Run | null; queue: Job[]; waiting: Job | null; attempt: number; continued: number; interrupting?: boolean; repaired?: boolean }

export class Conductor {
  private slots = new Map<string, Slot>()
  private waitingGlobal: string[] = []
  private notify: (id: string) => void
  /** 実行が終わったときに呼ぶ。返事で終わったら ok が true */
  private onDone: (id: string, step: Step | 'shipped', ok: boolean) => void
  constructor(notify: (id: string) => void, onDone: (id: string, step: Step | 'shipped', ok: boolean) => void = () => {}) {
    // 待ち行列が変わるところでは必ず知らせるので、知らせるたびに待っている話者の文を書き出す
    this.notify = (id) => {
      this.persist(id)
      notify(id)
    }
    this.onDone = onDone
  }

  private persist(id: string) {
    const s = this.slots.get(id)
    if (!s) return
    const kept = [s.waiting, ...s.queue].flatMap((j) => (j?.keep ? [j.keep] : []))
    try {
      if (kept.length) writeFileSync(queueFile(id), JSON.stringify(kept, null, 2))
      else rmSync(queueFile(id), { force: true })
    } catch {}
  }

  /** 起動したとき、前に待たせていた文を「送らずに残した文」として戻す */
  restore(id: string, jobs: Job[]) {
    if (!jobs.length) return
    const s = this.slot(id)
    s.queue = jobs
    s.live.queuedText = this.queuedLabel(s)
    s.live.held = true
  }

  private queuedLabel(s: Slot) {
    return s.queue.map((j) => j.label ?? j.prompt).join('\n\n') || null
  }

  /** 前の実行が止まったので送らずに残した文を、いま送る */
  flush(id: string) {
    const s = this.slots.get(id)
    if (!s || s.live.state !== 'idle' || !s.queue.length) return
    const next = s.queue.shift()!
    s.live.queuedText = this.queuedLabel(s)
    s.live.held = false
    this.begin(id, next)
  }

  /** 送らずに残した文を捨てる */
  drop(id: string) {
    const s = this.slots.get(id)
    if (!s) return
    s.queue = []
    s.live.queuedText = null
    s.live.held = false
    this.notify(id)
  }

  live(id: string): Live {
    return this.slots.get(id)?.live ?? { state: 'idle', text: '', tools: [] }
  }

  /** 走っている・順番待ちの実行の数。立て直す前に 0 になるのを待つため */
  activeCount(): number {
    return [...this.slots.values()].filter((s) => s.live.state !== 'idle').length
  }

  busy(id: string): boolean {
    const s = this.slots.get(id)
    return !!s && s.live.state !== 'idle'
  }

  private slot(id: string): Slot {
    let s = this.slots.get(id)
    if (!s) this.slots.set(id, (s = { live: { state: 'idle', text: '', tools: [] }, run: null, queue: [], waiting: null, attempt: 0, continued: 0 }))
    return s
  }

  private running() {
    return [...this.slots.values()].filter((s) => s.live.state === 'running').length
  }

  /** 頼む。実行中なら「終わったら送る」として後ろに並べる */
  ask(id: string, job: Job) {
    const s = this.slot(id)
    if (s.live.state !== 'idle') {
      s.queue.push(job)
      s.live.queuedText = this.queuedLabel(s)
      this.notify(id)
      return
    }
    this.begin(id, job)
  }

  /** 止めて頼む */
  interrupt(id: string, job: Job) {
    const s = this.slot(id)
    s.queue = [job]
    s.live.queuedText = this.queuedLabel(s)
    s.interrupting = true
    if (s.run) s.run.stop()
    else if (s.live.state === 'queued') {
      this.waitingGlobal = this.waitingGlobal.filter((x) => x !== id)
      s.live = { state: 'idle', text: '', tools: [] }
      this.begin(id, s.queue.shift()!)
    } else this.begin(id, s.queue.shift()!)
  }

  stop(id: string) {
    const s = this.slots.get(id)
    if (!s) return
    s.queue = []
    s.live.queuedText = null
    if (s.run) s.run.stop()
    else if (s.live.state === 'queued') {
      this.waitingGlobal = this.waitingGlobal.filter((x) => x !== id)
      s.waiting = null
      s.live = { state: 'idle', text: '', tools: [] }
      appendChat(id, { role: 'system', text: '順番待ちをやめました', tone: 'info' })
      this.notify(id)
    }
  }

  private begin(id: string, job: Job) {
    const s = this.slot(id)
    if (this.running() >= MAX_PARALLEL) {
      s.waiting = job
      s.live = { state: 'queued', text: '', tools: [], queuedText: s.live.queuedText ?? null }
      if (!this.waitingGlobal.includes(id)) this.waitingGlobal.push(id)
      this.notify(id)
      return
    }
    s.attempt = 0
    s.continued = 0
    s.repaired = false
    job.onStart?.()
    this.launch(id, job)
  }

  private launch(id: string, job: Job) {
    const s = this.slot(id)
    const outside = changedSince(readWork(id).work)
    if (outside.length)
      updateWork(id, (w) => {
        const list = (w.changes ??= [])
        for (const f of outside.slice(0, 20)) if (!list.some((c) => c.where === f)) list.push({ kind: 'outside', where: f, at: new Date().toISOString() })
      })
    const { work } = readWork(id)
    const step = job.step
    const changes = work.changes ?? []
    const usedChanges = changes.length
    const { allow, deny } = writableOf(work, step, job.extraWritable)
    const sessionId = job.fresh ? null : (work.sessions?.[step] ?? null)
    // ask は返事ごとに書き直してもらう。古いものが残らないよう、実行の前に消す
    writeProposals(id, (p) => {
      delete p.ask
    })
    const watched = [proposalsFile(id)]
    if (work.note?.slug) for (const f of ['outline.yaml', 'feedback.yaml', 'readers.yaml']) watched.push(join(noteDir(work.note.slug), f))
    const talk = talkDirOf(work)
    if (talk) for (const f of ['feedback.yaml', 'readers.yaml']) watched.push(join(talk, f))
    const snap = snapshot(watched)
    const runId = Math.random().toString(36).slice(2, 10)
    s.live = { state: 'running', text: '', tools: [], startedAt: new Date().toISOString(), queuedText: s.live.queuedText ?? null }
    this.notify(id)
    let currentSession = sessionId
    s.run = startRun({
      prompt: changesText(changes) + job.prompt,
      sessionId,
      system: systemPrompt(work, step, !sessionId),
      writable: allow,
      denyWrite: deny,
      denyRead: readDenyOf(work, step),
      onEvent: (e) => {
        if (e.type === 'started') {
          currentSession = e.sessionId
          appendRun(id, { id: runId, type: 'start', step, what: 'claude', sessionId: e.sessionId })
          if (!sessionId) updateWork(id, (w) => ((w.sessions ??= {})[step] = e.sessionId))
        } else if (e.type === 'delta') {
          s.live.text += e.text
          this.notify(id)
        } else if (e.type === 'tool') {
          s.live.tools.push(e.summary)
          this.notify(id)
        } else if (e.type === 'done' || e.type === 'failed') {
          const restored = restoreBroken(snap)
          s.run = null
          saveStamps(readWork(id).work)
          const tools = s.live.tools
          if (e.type === 'done') {
            const spent = Math.max(0, e.costUsd - sessionCost(id, e.sessionId))
            appendRun(id, { id: runId, type: 'end', step, what: 'claude', result: 'done', sessionId: e.sessionId, costUsd: e.costUsd })
            appendChat(id, { role: 'claude', text: e.text, tools, costUsd: spent })
            // 添えた直した所だけを消す (実行中に足された分は残す)
            if (usedChanges) updateWork(id, (w) => (w.changes = (w.changes ?? []).slice(usedChanges)))
            if (readProposals(id).broken) appendChat(id, { role: 'system', text: '候補のファイルを読めなかったので、実行の前の形に戻しました', tone: 'error' })
          } else {
            const timeout = /分たっても|返ってこなかった/.test(e.message)
            const result = timeout ? 'timeout' : e.stopped ? 'stopped' : 'failed'
            appendRun(id, { id: runId, type: 'end', step, what: 'claude', result, message: e.message, sessionId: currentSession ?? undefined })
            if (s.live.text.trim()) appendChat(id, { role: 'claude', text: s.live.text.trim(), tools })
            // 絵コンテとスライドは、時間切れなら同じセッションで続ける
            if (timeout && AUTO_CONTINUE.includes(step as Step) && s.continued < 3 && !s.queue.length) {
              s.continued++
              appendChat(id, { role: 'system', text: `${e.message}。続きを頼みます（${s.continued}/3 回目）`, tone: 'info' })
              this.launch(id, { prompt: '続けて。区切りのよい所まで進め、返事に進み具合を書いて', step })
              return
            }
            if (result === 'failed' && s.attempt === 0) {
              s.attempt++
              // 続きから話せなかった (セッションが無い・壊れた) ときに備え、やり直しは新しいセッションで始める
              appendChat(id, { role: 'system', text: `${e.message}。新しいセッションで、もう一度だけ試します`, tone: 'info' })
              this.launch(id, { ...job, fresh: true })
              return
            }
            appendChat(id, { role: 'system', text: result === 'stopped' ? '途中で止めました。書かれたファイルはそのまま残っています' : e.message, tone: result === 'stopped' ? 'info' : 'error' })
          }
          if (restored.length) appendChat(id, { role: 'system', text: `読めなくなったファイルを実行の前の形に戻しました: ${restored.map((f) => f.split('/').slice(-2).join('/')).join('、')}`, tone: 'error' })
          // 実行の前に無かったファイルが読めないときは、写しに戻せないので 1 回だけ直してもらう
          const broken = e.type === 'done' && !s.repaired ? brokenYaml(watched) : []
          if (broken.length) {
            s.repaired = true
            appendChat(id, { role: 'system', text: `YAML として読めないファイルがあるので、直してもらいます: ${broken.map((b) => b.file.split('/').slice(-2).join('/')).join('、')}`, tone: 'info' })
            this.launch(id, { prompt: `次のファイルが YAML として読めません。中身は変えずに、書き方だけを直して (値に「: 」などを含むなら引用符で囲む)。\n${broken.map((b) => `- ${b.file}: ${b.error}`).join('\n')}`, step })
            return
          }
          const ok = e.type === 'done'
          s.live = { state: 'idle', text: '', tools: [], queuedText: this.queuedLabel(s) }
          this.onDone(id, step, ok)
          // 失敗したら「終わったら送る」文は送らずに残し、話者に送るか捨てるかを決めてもらう
          const interrupted = !!s.interrupting
          s.interrupting = false
          if (!ok && !interrupted && s.queue.length) {
            s.live.held = true
            this.notify(id)
          } else {
            const next = s.queue.shift()
            if (next) {
              s.live.queuedText = this.queuedLabel(s)
              this.begin(id, next)
            } else this.notify(id)
          }
          this.wakeWaiting()
        }
      },
    })
  }

  private wakeWaiting() {
    while (this.running() < MAX_PARALLEL && this.waitingGlobal.length) {
      const id = this.waitingGlobal.shift()!
      const s = this.slots.get(id)
      if (!s?.waiting) continue
      const job = s.waiting
      s.waiting = null
      s.live = { state: 'idle', text: '', tools: [], queuedText: s.live.queuedText }
      s.attempt = 0
      s.continued = 0
      job.onStart?.()
      this.launch(id, job)
    }
  }

  /** 起動時の後始末。終わりの記録が無い実行を「中断した」にする */
  recover(ids: string[]) {
    for (const id of ids) {
      for (const r of openRuns(id)) {
        appendRun(id, { id: r.id, type: 'end', step: r.step, what: r.what, result: 'interrupted', message: 'studio が止まったので中断しました' })
        appendChat(id, { role: 'system', text: 'studio が止まったので、Claude の作業を中断しました。続けるときは、もう一度話しかけてください', tone: 'error' })
      }
    }
  }

  /** テストと終了のため。走っている実行を全部止める */
  async stopAll() {
    for (const s of this.slots.values()) {
      s.queue = []
      s.run?.stop()
    }
  }
}
