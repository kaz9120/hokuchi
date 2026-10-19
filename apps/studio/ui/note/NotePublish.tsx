// 記事の公開の面 (ADR-0046)。note に出す前に、タイトル・タグ・見出し画像を決め、note に貼る本文をコピーする。
// タイトルの正は原稿の front matter (作品の画面の上のタイトルと同じもの)。公開したあとの取り込み (sync) は Claude Code に頼む
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, FolderOpen, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { send } from '../lib/works'
import { draftApi, type Draft, type PasteText } from '../lib/note'

const TITLE_TASK = 'title.candidates'

export function NotePublishView({ data }: { data: Draft }) {
  const dapi = useMemo(() => draftApi(data.key), [data.key])
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto grid max-w-3xl gap-6">
        <TitleCard data={data} />
        <TagsCard data={data} save={(tags) => dapi.setMeta({ tags })} />
        <EyecatchCard data={data} />
        <PasteCard data={data} />
        <AfterCard data={data} />
      </div>
    </div>
  )
}

function Card({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border bg-background p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {help && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{help}</p>}
      </div>
      {children}
    </section>
  )
}

/** タイトル。先頭 25 字に核を置く (writing-note の structure.md)。案は Claude が原稿を読んで出す */
function TitleCard({ data }: { data: Draft }) {
  const dapi = useMemo(() => draftApi(data.key), [data.key])
  const [title, setTitle] = useState(data.title)
  useEffect(() => setTitle(data.title), [data.title])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 出した案は企画シートにも残る。出した直後は、返ってきた案をそのまま見せる
  const [fresh, setFresh] = useState<{ text: string; note: string }[] | null>(null)
  const candidates = fresh ?? data.candidates[TITLE_TASK]?.items
  const len = [...title].length
  const suggest = async () => {
    setRunning(true)
    setError(null)
    try {
      setFresh((await send<{ items: { text: string; note: string }[] }>(data.key, '/ask', 'POST', { task: TITLE_TASK }, { quiet: true }))?.items ?? null)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setRunning(false)
    }
  }
  return (
    <Card title="タイトル" help="何が書いてあるかが 1 秒で分かるようにします。SNS では 25 字より後ろが省略されるので、先頭に核を置きます。">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== data.title && dapi.setMeta({ title: title.trim() })} className="text-base font-semibold" />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className={cn(len > 40 && 'text-amber-700')}>
          {len} 字{len > 25 && <span className="ml-1">（先頭 25 字:「{[...title].slice(0, 25).join('')}」）</span>}
        </span>
        <Button size="sm" variant="outline" className="ml-auto" disabled={running} onClick={suggest}>
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />} タイトルの案を出す
        </Button>
      </div>
      {running && <p className="text-sm text-muted-foreground">Claude が原稿を読んでいます。30 秒ほどかかります。</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {candidates && (
        <div className="grid gap-2">
          {candidates.map((c, i) => (
            <div key={i} className="grid gap-1 rounded-md border px-3 py-2">
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium">{c.text}</span>
                <Button size="xs" variant="secondary" className="ml-auto shrink-0" disabled={c.text === data.title} onClick={() => dapi.setMeta({ title: c.text })}>
                  {c.text === data.title ? '使用中' : 'この案を使う'}
                </Button>
              </div>
              {c.note && <p className="text-xs leading-relaxed text-muted-foreground">{c.note}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** タグ。3〜5 個 (主題・ジャンル・お題の 3 層) */
function TagsCard({ data, save }: { data: Draft; save: (tags: string[]) => void }) {
  const [text, setText] = useState('')
  const tags = data.tags
  const add = () => {
    const t = text.replace(/^#/, '').trim()
    if (!t || tags.includes(t)) return setText('')
    save([...tags, t])
    setText('')
  }
  const ok = tags.length >= 3 && tags.length <= 5
  return (
    <Card title="タグ" help="3〜5 個にします。記事のテーマ（主題）・形式（エッセイ・イベントレポートなど）・note のお題、の 3 種類から選びます。">
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-sm">
            #{t}
            <button onClick={() => save(tags.filter((x) => x !== t))} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`${t} を削除`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()} placeholder="タグを追加（Enter）" className="h-8 w-48" />
      </div>
      <p className={cn('text-xs', ok ? 'text-muted-foreground' : 'text-amber-700')}>{tags.length} 個{ok ? '' : '。3〜5 個にしてください'}</p>
    </Card>
  )
}

/** 見出し画像。1280×670 の画像を原稿の assets/ に置き、選ぶと front matter の eyecatch に入る */
function EyecatchCard({ data }: { data: Draft }) {
  const dapi = useMemo(() => draftApi(data.key), [data.key])
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => setSize(null), [data.eyecatch])
  const right = size && size.w === 1280 && size.h === 670
  return (
    <Card title="見出し画像" help="1280×670 の画像を、原稿の assets フォルダに置いてください。置いた画像はここに並び、選ぶと見出し画像になります。">
      {data.eyecatch ? (
        <div className="grid gap-1.5">
          <img src={dapi.asset(data.eyecatch)} alt="" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} className="w-full max-w-sm rounded-md border" />
          <p className={cn('text-xs', size && !right ? 'text-amber-700' : 'text-muted-foreground')}>
            {data.eyecatch}
            {size && `・${size.w}×${size.h}`}
            {size && !right && '（1280×670 ではありません。note で端が切れることがあります）'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-amber-700">見出し画像はまだありません。</p>
      )}
      <div className="flex flex-wrap items-start gap-2">
        {data.assets
          .filter((a) => a !== data.eyecatch)
          .map((a) => (
            <button key={a} onClick={() => dapi.setMeta({ eyecatch: a })} className="group relative overflow-hidden rounded-md border hover:border-foreground/40" title={`${a} を見出し画像にする`}>
              <img src={dapi.asset(a)} alt="" loading="lazy" className="h-20 w-auto" />
              <span className="absolute inset-x-0 bottom-0 hidden bg-foreground/80 py-0.5 text-center text-xs text-background group-hover:block">見出し画像にする</span>
            </button>
          ))}
        <Button size="sm" variant="outline" onClick={() => dapi.openAssets()}>
          <FolderOpen /> assets フォルダを開く
        </Button>
      </div>
    </Card>
  )
}

/** note に貼る本文。画像の行は「（画像 n/N: …）」の 1 行に置き換わるので、note 側で画像を入れる */
function PasteCard({ data }: { data: Draft }) {
  const dapi = useMemo(() => draftApi(data.key), [data.key])
  const [paste, setPaste] = useState<PasteText | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    dapi.paste().then(setPaste)
  }, [dapi, data.blocks])
  const copy = async () => {
    const p = await dapi.paste()
    setPaste(p)
    await navigator.clipboard.writeText(p.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <Card title="note に貼る" help="本文をコピーして、note のエディタに貼ります。見出し・強調・埋め込みの URL はそのまま入ります。">
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? 'コピーしました' : '本文をコピー'}
        </Button>
        {(paste?.images.length ?? 0) > 0 && (
          <Button variant="outline" onClick={() => dapi.openAssets()}>
            <FolderOpen /> assets フォルダを開く
          </Button>
        )}
      </div>
      {paste && paste.images.length > 0 && (
        <div className="grid gap-1.5 text-sm">
          <p className="text-muted-foreground">本文の「（画像 n/N: …）」の行を消して、その位置に画像を入れてください。</p>
          <ol className="grid gap-1 rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed">
            {paste.images.map((img) => (
              <li key={img.n}>
                画像 {img.n}/{paste.images.length}: {img.file}
                {img.caption && <span className="text-muted-foreground">（キャプション: {img.caption}）</span>}
                {img.link && <span className="text-muted-foreground">（リンク: {img.link}）</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  )
}

/** 公開したあと。取り込み (sync) を Claude Code に頼む依頼文 */
function AfterCard({ data }: { data: Draft }) {
  const [copied, setCopied] = useState(false)
  const text = data.revises
    ? [
        `note の記事（articles/note/${data.revises}）を、原稿 ${data.file} の内容で更新しました。`,
        'hokuchi-note sync で取り込み直し、verify を通してください。',
        `取り込みが済んだら、原稿のフォルダ ${data.dir} を、消さずに <HOKUCHI_PRIVATE>/trash/<日時>-notes-${data.slug}/ に移してください。`,
      ].join('\n')
    : [
        `原稿 ${data.file} を note に公開しました。`,
        `articles/note/slugs.json に、この記事の note key と slug「${data.slug}」の対応を足してから、hokuchi-note sync で取り込み、verify を通してください。`,
        `取り込みが済んだら、原稿のフォルダ ${data.dir} を、消さずに <HOKUCHI_PRIVATE>/trash/<日時>-notes-${data.slug}/ に移してください。`,
      ].join('\n')
  return (
    <Card title={data.revises ? 'note の記事を更新したら' : 'note に公開したら'} help="公開した記事は、Claude Code にアーカイブへの取り込みを頼みます。取り込むと、ホームの一覧で「公開」になります。">
      <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2.5 text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        onClick={() => {
          navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? 'コピーしました' : '依頼文をコピー'}
      </Button>
    </Card>
  )
}
