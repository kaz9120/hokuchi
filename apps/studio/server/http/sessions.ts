// 作品を開いているあいだの作業場。作品と中身のフォルダを見張り、変わったら画面に知らせる。
// Claude が作業していないときに中身が変わったら、外で変わったものとして記録する (次の実行の頭に添える)。
// 発表なら、絵に関わるファイルが変わるたびにコマの縮小画像を撮り直す
import { relative } from 'node:path'
import type { Studio } from '../flow/service.ts'
import { listeners, onIdle, publish } from '../infra/events.ts'
import { createShooter, type Shooter } from '../infra/shooter.ts'
import { theSite } from '../infra/site.ts'
import { watchDir, type Watch } from '../infra/watch.ts'
import { siteTalkOf } from '../media/talks.ts'
import { noteDir, talkDirOf } from '../store/places.ts'
import { readWork, workDir } from '../store/works.ts'

type Session = { watches: Watch[]; shooter: Shooter | null; talkDir: string | null }

export class Sessions {
  private open_ = new Map<string, Session>()
  /** studio 自身が書いた直後の変化は、外の変化として数えない */
  private quietUntil = new Map<string, number>()
  private studio: Studio
  constructor(studio: Studio) {
    this.studio = studio
  }

  quiet(id: string, ms = 1500) {
    this.quietUntil.set(id, Date.now() + ms)
  }

  open(id: string) {
    if (this.open_.has(id)) return this.refresh(id)
    const s: Session = { watches: [], shooter: null, talkDir: null }
    this.open_.set(id, s)
    onIdle(`work:${id}`, () => setTimeout(() => listeners(`work:${id}`) === 0 && this.close(id), 5000))
    s.watches.push(watchDir(workDir(id), () => this.push(id), { recursive: false }))
    this.refresh(id)
  }

  /** 中身のフォルダが増えた・変わったときに、見張りと撮影を付け直す */
  refresh(id: string) {
    const s = this.open_.get(id)
    if (!s) return
    const { work } = readWork(id)
    const dirs: string[] = []
    if (work.note?.slug) dirs.push(noteDir(work.note.slug))
    const talk = talkDirOf(work)
    if (talk) dirs.push(talk)
    const key = dirs.join('|')
    if ((s as any).key === key) return
    ;(s as any).key = key
    for (const w of s.watches.slice(1)) w.close()
    s.watches = s.watches.slice(0, 1)
    for (const dir of dirs)
      s.watches.push(
        watchDir(dir, (files) => {
          const visible = files.filter((f) => !/^out|(^|\/)\.|node_modules/.test(f))
          if (!visible.length) return
          if (talk && dir === talk && visible.some((f) => !/feedback\.yaml|readers\.yaml|reads\//.test(f))) this.shoot(id)
          this.push(id)
        }),
      )
    if (talk) {
      s.talkDir = talk
      this.shoot(id)
    }
  }

  private async shoot(id: string) {
    const s = this.open_.get(id)
    if (!s) return
    const { work } = readWork(id)
    let site = siteTalkOf(work)
    if (!site) {
      try {
        await theSite().refresh()
      } catch {}
      site = siteTalkOf(work)
    }
    if (!site) return
    s.shooter ??= createShooter(() => {
      const t = siteTalkOf(readWork(id).work)
      return t ? `${theSite().url}/${t.info.slug}/` : ''
    })
    try {
      site.vite.moduleGraph.invalidateAll()
    } catch {}
    const r = await s.shooter.shoot()
    this.studio.thumbs.set(id, r)
    this.push(id)
  }

  thumb(id: string, scene: string, n: number) {
    return this.open_.get(id)?.shooter?.get(scene, n)
  }

  push(id: string) {
    this.refresh(id)
    try {
      publish(`work:${id}`, 'work', this.studio.view(id))
    } catch {}
  }

  close(id: string) {
    const s = this.open_.get(id)
    if (!s) return
    for (const w of s.watches) w.close()
    s.shooter?.close()
    this.studio.thumbs.delete(id)
    this.open_.delete(id)
  }

  closeAll() {
    for (const id of [...this.open_.keys()]) this.close(id)
  }
}
