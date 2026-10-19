// 公開の面の型 (段 4。棚卸しの 3.2)。発表も記事も、確かめる項目を上から順に並べ、最後に依頼文をコピーする。
// 項目の状態は「済み」「まだ」(灰色)「食い違い」(橙) の 3 つ。まだのものを赤や橙にしない
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notice'
import { cn } from '@/lib/utils'

export type StepState = 'done' | 'todo' | 'warn' | null

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mx-auto grid max-w-3xl gap-4">{children}</ol>
}

export function Step({ n, title, state, note, help, children }: { n: number; title: string; state: StepState; note?: string; help?: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <span className={cn('mt-4 grid size-7 place-items-center rounded-full border text-xs font-semibold tabular-nums', state === 'done' ? 'border-foreground bg-foreground text-background' : 'bg-background text-muted-foreground')}>{state === 'done' ? <Check className="size-3.5" /> : n}</span>
      <section className="grid gap-3 rounded-lg border bg-background p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">{title}</h2>
          {note && <span className={cn('text-xs', state === 'warn' ? 'text-amber-700' : state === 'done' ? 'text-muted-foreground' : 'text-muted-foreground/80')}>{note}</span>}
        </div>
        {help && <p className="-mt-1 text-sm leading-relaxed text-muted-foreground">{help}</p>}
        {children}
      </section>
    </li>
  )
}

/** 最後の項目。依頼文をコピーして、ターミナルの Claude Code に貼る */
export function RequestStep({ n, title, help, text, blocked }: { n: number; title: string; help: string; text: string; blocked?: string | null }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    notify('依頼文をコピーしました。ターミナルの Claude Code に貼ってください。')
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <Step n={n} title={title} state={null} help={help}>
      {blocked ? (
        <p className="text-sm text-muted-foreground">{blocked}</p>
      ) : (
        <>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">依頼文を見る</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2.5 leading-relaxed whitespace-pre-wrap">{text}</pre>
          </details>
          <Button className="justify-self-start" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? 'コピーしました' : '依頼文をコピー'}
          </Button>
        </>
      )}
    </Step>
  )
}
