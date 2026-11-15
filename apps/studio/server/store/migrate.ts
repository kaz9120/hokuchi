// 旧 studio の企画シート (works/<id>/brief.yaml) を、作品 (work.yaml) に写す。元のファイルは残す。
// 記事とアーカイブは 1 対 1 で決まるときだけ結ぶ。同じ名前の記事が何本もあるとき (月次の振り返り) は、
// 企画シートを作った日から 14 日以内に公開された最初の 1 本に限り結び、結んだ理由を会話に残す
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { Decided, Step, Work } from '../../shared/types.ts'
import { places } from '../infra/config.ts'
import { readText, writeText, yamlText } from '../infra/files.ts'
import { theSite } from '../infra/site.ts'
import { listArchives } from './archive.ts'
import { appendChat, ID, proposalsFile, workFile } from './works.ts'
import { noteDir } from './places.ts'

const minutesOf = (s?: string) => {
  const m = String(s ?? '').match(/(\d+)\s*分/)
  return m ? Number(m[1]) : undefined
}

export function migrate(): string[] {
  if (!existsSync(places.works)) return []
  const done: string[] = []
  for (const id of readdirSync(places.works)) {
    if (!ID.test(id)) continue
    const briefFile = join(places.works, id, 'brief.yaml')
    if (!existsSync(briefFile) || existsSync(workFile(id))) continue
    let b: any
    try {
      b = YAML.parse(readText(briefFile) ?? '') ?? {}
    } catch {
      continue
    }
    const f = b.fields ?? {}
    const notes: string[] = []
    const decided: Decided = {}
    const core = b.gates?.oneLiner?.value ?? f.oneLiner
    if (core) decided.core = core
    let step: Step = 'core'
    const work: Work = { id, kind: b.kind === 'talk' ? 'talk' : 'note', title: b.title ?? '', createdAt: b.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), step, decided, migratedFrom: 'brief.yaml' }
    if (work.kind === 'note') {
      if (f.readerWho || f.readerTrouble || f.readerKnows) decided.reader = { who: f.readerWho, trouble: f.readerTrouble, knows: f.readerKnows }
      if (f.takeaway) decided.takeaway = f.takeaway
      const slug = b.note as string | undefined
      if (slug) {
        work.note = { slug }
        const hits = listArchives().filter((a) => a.dir.slice(11) === slug)
        let hit = hits.length === 1 ? hits[0] : null
        if (hits.length > 1) {
          // 1 対 1 で決まらないので、自動では結ばない。作品を作った日に近い順に候補を並べ、話者が選ぶ
          const from = String(work.createdAt).slice(0, 10)
          work.linkCandidates = hits
            .map((a) => a.dir)
            .sort((a, b) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(from)) - Math.abs(Date.parse(b.slice(0, 10)) - Date.parse(from)))
            .slice(0, 5)
          notes.push(`同じ名前の記事が ${hits.length} 本あり、どれと結ぶか決められませんでした。公開の画面で選んでください`)
        }
        if (hit) {
          const key = hit.url?.match(/\/n\/(\w+)/)?.[1]
          work.note = { slug, key, url: hit.url ?? undefined }
          work.shipped = { at: `${hit.publishedAt}T12:00:00.000Z`, by: 'note', ref: hit.dir }
          work.learned = true
          work.recorded = true
          work.title = hit.title
          step = 'publish'
        } else if (work.linkCandidates) step = 'publish'
        else if (existsSync(join(noteDir(slug), 'outline.yaml'))) step = existsSync(join(noteDir(slug), 'index.md')) ? 'draft' : 'outline'
      } else {
        work.note = { slug: id }
      }
    } else {
      if (Array.isArray(f.personas)) decided.audience = f.personas.map((p: any) => ({ name: p.name, who: p.who, why: p.why, trouble: p.trouble, solve: p.solve }))
      decided.event = { name: f.event, url: f.eventUrl, date: f.date, minutes: minutesOf(f.duration), venue: f.venue }
      const slug = b.talk as string | undefined
      let site: any = null
      try {
        site = slug ? (theSite().talks.get(slug) ?? null) : null
      } catch {}
      decided.scope = site ? (site.outside ? 'internal' : 'public') : f.publish === '公開する' ? 'public' : 'internal'
      if (site) {
        work.talk = { slug, dir: site.dir.split('/').pop() }
        step = 'present'
        if (site.info.public && !site.outside) {
          work.presented = { at: `${decided.event.date ?? String(work.createdAt).slice(0, 10)}T12:00:00.000Z` }
          work.shipped = { at: work.presented.at, by: 'site' }
          work.learned = true
          work.recorded = true
        }
      } else if (core) step = 'outline'
    }
    work.step = step
    writeText(workFile(id), '# 作品の正。studio のサーバだけが書く。Claude は proposals.yaml に候補を書く\n' + yamlText(work))
    if (!existsSync(proposalsFile(id))) writeText(proposalsFile(id), '# Claude が書く候補。話者は studio の画面で選んで確定する\n')
    appendChat(id, { role: 'system', text: ['旧 studio の企画シートから移しました。', ...notes].join('\n'), tone: 'info' })
    done.push(id)
  }
  return done
}
