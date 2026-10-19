// 聴衆役の読み (ADR-0039)。プリセットのペルソナ (personas/) に中身を読んでもらい、アンケートと単位への感想を受け取る。
// 発表と記事で流れは同じで、渡す文・アンケートの項目・感想の位置だけが違う (媒体の部品が持つ)。
// 読み手は毎回まっさらにする。リポジトリの文脈 (CLAUDE.md など) を拾わないよう、Claude は一時ディレクトリで起動する
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Persona, Read, ReaderChoice, ReaderNote, ReaderResult, Reading, Score, SurveyItem } from '../../shared/api.ts'
import { askClaude } from '../infra/claude.ts'
import { places } from '../infra/config.ts'
import { invalid } from '../infra/errors.ts'
import { readVersioned, readYaml, writeText, yamlText } from '../infra/files.ts'

export function listPersonas(): Persona[] {
  if (!existsSync(places.personas)) return []
  return readdirSync(places.personas)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => readYaml<Persona>(join(places.personas, f)))
    .filter((p) => p.id)
}

const readersFile = (dir: string) => join(dir, 'readers.yaml')

/** 読み手 (どのペルソナが、なぜ来たか)。<中身>/readers.yaml */
/** extra は、プリセットのほかに読み手にできる人 (企画で描いた聴衆。work.ts の briefPersonas) */
export function readReaders(dir: string | null, extra: Persona[] = []): { readers: ReaderChoice[]; version: string } {
  if (!dir) return { readers: [], version: 'none' }
  const { text, version } = readVersioned(readersFile(dir))
  const list: { persona: string; why?: string }[] = text ? (readYaml(readersFile(dir)).readers ?? []) : []
  const personas = [...extra, ...listPersonas()]
  return {
    version,
    readers: list
      .map((r) => {
        const p = personas.find((x) => x.id === r.persona)
        return p ? { ...p, why: r.why ?? (p as Persona & { why?: string }).why ?? '' } : null
      })
      .filter((x): x is ReaderChoice => !!x),
  }
}

/** 読み手を決める。head は readers.yaml の頭書き */
export function saveReaders(dir: string, head: string, readers: { persona: string; why?: string }[], base?: string, extra: Persona[] = []) {
  if (!Array.isArray(readers)) throw invalid('readers は配列にしてください')
  const known = new Set([...extra, ...listPersonas()].map((p) => p.id))
  for (const r of readers) if (!known.has(r.persona)) throw invalid(`ペルソナ「${r.persona}」はありません`)
  writeText(readersFile(dir), head + yamlText({ readers: readers.map((r) => ({ persona: r.persona, ...(r.why ? { why: r.why } : {}) })) }), base)
}

/** これまでの読み。古い順 */
export function listReads(dir: string | null): Read[] {
  if (!dir) return []
  const out = join(dir, 'reads')
  if (!existsSync(out)) return []
  return readdirSync(out)
    .filter((f) => /^\d+\.yaml$/.test(f))
    .sort()
    .map((f) => readYaml<Read>(join(out, f)))
}

/** アンケートの点を 1〜5 にそろえる */
function scoresOf(raw: any, survey: SurveyItem[]) {
  const scores: Record<string, Score> = {}
  for (const q of survey) {
    const a = raw?.scores?.[q.key] ?? {}
    scores[q.key] = { score: Math.max(1, Math.min(5, Math.round(Number(a.score) || 0) || 1)), reason: String(a.reason ?? '') }
  }
  return scores
}

export type ReadPlan = {
  dir: string
  survey: SurveyItem[]
  /** 1 人分の依頼文 */
  prompt: (persona: Persona, why: string) => string
  /** 答えの感想を、決めた形にそろえる (位置の付け直しを含む) */
  notes: (raw: any[]) => ReaderNote[]
  /** 読みの記録に残す、中身の大きさ (発表は scenes・states、記事は paragraphs) */
  meta: Record<string, number>
  /** プリセットのほかの読み手 (企画で描いた聴衆) */
  extra?: Persona[]
}

/**
 * 読み手全員に読んでもらい、結果を <中身>/reads/<番号>.yaml に残す。
 * onProgress には、読み終えた人数と全体の人数、失敗した人の名前が届く
 */
export async function runRead(plan: ReadPlan, onProgress: (p: Reading) => void): Promise<Read> {
  const { readers } = readReaders(plan.dir, plan.extra)
  if (readers.length === 0) throw invalid('読み手が決まっていません。読み手を選んでください')
  let done = 0
  const failed: string[] = []
  onProgress({ done, total: readers.length, failed })
  const results = await Promise.all(
    readers.map((r) =>
      askClaude(plan.prompt(r, r.why), { cwd: tmpdir(), label: r.name })
        .then((raw): ReaderResult => ({
          persona: r.id,
          name: r.name,
          label: r.label,
          scores: scoresOf(raw, plan.survey),
          message: String(raw.message ?? ''),
          wish: String(raw.wish ?? ''),
          notes: plan.notes((raw.notes ?? []).slice(0, 12)),
        }))
        .catch((e) => {
          failed.push(String(e.message))
          return null
        })
        .finally(() => onProgress({ done: ++done, total: readers.length, failed })),
    ),
  )
  const out = join(plan.dir, 'reads')
  mkdirSync(out, { recursive: true })
  const n = listReads(plan.dir).length + 1
  const read: Read = { id: n, at: new Date().toISOString(), ...plan.meta, readers: results.filter((x): x is ReaderResult => !!x), failed }
  writeText(join(out, `${String(n).padStart(3, '0')}.yaml`), yamlText(read))
  return read
}

/** 読んでもらっているあいだの進み具合。作品の key ごと */
export const readings = new Map<string, Reading>()
