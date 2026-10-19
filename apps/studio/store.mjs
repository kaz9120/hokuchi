// 作品の企画シートとネタ帳の置き場。公開リポジトリの外 (既定は ~/Hobby/hokuchi-private) に置く (ADR-0036)。
// 環境変数 HOKUCHI_PRIVATE で場所を変えられる。中身は人が読めて、AI も直せるように YAML にする。
//
//   <置き場>/works/<id>/brief.yaml   作品 1 本の企画シート (段階ごとの欄・関門・AI の候補・完成にした日時 finishedAt)
//   <置き場>/talks/<トーク>/          非公開 (社内向け) の発表。studio は読むが、サイトには載せない (ADR-0041・ADR-0043)
//   <置き場>/seeds/<id>.yaml         ネタ 1 件
//   <置き場>/notes/<slug>/           記事の原稿。中身は apps/studio/draft.mjs と tools/notes/src/drafts.mjs (ADR-0046)
//   <置き場>/trash/<日時>-<id>/       削除した下書き。元の置き場と同じ形 (works/<id>/・talks/<トーク>/・notes/<slug>/) で残す (ADR-0044)
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import YAML from 'yaml'

export const PRIVATE = process.env.HOKUCHI_PRIVATE ?? join(homedir(), 'Hobby', 'hokuchi-private')
const worksDir = join(PRIVATE, 'works')
const seedsDir = join(PRIVATE, 'seeds')

/** 日付と短い乱数で id を作る (例: 2026-10-09-k3f9) */
const newId = () => `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`
const now = () => new Date().toISOString()
const readYaml = (file) => YAML.parse(readFileSync(file, 'utf8')) ?? {}
const writeYaml = (file, data) => writeFileSync(file, YAML.stringify(data, { lineWidth: 0 }))

// ---------------------------------------------------------------- 作品
export function listWorks() {
  if (!existsSync(worksDir)) return []
  return readdirSync(worksDir)
    .filter((id) => existsSync(join(worksDir, id, 'brief.yaml')))
    .map((id) => readYaml(join(worksDir, id, 'brief.yaml')))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function readWork(id) {
  const file = join(worksDir, id, 'brief.yaml')
  return existsSync(file) ? readYaml(file) : null
}

/** トークに紐づく作品 (企画シートの talk に、トークの slug を持つもの)。無ければ null (ADR-0038) */
export function workOfTalk(slug) {
  return listWorks().find((w) => w.talk === slug) ?? null
}

/** 作品を始める。kind は talk (発表) か note (記事)。ネタから始めるときは seedId を渡す */
export function createWork(kind, seedId) {
  const id = newId()
  const seed = seedId ? readSeed(seedId) : null
  const brief = { id, kind, title: '', createdAt: now(), updatedAt: now(), seedId: seed?.id ?? null, fields: {}, gates: {}, candidates: {} }
  // ネタの中身を、種の段階の欄に写しておく
  if (seed) brief.fields.happening = [seed.happening, seed.why && `なぜそう感じたか: ${seed.why}`].filter(Boolean).join('\n')
  mkdirSync(join(worksDir, id), { recursive: true })
  writeYaml(join(worksDir, id, 'brief.yaml'), brief)
  if (seed) saveSeed({ ...seed, workIds: [...(seed.workIds ?? []), id] })
  return brief
}

/** 画面から来た企画シートで置き換える。id・種類・作成日時は変えさせない。finishedAt に null が来たら、下書きに戻す (ADR-0045) */
export function saveWork(id, next) {
  const prev = readWork(id)
  if (!prev) throw new Error(`作品 ${id} がありません`)
  const brief = { ...prev, ...next, id: prev.id, kind: prev.kind, createdAt: prev.createdAt, updatedAt: now() }
  if (brief.finishedAt == null) delete brief.finishedAt
  writeYaml(join(worksDir, id, 'brief.yaml'), brief)
  return brief
}

/**
 * 下書きを削除する。消さずに、ごみ箱 (<置き場>/trash/<日時>-<id>/) に移す (ADR-0044)。
 * talkDir は、リポジトリの外に置いた紐づくトーク。noteDir は、紐づく記事の原稿 (いつもリポジトリの外。ADR-0046)。リポジトリの中のファイルは呼ぶ側が渡さない (git の操作が要るので触らない)。
 * ネタの workIds からも外す。戻り値は、移した先のディレクトリ
 */
export function trashWork(id, { talkDir = null, noteDir = null } = {}) {
  if (!readWork(id)) throw new Error(`作品 ${id} がありません`)
  const to = join(PRIVATE, 'trash', `${now().slice(0, 19).replace(/:/g, '-')}-${id}`)
  mkdirSync(join(to, 'works'), { recursive: true })
  renameSync(join(worksDir, id), join(to, 'works', id))
  if (talkDir) {
    mkdirSync(join(to, 'talks'), { recursive: true })
    renameSync(talkDir, join(to, 'talks', basename(talkDir)))
  }
  if (noteDir) {
    mkdirSync(join(to, 'notes'), { recursive: true })
    renameSync(noteDir, join(to, 'notes', basename(noteDir)))
  }
  for (const seed of listSeeds()) if (seed.workIds?.includes(id)) saveSeed({ ...seed, workIds: seed.workIds.filter((w) => w !== id) })
  return to
}

/**
 * 公開済みの記事の改稿をやめる (ADR-0047)。改稿の原稿だけを、ごみ箱 (<置き場>/trash/<日時>-revise-<slug>/notes/<slug>/) に移す。
 * 企画シートとアーカイブには触らない。戻り値は、移した先のディレクトリ
 */
export function trashRevision(noteDir) {
  const to = join(PRIVATE, 'trash', `${now().slice(0, 19).replace(/:/g, '-')}-revise-${basename(noteDir)}`)
  mkdirSync(join(to, 'notes'), { recursive: true })
  renameSync(noteDir, join(to, 'notes', basename(noteDir)))
  return to
}

// ---------------------------------------------------------------- ネタ
export function listSeeds() {
  if (!existsSync(seedsDir)) return []
  return readdirSync(seedsDir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => readYaml(join(seedsDir, f)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function readSeed(id) {
  const file = join(seedsDir, `${id}.yaml`)
  return existsSync(file) ? readYaml(file) : null
}

/** ネタを足す・直す。id が無ければ新しく作る */
export function saveSeed(seed) {
  mkdirSync(seedsDir, { recursive: true })
  const s = { workIds: [], ...seed, id: seed.id ?? newId(), createdAt: seed.createdAt ?? now() }
  writeYaml(join(seedsDir, `${s.id}.yaml`), s)
  return s
}
