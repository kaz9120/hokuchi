// 記事の「公開」の面。タイトル・タグ・名前・見出し画像を選び、本文と画像をコピーして note に貼る。
// 公開したら URL を貼る。取り込み・結びつけ・片付けは studio がする
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Field, FieldLabel, Input, SelectableTag, TagGroup, toast } from 'takibi-design-system'
import { api, fileUrl } from '../lib/api'
import type { WorkCtx } from '../pages/Work'
import { Choice, Frame, Section, LinkButton } from './common'
import { Readers } from './Readers'

export function NotePublish({ ctx }: { ctx: WorkCtx }) {
  const p = ctx.view.proposals
  const note = ctx.view.note
  const [url, setUrl] = useState('')
  const [motif, setMotif] = useState('')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  useEffect(() => setTags(note?.tags ?? []), [note?.tags.join(',')])
  if (!note) return null
  const title = note.title
  const allTags = [...new Set([...(p.tags ?? []), ...tags])]
  const eyecatchDir = (ctx.view.work.note?.slug ?? '')
  return (
    <Frame
      ctx={ctx}
      title="公開"
      lead="選んでから本文と画像をコピーし、note のエディタに貼って公開します。公開したら URL を貼ってください"
      footer={
        <form
          className="flex w-full flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void ctx.press(ctx.view.revising ? 'note-updated' : 'ship-note', { url })
          }}
        >
          {ctx.view.revising ? (
            <Button type="submit" size="lg" className="ml-auto" disabled={ctx.locked}>
              note を更新した
            </Button>
          ) : (
            <>
              <CopyText ctx={ctx} />
              <Field className="min-w-[280px] flex-1">
                <FieldLabel>公開した記事の URL</FieldLabel>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://note.com/kyamamoto9120/n/…" />
              </Field>
              <Button type="submit" size="lg" disabled={ctx.locked || !/note\.com\/.+\/n\/n/.test(url)}>
                取り込む
              </Button>
            </>
          )}
        </form>
      }
    >
      {ctx.view.work.linkCandidates?.length ? (
        <Section title="公開済みの記事と結ぶ" hint="旧 studio から移した作品です。同じ名前の記事が複数あるので、どれがこの作品かを選んでください">
          <div className="flex flex-wrap gap-2">
            {ctx.view.work.linkCandidates.map((d) => (
              <Button key={d} variant="secondary" onClick={() => void ctx.press('link-archive', { dir: d })}>
                {d} と結ぶ
              </Button>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title="タイトル" hint="先頭 25 字に核を置く">
        <Choice name="タイトル" options={p.title ?? []} value={title} picked={p.picked?.title} rows={1} onChange={(v) => void ctx.press('choose-title', { title: v })} />
        <p className="text-sm text-fg-muted tabular-nums">
          {title.length}字・先頭 25 字:「{title.slice(0, 25)}」
        </p>
      </Section>
      <Section title="タグ" hint="3〜5 個">
        <TagGroup aria-label="タグ">
          {allTags.map((t) => (
            <SelectableTag
              key={t}
              pressed={tags.includes(t)}
              onPressedChange={(on: boolean) => {
                const next = on ? [...tags, t] : tags.filter((x) => x !== t)
                setTags(next)
                void ctx.press('choose-tags', { tags: next })
              }}
            >
              #{t}
            </SelectableTag>
          ))}
        </TagGroup>
        <Input
          placeholder="タグを足す（Enter）"
          className="max-w-xs"
          onKeyDown={(e) => {
            const v = e.currentTarget.value.trim().replace(/^#/, '')
            if (e.key === 'Enter' && v) {
              e.preventDefault()
              const next = [...new Set([...tags, v])]
              setTags(next)
              void ctx.press('choose-tags', { tags: next })
              e.currentTarget.value = ''
            }
          }}
        />
      </Section>
      {!ctx.view.revising && (
        <Section title="原稿の名前" hint="英小文字とハイフン。アーカイブのフォルダ名になる">
          <Choice name="原稿の名前" options={p.slug ?? []} value={ctx.view.work.note?.slug ?? ''} picked={p.picked?.slug} rows={1} onChange={(v) => void ctx.press('choose-slug', { slug: v })} />
        </Section>
      )}
      <Section title="見出し画像" hint="モチーフを選ぶと、Claude が下地を作ります。文字は note-ogp で入れる">
        {(p.motif ?? []).length > 0 && (
          <Choice
            name="モチーフ"
            editable={false}
            options={p.motif ?? []}
            value={motif}
            onChange={(v) => {
              setMotif(v)
              void ctx.press('choose-motif', { motif: v })
            }}
          />
        )}
        <EyecatchImages ctx={ctx} slug={eyecatchDir} />
      </Section>
      <Section title="note に貼る">
        <div className="flex flex-wrap gap-2">
          <CopyText ctx={ctx} />
          <LinkButton variant="ghost" href={"https://note.com/notes/new"}>
            <ExternalLink aria-hidden />
            note のエディタを開く
          </LinkButton>
        </div>
        {note.images.length > 0 && (
          <>
            <p className="text-sm text-fg-muted">本文に出てくる順に、画像を 1 枚ずつコピーして貼ります。本文の（画像 n/N）の行を消して貼ってください</p>
            <ol className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {note.images.map((img, i) => (
                <li key={img} className="flex flex-col gap-1.5">
                  <img src={fileUrl(ctx.id, img)} alt="" className="aspect-video w-full rounded-md border border-line-subtle object-cover" />
                  <CopyImage src={fileUrl(ctx.id, img)} label={`画像 ${i + 1}/${note.images.length} をコピー`} />
                </li>
              ))}
            </ol>
          </>
        )}
      </Section>
      <Readers ctx={ctx} />
    </Frame>
  )
}

function CopyText({ ctx }: { ctx: WorkCtx }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          const { text } = await api.paste(ctx.id)
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 2000)
        } catch (e) {
          toast.add({ title: String((e as Error).message), type: 'error' })
        }
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {done ? 'コピーしました' : '本文をコピー'}
    </Button>
  )
}

export function CopyImage({ src, label }: { src: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          const blob = await (await fetch(src)).blob()
          // クリップボードは PNG だけを受け付けるので、ほかの形式は描き直してから入れる
          const png = blob.type === 'image/png' ? blob : await toPng(blob)
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          setDone(true)
          setTimeout(() => setDone(false), 2000)
        } catch (e) {
          toast.add({ title: `画像をコピーできませんでした: ${String((e as Error).message)}`, type: 'error' })
        }
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {done ? 'コピーしました' : label}
    </Button>
  )
}

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'))
}

function EyecatchImages({ ctx }: { ctx: WorkCtx; slug: string }) {
  if (!ctx.view.note?.eyecatchReady) return <p className="text-sm text-fg-subtle">下地はまだありません</p>
  const src = `/api/works/${ctx.id}/eyecatch?v=${ctx.view.version}`
  return (
    <div className="flex flex-col gap-2">
      <img src={src} alt="見出し画像の下地" className="w-full max-w-md rounded-md border border-line-subtle" />
      <CopyImage src={src} label="見出し画像の下地をコピー" />
    </div>
  )
}
