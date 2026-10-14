// 指摘のスレッドの見せ方 (ADR-0040)。1 件の指摘と、その往復を 1 枚にまとめる。
// 話者ができるのは、書く・答える・閉じるの 3 つ。状態を選ばせない
import { useState } from 'react'
import { Check, CornerDownRight, MessageSquarePlus, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { author, type TalkApi, type Thread } from '@/lib/talk'

/** 聴衆役の感想の種類の色。良かった点だけ、別の色にする */
const kindTone = (kind?: string) => (kind === 'good' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-border bg-muted text-muted-foreground')

/** 1 行で書いて Enter で送る欄。Shift+Enter で改行 */
export function Compose({ placeholder, onSend, onCancel, autoFocus = false }: { placeholder: string; onSend: (text: string) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const submit = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }
  return (
    <div className="grid gap-1.5">
      <Textarea
        autoFocus={autoFocus}
        value={text}
        rows={2}
        placeholder={placeholder}
        className="min-h-0 bg-background text-sm"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel?.()
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
          e.preventDefault()
          submit()
        }}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button size="xs" disabled={!text.trim()} onClick={submit}>
          送る
        </Button>
        {onCancel && (
          <Button size="xs" variant="ghost" onClick={onCancel}>
            やめる
          </Button>
        )}
        <span>Enter で送る・Shift+Enter で改行</span>
      </div>
    </div>
  )
}

/** 指摘を書く入口。押すと欄が開く。何件でも書ける */
export function NewThread({ label, onSend }: { label: string; onSend: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <Button variant="ghost" size="xs" className="justify-start text-muted-foreground/70 hover:text-foreground" onClick={() => setOpen(true)}>
        <MessageSquarePlus /> {label}
      </Button>
    )
  return (
    <Compose
      autoFocus
      placeholder="話す内容でも、スライドの見た目でも。気になったことをそのまま"
      onCancel={() => setOpen(false)}
      onSend={(t) => {
        onSend(t)
        setOpen(false)
      }}
    />
  )
}

/** スレッド 1 件。place を渡すと、どのコマへの指摘かを頭に出す (一覧で使う) */
export function ThreadCard({ thread, api, kinds, place, onJump, quiet = false }: { thread: Thread; api: TalkApi; kinds: Record<string, string>; place?: string; onJump?: () => void; quiet?: boolean }) {
  const [replying, setReplying] = useState(false)
  const t = thread
  const mine = t.ball === '話者'
  const closed = t.ball === 'none'
  return (
    <div className={cn('grid gap-2 rounded-lg border bg-background p-3 text-sm', mine && 'border-amber-400 bg-amber-50/60', closed && 'bg-muted/40 text-muted-foreground')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {place && (
          <button className="font-medium underline-offset-2 hover:underline" onClick={onJump} title="このコマを開く">
            {place}
          </button>
        )}
        <span className={cn('font-medium', place && 'text-muted-foreground')}>{author(t)}</span>
        {t.kind && <span className={cn('rounded-full border px-2 py-px text-xs', kindTone(t.kind))}>{kinds[t.kind] ?? t.kind}</span>}
        {mine && !quiet && <Badge className="ml-auto bg-amber-500 text-white">あなたが答える</Badge>}
        {t.ball === 'Claude' && (
          <Badge variant="outline" className="ml-auto">
            Claude が直す
          </Badge>
        )}
        {closed && t.closed && t.closed !== '良かった点' && (
          <Badge variant="outline" className="ml-auto">
            {t.closed}
          </Badge>
        )}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>

      {(t.replies ?? []).map((r, i) => (
        <div key={i} className="flex gap-2 border-l-2 pl-3">
          <CornerDownRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          <div className="grid gap-1 leading-relaxed">
            <div className="text-xs font-medium text-muted-foreground">{r.by === '話者' ? 'あなた' : r.by}</div>
            {r.text && <p className="whitespace-pre-wrap">{r.text}</p>}
            {r.thinking && (
              <p>
                <span className="mr-2 text-xs text-muted-foreground">考えたこと</span>
                {r.thinking}
              </p>
            )}
            {r.change && (
              <p>
                <span className="mr-2 text-xs text-muted-foreground">変えたこと</span>
                {r.change}
              </p>
            )}
          </div>
        </div>
      ))}

      {replying ? (
        <Compose
          autoFocus
          placeholder={mine ? '返事を書く' : '補足を書く'}
          onCancel={() => setReplying(false)}
          onSend={(text) => {
            api.reply(t.id, text)
            setReplying(false)
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {mine && (
            <>
              <Button size="xs" onClick={() => setReplying(true)}>
                答える
              </Button>
              <Button size="xs" variant="outline" onClick={() => api.close(t.id, '直した')} title="この内容で良ければ、これで閉じます">
                <Check /> これでいい
              </Button>
              <Button size="xs" variant="ghost" onClick={() => api.close(t.id, 'そのままにした')} title="直さずに、このままにします">
                直さなくていい
              </Button>
            </>
          )}
          {t.ball === 'Claude' && (
            <>
              <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setReplying(true)}>
                補足する
              </Button>
              <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => api.close(t.id, 'そのままにした')} title={t.by === '話者' ? 'この指摘を取り下げます' : '直さずに、このままにします'}>
                {t.by === '話者' ? '取り下げる' : '直さなくていい'}
              </Button>
            </>
          )}
          {closed && (
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => api.reopen(t.id)}>
              <RotateCcw /> もう一度開く
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
