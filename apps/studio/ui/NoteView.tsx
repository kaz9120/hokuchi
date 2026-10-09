// 公開済みの note の記事を読む画面。改稿は次の段で作る (docs/design.md の 4)
import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, type NoteView as Note } from '@/lib/api'

export function NoteView({ dir }: { dir: string }) {
  const [note, setNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)
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
            <ArrowLeft /> 一覧
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
          <Button size="sm" disabled title="次の段で作ります">
            改稿する
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
