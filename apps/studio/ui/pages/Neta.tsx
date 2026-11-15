// ネタ帳。思いついたことを溜め、記事か発表にする。作品にするまで Claude は動かない
import { useState } from 'react'
import { Presentation, StickyNote, Trash2 } from 'lucide-react'
import { Button, EmptyState, EmptyStateDescription, EmptyStateTitle, Heading, Skeleton, toast } from 'takibi-design-system'
import type { Kind, Neta } from '../../shared/types'
import { Composer } from '../components/Composer'
import { Markdown } from '../components/Markdown'
import { api, useLoad } from '../lib/api'
import { navigate } from '../lib/router'

export function NetaPage({ onChange }: { onChange: () => void }) {
  const { data, reload } = useLoad(api.neta, [])
  const start = async (n: Neta, kind: Kind) => {
    const { id } = await api.start(kind, n.text, [], n.file)
    onChange()
    navigate(`/works/${id}`)
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-8 md:px-6">
        <Heading level={1} size="xl">
          ネタ帳
        </Heading>
        <Composer
          rows={2}
          placeholder="思いついたことを一言で"
          sendLabel="ネタ帳に入れる"
          onSend={async ({ text }) => {
            await api.addNeta(text)
            toast.add({ title: 'ネタ帳に入れました' })
            reload()
            onChange()
          }}
        />
        {!data ? (
          <Skeleton className="h-32" />
        ) : data.length === 0 ? (
          <EmptyState variant="compact">
            <EmptyStateTitle>ネタはまだありません</EmptyStateTitle>
            <EmptyStateDescription>思いついたことを上の欄に入れておくと、あとで記事や発表にできます</EmptyStateDescription>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.map((n) => (
              <li key={n.file} className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-fg-subtle tabular-nums">{n.at}</span>
                  <span className="font-semibold text-fg-strong">{n.title}</span>
                </div>
                <NetaBody text={n.text} title={n.title} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void start(n, 'note')}>
                    <StickyNote aria-hidden />
                    記事にする
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void start(n, 'talk')}>
                    <Presentation aria-hidden />
                    発表にする
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={async () => {
                      await api.trashNeta(n.file)
                      reload()
                      onChange()
                    }}
                  >
                    <Trash2 aria-hidden />
                    捨てる
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** ネタの本文。題の行と「〜に話したこと。」の前置きを除き、長ければ畳んで「全部読む」で開く */
function NetaBody({ text, title }: { text: string; title: string }) {
  const [open, setOpen] = useState(false)
  const body = text
    .replace(/^#\s+.+\n+/, '')
    .replace(/^\d{4}-\d{2}-\d{2} に話したこと。\s*\n+/, '')
    .trim()
  if (!body || body === `# ${title}`) return null
  const long = body.length > 160 || body.split('\n').length > 4
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={long && !open ? 'line-clamp-4 text-sm text-fg-muted' : 'text-sm text-fg-muted'}>
        <Markdown text={body} />
      </div>
      {long && (
        <button type="button" className="motion-press text-sm text-brand hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '畳む' : '全部読む'}
        </button>
      )}
    </div>
  )
}
