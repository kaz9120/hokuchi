// 公開済みの note の記事を読む画面。「改稿する」で、記事を原稿に写して原稿タブで開く (ADR-0047)
import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, Loader2, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, type NoteView as Note } from '@/lib/api'

export function NoteView({ dir }: { dir: string }) {
  const [note, setNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revising, setRevising] = useState(false)
  // 改稿の原稿があれば、それを開く。無ければアーカイブを原稿に写す。アーカイブは書き換えない
  const revise = async () => {
    setRevising(true)
    try {
      const { work } = await api.revise(dir)
      location.href = `/works/${encodeURIComponent(work)}#draft`
    } catch (e) {
      setError(String((e as Error).message))
      setRevising(false)
    }
  }
  useEffect(() => {
    api.note(dir).then(setNote, (e) => setError(String(e.message)))
  }, [dir])
  if (error) return <div className="p-10 text-destructive">{error}</div>
  if (!note) return <div className="p-10 text-muted-foreground">読み込み中…</div>
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <ArrowLeft /> ホーム
          </a>
        </Button>
        <span className="truncate text-sm text-muted-foreground">{note.title}</span>
        <div className="ml-auto flex gap-2">
          {note.url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={note.url} target="_blank" rel="noreferrer">
                note で開く <ExternalLink />
              </a>
            </Button>
          )}
          <Button size="sm" disabled={revising} onClick={revise} title="この記事を原稿に写して、原稿タブで直します。note の記事は、公開タブから更新します">
            {revising ? <Loader2 className="animate-spin" /> : <PenLine />} 改稿する
          </Button>
        </div>
      </header>
      <article className="mx-auto my-8 max-w-[720px] rounded-xl border bg-background px-10 py-10">
        {note.eyecatch && <img src={note.eyecatch} alt="" className="mb-8 w-full rounded-lg" />}
        <h1 className="text-2xl leading-snug font-bold">{note.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {note.publishedAt}
          {note.tags.map((t) => (
            <Badge key={t} variant="outline">
              #{t}
            </Badge>
          ))}
        </div>
        <div className="note-body mt-8" dangerouslySetInnerHTML={{ __html: note.html }} />
      </article>
    </div>
  )
}
