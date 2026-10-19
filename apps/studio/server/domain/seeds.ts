// ネタ (<置き場>/seeds/<id>.yaml)。作品になる前の種。ネタから始めた作品は workIds に残す
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Seed } from '../../shared/api.ts'
import { places } from '../infra/config.ts'
import { invalid } from '../infra/errors.ts'
import { readYaml, writeText, yamlText } from '../infra/files.ts'

const now = () => new Date().toISOString()
const newId = () => `${now().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`
const file = (id: string) => join(places.seeds, `${id}.yaml`)

export function listSeeds(): Seed[] {
  if (!existsSync(places.seeds)) return []
  return readdirSync(places.seeds)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => readYaml<Seed>(join(places.seeds, f)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function readSeed(id: string): Seed | null {
  if (!/^[0-9A-Za-z_-]+$/.test(id)) return null
  return existsSync(file(id)) ? readYaml<Seed>(file(id)) : null
}

function save(seed: Seed) {
  mkdirSync(places.seeds, { recursive: true })
  writeText(file(seed.id), yamlText(seed))
  return seed
}

/** ネタを書き留める */
export function addSeed({ happening, why }: { happening?: string; why?: string }): Seed {
  const h = String(happening ?? '').trim()
  if (!h) throw invalid('気になったことを書いてください')
  return save({ workIds: [], happening: h, why: String(why ?? '').trim(), id: newId(), createdAt: now() })
}

export function linkSeed(seedId: string, workId: string) {
  const seed = readSeed(seedId)
  if (seed) save({ ...seed, workIds: [...(seed.workIds ?? []), workId] })
}

/** 作品をごみ箱に移したとき、ネタの workIds から外す */
export function unlinkWork(workId: string) {
  for (const seed of listSeeds()) if (seed.workIds?.includes(workId)) save({ ...seed, workIds: seed.workIds.filter((w) => w !== workId) })
}
