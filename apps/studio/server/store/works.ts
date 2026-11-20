// 作品の置き場 (hokuchi-private/works/<id>/) の読み書き。
//
//   work.yaml       作品の正。サーバだけが書く (Claude の権限では拒否する)
//   proposals.yaml  Claude が書く候補と ask
//   material.md     話者が話した文と添付を、原文のまま溜める。毎回の Claude に全文で渡す
//   chat.jsonl      会話の表示用の記録
//   runs.jsonl      実行の記録。番と失敗を導く
//   files/          話者が貼った画像
//   made/           公開した記事の原稿のフォルダ (制作の記録。正はアーカイブ)
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { ChatEntry, Kind, Proposals, Step, Work } from '../../shared/types.ts'
import { places } from '../infra/config.ts'
import { conflict, notFound } from '../infra/errors.ts'
import { readText, versionOf, writeText, yamlText } from '../infra/files.ts'

export const ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9]{4}$/
export const workDir = (id: string) => join(places.works, id)
export const workFile = (id: string) => join(workDir(id), 'work.yaml')
export const proposalsFile = (id: string) => join(workDir(id), 'proposals.yaml')
export const materialFile = (id: string) => join(workDir(id), 'material.md')
export const chatFile = (id: string) => join(workDir(id), 'chat.jsonl')
export const runsFile = (id: string) => join(workDir(id), 'runs.jsonl')
export const filesDir = (id: string) => join(workDir(id), 'files')
export const madeDir = (id: string) => join(workDir(id), 'made')

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
const now = () => new Date().toISOString()

export function newId(): string {
  for (;;) {
    const id = `${today()}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`
    if (!existsSync(workDir(id))) return id
  }
}

const HEADER = '# 作品の正。studio のサーバだけが書く。Claude は proposals.yaml に候補を書く\n'

export function isWork(id: string) {
  return ID.test(id) && existsSync(workFile(id))
}

export function listWorkIds(): string[] {
  if (!existsSync(places.works)) return []
  return readdirSync(places.works).filter(isWork).sort()
}

export function readWork(id: string): { work: Work; version: string } {
  const text = readText(workFile(id))
  if (text === null) throw notFound(`作品（${id}）が見つかりません`)
  const work = (YAML.parse(text) ?? {}) as Work
  work.decided ??= {}
  // 記事の構成の段は 2026-11 に外した。その段にいた作品は原稿の段で続ける
  if (work.kind === 'note' && (work.step as string) === 'outline') work.step = 'draft'
  return { work, version: versionOf(text) }
}

/**
 * その日に初めて書く前に、作品の主なファイルを history/<日付>/ に写す。
 * hokuchi-private は git の管理下にないので、サーバの不具合で作品の正を壊しても戻せるようにする
 */
function keepHistory(id: string) {
  const day = today()
  const dir = join(workDir(id), 'history', day)
  if (existsSync(dir)) return
  mkdirSync(dir, { recursive: true })
  for (const f of ['work.yaml', 'proposals.yaml', 'material.md', 'chat.jsonl']) {
    const from = join(workDir(id), f)
    if (existsSync(from)) copyFileSync(from, join(dir, f))
  }
}

/** 作品を書き換える。base を渡したときは、読んだ版と違えば書かない (409) */
export function updateWork(id: string, fn: (w: Work) => void, base?: string): Work {
  const { work, version } = readWork(id)
  if (base !== undefined && base !== version) throw conflict()
  keepHistory(id)
  fn(work)
  work.updatedAt = now()
  writeText(workFile(id), HEADER + yamlText(work))
  return work
}

export function createWork(kind: Kind, title = ''): Work {
  const id = newId()
  const work: Work = { id, kind, title, createdAt: now(), updatedAt: now(), step: 'core', decided: kind === 'talk' ? { scope: 'internal' } : {} }
  if (kind === 'note') work.note = { slug: id }
  mkdirSync(filesDir(id), { recursive: true })
  writeText(workFile(id), HEADER + yamlText(work))
  writeText(proposalsFile(id), PROPOSALS_HEADER)
  writeText(materialFile(id), `# 材料\n\n話者が話したことと貼ったものを、原文のまま溜める。\n`)
  return work
}

const PROPOSALS_HEADER = `# Claude が書く候補。話者は studio の画面で選んで確定する。形は studio の README を見る\n`

export function readProposals(id: string): { proposals: Proposals; version: string; broken: boolean } {
  const text = readText(proposalsFile(id))
  try {
    return { proposals: (YAML.parse(text ?? '') ?? {}) as Proposals, version: versionOf(text), broken: false }
  } catch {
    return { proposals: {}, version: versionOf(text), broken: true }
  }
}

export function writeProposals(id: string, fn: (p: Proposals) => void) {
  const { proposals } = readProposals(id)
  fn(proposals)
  // 空のときに {} と書くと、Claude が後ろに書き足したとき YAML として読めなくなる
  writeText(proposalsFile(id), PROPOSALS_HEADER + (Object.keys(proposals).length ? yamlText(proposals) : ''))
}

// ---------------------------------------------------------------- 材料と会話

const STEP_NAME: Record<Step, string> = { core: '伝えたいこと', outline: '構成', draft: '原稿', publish: '公開', storyboard: '絵コンテ', slides: 'スライド', present: '発表' }

export function appendMaterial(id: string, step: Step, text: string, files: string[] = []) {
  const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 16)
  const lines = [`\n## ${at}（${STEP_NAME[step]}）\n`, text.trim()]
  if (files.length) lines.push('', ...files.map((f) => `- 添付: ${f}`))
  appendFileSync(materialFile(id), lines.join('\n') + '\n')
}

export const readMaterial = (id: string) => readText(materialFile(id)) ?? ''

export function readChat(id: string): ChatEntry[] {
  const text = readText(chatFile(id))
  if (!text) return []
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as ChatEntry]
      } catch {
        return []
      }
    })
}

export function appendChat(id: string, entry: Omit<ChatEntry, 'id' | 'at'> & { at?: string }): ChatEntry {
  const e: ChatEntry = { id: Math.random().toString(36).slice(2, 10), at: now(), ...entry }
  mkdirSync(workDir(id), { recursive: true })
  appendFileSync(chatFile(id), JSON.stringify(e) + '\n')
  return e
}

// ---------------------------------------------------------------- 実行の記録

export type RunRecord = {
  id: string
  at: string
  type: 'start' | 'end'
  step: Step | 'shipped'
  /** reads は聴衆役の読み、ingest は取り込み、claude は会話 */
  what: 'claude' | 'reads' | 'ingest' | 'deploy'
  result?: 'done' | 'failed' | 'stopped' | 'timeout' | 'interrupted'
  message?: string
  sessionId?: string
  costUsd?: number
}

export function readRuns(id: string): RunRecord[] {
  const text = readText(runsFile(id))
  if (!text) return []
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as RunRecord]
      } catch {
        return []
      }
    })
}

export function appendRun(id: string, r: Omit<RunRecord, 'at'>) {
  appendFileSync(runsFile(id), JSON.stringify({ at: now(), ...r }) + '\n')
}

/** 始まりの記録があって終わりの記録が無い実行 */
export function openRuns(id: string): RunRecord[] {
  const open = new Map<string, RunRecord>()
  for (const r of readRuns(id)) {
    if (r.type === 'start') open.set(r.id, r)
    else open.delete(r.id)
  }
  return [...open.values()]
}

/**
 * 作品の費用。claude -p が返す費用はセッションの累計なので、セッションごとに最後の値を取って足す。
 * 聴衆役の読みなど、セッションを持たない実行はそのまま足す
 */
/** 待たせている話者の文。studio が止まっても残すため */
export const queueFile = (id: string) => join(workDir(id), 'queue.json')
export function readQueue(id: string): unknown[] {
  try {
    const v = JSON.parse(readFileSync(queueFile(id), 'utf8'))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function costOf(id: string): number {
  const bySession = new Map<string, number>()
  let other = 0
  for (const r of readRuns(id)) {
    if (r.type !== 'end' || !r.costUsd) continue
    if (r.what === 'claude' && r.sessionId) bySession.set(r.sessionId, Math.max(bySession.get(r.sessionId) ?? 0, r.costUsd))
    else other += r.costUsd
  }
  return [...bySession.values()].reduce((s, v) => s + v, other)
}

/** このセッションで前に記録した累計の費用。1 回分の費用は、いまの累計との差 */
export function sessionCost(id: string, sessionId: string): number {
  return readRuns(id).reduce((m, r) => (r.type === 'end' && r.what === 'claude' && r.sessionId === sessionId ? Math.max(m, r.costUsd ?? 0) : m), 0)
}

// ---------------------------------------------------------------- 巻き戻し

/** 実行の前に取る写し。YAML として読めなくなったファイルを戻すため */
export function snapshot(files: string[]): Map<string, string | null> {
  return new Map(files.map((f) => [f, readText(f)]))
}

/** YAML として読めないファイルと、その理由。実行の前に無かったファイルは写しに戻せないので、直してもらう */
export function brokenYaml(files: string[]): { file: string; error: string }[] {
  const out: { file: string; error: string }[] = []
  for (const file of files) {
    const text = readText(file)
    if (text === null) continue
    const doc = YAML.parseDocument(text)
    if (doc.errors.length) out.push({ file, error: doc.errors[0].message.split('\n')[0] })
  }
  return out
}

/** 写しのうち、YAML として読めなくなったものを戻す。戻したファイルの名前を返す */
export function restoreBroken(snap: Map<string, string | null>): string[] {
  const restored: string[] = []
  for (const [file, before] of snap) {
    const cur = readText(file)
    if (cur === null || cur === before) continue
    try {
      YAML.parse(cur)
    } catch {
      if (before === null) continue
      writeFileSync(file, before)
      restored.push(file)
    }
  }
  return restored
}

export const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
