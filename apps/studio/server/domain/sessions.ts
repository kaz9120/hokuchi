// 作品ごとの購読。作品を開いているあいだだけ、監視と撮影の作業場を動かし、閉じたら止める。
// ファイルが変わったら (画面の操作でも、Claude Code の直しでも)、作品の画面に WorkView を、ホームに「変わった」を知らせる
import { join } from 'node:path'
import { places } from '../infra/config.ts'
import { invalid } from '../infra/errors.ts'
import { listeners, onIdle, publish } from '../infra/events.ts'
import { createShooter, type Shooter } from '../infra/shooter.ts'
import { theSite } from '../infra/site.ts'
import { watchDir, type Watch } from '../infra/watch.ts'
import { mediaOf } from '../media/index.ts'
import { refreshTalkInfo } from '../media/talk.ts'
import { importRead } from './threads.ts'
import { readReaders, readings, runRead } from './reads.ts'
import { briefDir } from './brief.ts'
import { briefPersonas, resolve, viewOf, type WorkRef } from './work.ts'

type Session = { key: string; dirs: string; watches: Watch[]; shooter: Shooter | null; closing: NodeJS.Timeout | null }
const sessions = new Map<string, Session>()
export const topicOf = (key: string) => `work:${key}`

const dirsOf = (ref: WorkRef) => [...(ref.brief ? [briefDir(ref.brief.id)] : []), ...mediaOf(ref.kind).watchDirs(ref)]

/** 作品の作業場を開く。戻り値は本当の key (企画シートが紐づいていれば、その id) */
export function openSession(key: string): string {
  const ref = resolve(key)
  let s = sessions.get(ref.key)
  if (!s) {
    s = { key: ref.key, dirs: '', watches: [], shooter: null, closing: null }
    sessions.set(ref.key, s)
    rewatch(s, ref)
    if (ref.talk) {
      s.shooter = createShooter(() => `${theSite().url}/${resolve(s!.key).talk?.info.slug ?? ''}/`)
      shoot(s)
    }
    // 最後の画面が閉じたら、少し待ってから止める (読み込み直しで、すぐまた開くことがある)
    onIdle(topicOf(ref.key), () => {
      const cur = sessions.get(ref.key)
      if (!cur) return
      cur.closing = setTimeout(() => closeSession(ref.key), 5000)
    })
  }
  if (s.closing) clearTimeout(s.closing)
  s.closing = null
  return ref.key
}

export async function closeSession(key: string) {
  const s = sessions.get(key)
  if (!s || listeners(topicOf(key)) > 0) return
  sessions.delete(key)
  for (const w of s.watches) w.close()
  await s.shooter?.close()
}

export async function closeAllSessions() {
  for (const s of [...sessions.values()]) {
    for (const w of s.watches) w.close()
    await s.shooter?.close()
  }
  sessions.clear()
}

/** 監視するディレクトリが変わっていたら (原稿を作った・ごみ箱に移したなど)、付け直す */
function rewatch(s: Session, ref: WorkRef) {
  const dirs = dirsOf(ref)
  if (dirs.join('\n') === s.dirs) return
  for (const w of s.watches) w.close()
  s.dirs = dirs.join('\n')
  s.watches = dirs.map((d) =>
    watchDir(d, (files) => {
      // 指摘・読みのファイルだけが変わったときは、絵を撮り直さない (絵は変わらないため)
      const relevant = files.filter((f) => !f.startsWith('out'))
      if (relevant.length === 0) return
      const redraw = ref.talk && d === ref.talk.dir && relevant.some((f) => !/^(feedback\.yaml|readers\.yaml|reads[\\/]|archive[\\/])/.test(f))
      void changed(s.key, { redraw: !!redraw, talkFile: relevant.includes('talk.tsx') })
    }),
  )
}

function shoot(s: Session) {
  s.shooter?.shoot().then((r) => publish(topicOf(s.key), 'thumbs', r))
}

export function thumb(key: string, scene: string, n: number) {
  return sessions.get(key)?.shooter?.get(scene, n) ?? null
}

/**
 * 作品が変わった。画面に新しい WorkView を送り、ホームにも知らせる。
 * redraw は絵が変わったとき (トークを読み直して撮り直す)
 */
export async function changed(key: string, { redraw = false, talkFile = false } = {}) {
  publish('home', 'home', {})
  const s = sessions.get(key)
  if (!s) return
  let ref: WorkRef
  try {
    ref = resolve(key)
  } catch {
    // 作品が無くなった (ごみ箱に移した)
    publish(topicOf(key), 'gone', {})
    return closeSession(key)
  }
  rewatch(s, ref)
  if (ref.talk && (redraw || talkFile)) {
    ref.talk.vite.moduleGraph.invalidateAll()
    if (talkFile) await refreshTalkInfo(ref.talk).catch(() => {})
    shoot(s)
  }
  publish(topicOf(key), 'work', await viewOf(ref, { thumbsVersion: s.shooter?.version() ?? 0 }))
}

export async function viewNow(key: string) {
  const ref = resolve(key)
  return viewOf(ref, { thumbsVersion: sessions.get(ref.key)?.shooter?.version() ?? 0 })
}

/** 聴衆役に読んでもらう。数分かかるので裏で走らせ、進み具合を画面に知らせる */
export function startRead(ref: WorkRef) {
  if (readings.has(ref.key)) return
  const media = mediaOf(ref.kind)
  const plan = { ...media.readPlan(ref), extra: briefPersonas(ref) }
  const total = readReaders(plan.dir, plan.extra).readers.length
  if (total === 0) throw invalid('読み手が決まっていません。読み手を選んでください')
  const topic = topicOf(ref.key)
  const progress = (p: { done: number; total: number; failed: string[]; error?: string }) => {
    readings.set(ref.key, p)
    publish(topic, 'reading', p)
  }
  progress({ done: 0, total, failed: [] })
  runRead(plan, progress)
    .then((read) => importRead(join(plan.dir, 'feedback.yaml'), media.threadsHeader, read, media.anchorOfNote))
    .catch((e) => publish(topic, 'reading', { ...readings.get(ref.key), error: String(e.message ?? e) }))
    .finally(() => {
      readings.delete(ref.key)
      void changed(ref.key)
    })
}

/** ホームに知らせるための監視。置き場 (企画シート・ネタ・原稿・非公開のトーク) が変わったら知らせる */
export function watchHome(): Watch {
  const ws = [places.works, places.seeds, places.notes, places.talks].map((d) => watchDir(d, () => publish('home', 'home', {}), { wait: 300 }))
  return { close: () => ws.forEach((w) => w.close()) }
}
