// 話す欄。ホームでは作品を始め、作品の画面では会話を続ける。
// 音声入力の書き起こしを貼る前提で、大きく取る。画像は貼り付け・ドロップ・選ぶの 3 通りで足せる。
// 場所の札 (「ここについて話す」で付く) を並べ、まとめて 1 回で送る
import { ImagePlus, SendHorizontal, Square, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Button, Kbd, Textarea, cn } from 'takibi-design-system'
import type { Anchor } from '../../shared/types'
import { readImage, type Attachment } from '../lib/api'

export type SendInput = { text: string; files: Attachment[]; anchors: Anchor[]; mode: 'after' | 'interrupt' }

export function Composer({
  onSend,
  running = false,
  disabled = false,
  anchors = [],
  onRemoveAnchor,
  placeholder,
  rows = 4,
  leading,
  sendLabel = '送る',
  onStop,
  autoFocus,
  quiet = false,
}: {
  onSend: (input: SendInput) => Promise<unknown>
  running?: boolean
  disabled?: boolean
  anchors?: Anchor[]
  onRemoveAnchor?: (ref: string) => void
  placeholder: string
  rows?: number
  leading?: ReactNode
  sendLabel?: string
  onStop?: () => void
  autoFocus?: boolean
  /** 画面のほかに主ボタンがあるとき (作品の画面) は、送るボタンを控えめにする */
  quiet?: boolean
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const empty = !text.trim() && !files.length && !anchors.length

  const addFiles = async (list: FileList | File[]) => {
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    if (images.length) setFiles([...files, ...(await Promise.all(images.map(readImage)))])
  }

  const send = async (mode: 'after' | 'interrupt') => {
    if (empty || busy || disabled) return
    setBusy(true)
    setError(null)
    try {
      await onSend({ text, files, anchors, mode })
      setText('')
      setFiles([])
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={cn('flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-sunken p-3 focus-within:border-brand', disabled && 'opacity-60')}
      onSubmit={(e) => {
        e.preventDefault()
        void send('after')
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void addFiles(e.dataTransfer.files)
      }}
    >
      {anchors.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="指している場所">
          {anchors.map((a) => (
            <span key={a.ref} className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-sm text-brand">
              <span className="truncate">{a.label}</span>
              {onRemoveAnchor && (
                <button type="button" aria-label={`${a.label} を外す`} className="motion-press-glyph rounded p-0.5 hover:bg-surface-hover" onClick={() => onRemoveAnchor(a.ref)}>
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <Textarea
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault()
            void addFiles(e.clipboardData.files)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void send(running && e.shiftKey ? 'interrupt' : 'after')
          }
        }}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="話す"
        className="resize-y border-0 bg-transparent p-1 text-base leading-7 shadow-none focus-visible:outline-none"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img src={f.data} alt={f.name} className="h-16 w-auto rounded-md border border-line-subtle object-cover" />
              <button type="button" aria-label="画像を外す" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 rounded-full bg-surface-overlay p-0.5 text-fg-muted shadow-pop hover:text-fg">
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files)} />
        <Button type="button" variant="ghost" size="sm" onClick={() => picker.current?.click()} disabled={disabled}>
          <ImagePlus aria-hidden />
          画像
        </Button>
        {!running && (
          <span className="ml-auto hidden text-sm text-fg-subtle sm:inline">
            <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> で送る
          </span>
        )}
        {running ? (
          <>
            {onStop && (
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onStop}>
                <Square aria-hidden />
                止める
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" disabled={empty || busy} onClick={() => void send('interrupt')}>
              止めて送る
            </Button>
            <Button type="submit" size="sm" variant={quiet ? 'secondary' : 'primary'} disabled={empty || busy}>
              終わったら送る
            </Button>
          </>
        ) : (
          <Button type="submit" size="sm" variant={quiet ? 'secondary' : 'primary'} disabled={empty || busy || disabled} status={busy ? 'loading' : 'idle'}>
            <SendHorizontal aria-hidden />
            {sendLabel}
          </Button>
        )}
      </div>
    </form>
  )
}
