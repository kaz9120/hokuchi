// ごみ箱 (<置き場>/trash/)。消さずに移すので、間違えても戻せる。
// 名前は <日時>-<何を>-<id か slug> の 1 通り。中は元の置き場と同じ形 (works/<id>/・talks/<トーク>/・notes/<slug>/)
import { mkdirSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'
import { places } from '../infra/config.ts'

export type TrashWhat = 'work' | 'revision'
export type TrashItem = { from: string; into: 'works' | 'talks' | 'notes' }

export function moveToTrash(what: TrashWhat, name: string, items: TrashItem[]) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const to = join(places.trash, `${stamp}-${what}-${name}`)
  for (const { from, into } of items) {
    mkdirSync(join(to, into), { recursive: true })
    renameSync(from, join(to, into, basename(from)))
  }
  return to
}
