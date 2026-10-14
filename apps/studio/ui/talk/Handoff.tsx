// Claude に渡す (ADR-0040)。Claude の番の指摘が何件あるかを見せ、ターミナルの Claude Code に貼る依頼文を出す。
// 指摘そのものは feedback.yaml にあるので、依頼文は「ファイルを読んで直して」と頼むだけの短い文にする
import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { forClaude, handoffText, type Talk } from '@/lib/talk'

export function Handoff({ data }: { data: Talk }) {
  const [copied, setCopied] = useState(false)
  const list = data.threads.filter(forClaude)
  const own = list.filter((t) => t.by !== '聴衆役').length
  const text = handoffText(data)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={own ? 'default' : 'outline'} size="sm" disabled={list.length === 0}>
          <Send /> Claude に渡す指摘 {list.length} 件
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-[30rem] gap-3 text-sm">
        <p className="leading-relaxed">
          Claude が直す番の指摘が {list.length} 件あります（あなたから {own} 件、聴衆役から {list.length - own} 件）。下の依頼文を、ターミナルの Claude Code に貼ってください。Claude は指摘を読んで直し、確かめたいことがあれば「あなたが答える指摘」に戻します。
        </p>
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2.5 text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>
        <Button
          size="sm"
          className="justify-self-start"
          onClick={() => {
            navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? 'コピーしました' : '依頼文をコピー'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
