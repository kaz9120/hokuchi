// 企画シート (<置き場>/works/<id>/brief.yaml)。作品 1 本の段階ごとの欄・確定・AI の候補・完成にした日時を持つ。
// 人が読めて AI も直せる YAML のまま。知らない欄は消さずに残す (Claude Code が足すことがある)
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { Brief, BriefPatch, Kind } from '../../shared/api.ts'
import { places } from '../infra/config.ts'
import { invalid, notFound } from '../infra/errors.ts'
import { readVersioned, writeText, yamlText } from '../infra/files.ts'
import { linkSeed, readSeed } from './seeds.ts'

export const briefDir = (id: string) => join(places.works, id)
export const briefFile = (id: string) => join(places.works, id, 'brief.yaml')
const ID = /^[0-9A-Za-z][0-9A-Za-z_-]*$/
export const isBriefId = (s: string) => ID.test(s)

const now = () => new Date().toISOString()
/** 日付と短い乱数で id を作る (例: 2026-10-09-k3f9) */
const newId = () => `${now().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`

export function readBrief(id: string): { brief: Brief; version: string } | null {
  if (!isBriefId(id)) return null
  const { text, version } = readVersioned(briefFile(id))
  if (text === null) return null
  return { brief: (YAML.parse(text) ?? {}) as Brief, version }
}

/** 企画シートの一覧。触った順 */
export function listBriefs(): { brief: Brief; version: string }[] {
  if (!existsSync(places.works)) return []
  return readdirSync(places.works)
    .map((id) => readBrief(id))
    .filter((x): x is { brief: Brief; version: string } => !!x)
    .sort((a, b) => (a.brief.updatedAt < b.brief.updatedAt ? 1 : -1))
}

/** 作品を始める。ネタから始めるときは、ネタの中身を段階 1 の欄に写し、ネタに作品を記録する */
export function createBrief(kind: Kind, seedId?: string): Brief {
  const id = newId()
  const seed = seedId ? readSeed(seedId) : null
  if (seedId && !seed) throw notFound(`ネタ（${seedId}）が見つかりません`)
  const brief: Brief = { id, kind, title: '', createdAt: now(), updatedAt: now(), seedId: seed?.id ?? null, fields: {}, gates: {}, candidates: {} }
  if (seed) brief.fields.happening = [seed.happening, seed.why && `なぜそう感じたか: ${seed.why}`].filter(Boolean).join('\n')
  mkdirSync(briefDir(id), { recursive: true })
  writeText(briefFile(id), yamlText(brief))
  if (seed) linkSeed(seed.id, id)
  return brief
}

/**
 * 企画シートを書き換える。id・種類・作成日時は変えない。
 * base を渡したときは、読んだ版と違えば書かない。fields と gates は、渡した欄だけを変える (null で消す)。
 * finishedAt に null を渡すと消す (下書きに戻す)
 */
export function writeBrief(id: string, set: Partial<Omit<Brief, 'fields' | 'gates' | 'finishedAt'>> & { fields?: Record<string, unknown>; gates?: BriefPatch['set']['gates']; finishedAt?: string | null }, base?: string): { brief: Brief; version: string } {
  const cur = readBrief(id)
  if (!cur) throw notFound(`作品（${id}）が見つかりません`)
  const prev = cur.brief
  const merge = (a: Record<string, any> = {}, b?: Record<string, unknown>) => {
    if (!b) return a
    const out = { ...a }
    for (const [k, v] of Object.entries(b)) {
      if (v === null || v === undefined) delete out[k]
      else out[k] = v
    }
    return out
  }
  const { fields, gates, finishedAt, ...rest } = set
  const next: Brief = { ...prev, ...rest, fields: merge(prev.fields, fields), gates: merge(prev.gates, gates) as Brief['gates'], id: prev.id, kind: prev.kind, createdAt: prev.createdAt, updatedAt: now() }
  if (finishedAt !== undefined) {
    if (finishedAt === null) delete next.finishedAt
    else next.finishedAt = finishedAt
  }
  writeText(briefFile(id), yamlText(next), base)
  return readBrief(id)!
}

/** 画面から来た直し。直せる欄だけを通す */
export function patchBrief(id: string, patch: BriefPatch) {
  const { title, fields, gates } = patch.set ?? {}
  if (title !== undefined && typeof title !== 'string') throw invalid('title は文字列にしてください')
  return writeBrief(id, { ...(title !== undefined && { title }), ...(fields && { fields }), ...(gates && { gates }) }, patch.base)
}
