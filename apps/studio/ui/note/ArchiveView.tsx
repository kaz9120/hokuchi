// 公開済みの記事を、原稿の面で読むだけの状態として出す (ADR-0047・design.md 3 章「状態の見せ方」)。
// 「改稿する」を押すと、アーカイブを原稿に写し、同じ原稿の面が直せる状態になる。アーカイブは書き換えない
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Loader2, PenLine } from 'lucide-react'
import type { Archive, WorkView } from '../../shared/api'
import { Button } from '../components/ui/button'
import { setReading } from '../lib/router'
import { BarActions, BarSummary } from '../work/FaceBar'
import { workPath } from '../lib/works'
import { runAction } from '../work/StateMenu'
import { archiveHeadings } from '../work/faces'

export function ArchiveView({ view, archive, focus, seq }: { view: WorkView; archive: Archive; focus: string | null; seq: number }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  // 見出しに id を付けて、レールの目次から移れるようにする
  const html = useMemo(() => {
    let i = 0
    return (archive.html ?? '').replace(/<h([23])([^>]*)>/g, (_, level: string, attrs: string) => `<h${level}${attrs} id="h-${++i}">`)
  }, [archive.html])
  const headings = useMemo(() => archiveHeadings(archive.html ?? ''), [archive.html])
  const canRevise = view.state.actions.includes('revise')

  const moved = useRef(false)
  useEffect(() => {
    if (!focus) return
    const smooth = moved.current
    moved.current = true
    document.getElementById(focus)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }, [focus, seq])
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const update = () => {
      const line = root.getBoundingClientRect().top + root.clientHeight / 4
      let here: string | null = headings[0]?.id ?? null
      for (const h of headings) if ((document.getElementById(h.id)?.getBoundingClientRect().top ?? Infinity) <= line) here = h.id
      setReading('draft', here)
    }
    root.addEventListener('scroll', update, { passive: true })
    return () => root.removeEventListener('scroll', update)
  }, [headings])

  const revise = async () => {
    setBusy(true)
    await runAction(view, 'revise')
    setBusy(false)
  }

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <BarSummary>
        <span>公開済みの記事です。直すときは「改稿する」を押します。</span>
      </BarSummary>
      <BarActions>
        <>
          {archive.url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={archive.url} target="_blank" rel="noreferrer">
                note で開く <ExternalLink />
              </a>
            </Button>
          )}
          {canRevise && (
            <Button size="sm" disabled={busy} onClick={revise} title="この記事を原稿に写して、この画面で直せるようにします。note の記事は、公開の画面から更新します">
              {busy ? <Loader2 className="animate-spin" /> : <PenLine />} 改稿する
            </Button>
          )}
        </>
      </BarActions>
      <article className="mx-auto mt-8 max-w-[720px] rounded-xl border bg-background px-10 py-10">
        {archive.eyecatch && <img src={`${workPath(view.key)}/${archive.eyecatch}`} alt="" className="mb-8 w-full rounded-lg" />}
        <h1 className="text-2xl leading-snug font-bold">{archive.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {archive.publishedAt}
          {archive.tags.map((t) => (
            <span key={t} className="rounded-full border px-2 py-0.5 text-xs">
              #{t}
            </span>
          ))}
        </div>
        <div className="note-body mt-8 [&_h2]:scroll-mt-16 [&_h3]:scroll-mt-16" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  )
}

/** 公開済みの記事の公開の面。note のページと、公開した日だけを出す */
export function ArchivePublished({ archive }: { archive: Archive }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto grid max-w-3xl gap-3 rounded-lg border bg-background p-5">
        <h2 className="font-semibold">note で公開しています</h2>
        <p className="text-sm text-muted-foreground">{archive.publishedAt} に公開しました。直すときは、原稿の画面の「改稿する」から始めます。</p>
        {archive.url && (
          <Button variant="outline" size="sm" className="justify-self-start" asChild>
            <a href={archive.url} target="_blank" rel="noreferrer">
              note で開く <ExternalLink />
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
