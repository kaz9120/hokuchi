import { cleanLearning } from '../../shared/learning.ts'
// 学びの案。採ったものだけを、スキルの参考資料 (記事は voice.md、発表は style-defaults.md) に 1 行ずつ足す。
// カードは「足す 1 行」と「根拠」を分けて出す
import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Input } from 'takibi-design-system'
import type { Learning } from '../../shared/types'
import type { WorkCtx } from '../pages/Work'
import { Section } from './common'

export function Learnings({ ctx }: { ctx: WorkCtx }) {
  const w = ctx.view.work
  const items = ctx.view.proposals.learnings ?? []
  const file = w.kind === 'note' ? 'writing-note の voice.md' : 'crafting-presentation の style-defaults.md'
  return (
    <Section title="学びの案" hint={`採ったものだけを ${file} に 1 行ずつ足します`}>
      {w.learned ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <Check className="size-4" aria-hidden />
          学びは済みました
        </p>
      ) : items.length ? (
        <ul className="flex flex-col gap-3">
          {items.map((l, i) => (
            <Card key={`${i}-${l.text.slice(0, 12)}`} ctx={ctx} item={l} index={i} />
          ))}
        </ul>
      ) : ctx.locked ? (
        <p className="text-sm text-fg-muted">Claude が学びの案を考えています</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-fg-muted">学びの案はありません</p>
          <Button size="sm" variant="secondary" onClick={() => void ctx.press('learned-none')}>
            学びは無しで済ませる
          </Button>
        </div>
      )}
    </Section>
  )
}

function Card({ ctx, item, index }: { ctx: WorkCtx; item: Learning; index: number }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(cleanLearning(item.text))
  useEffect(() => setText(cleanLearning(item.text)), [item.text])
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-4">
      {editing ? <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="足す 1 行" /> : <p className="text-base font-medium text-fg-strong">{text}</p>}
      {item.note && <p className="text-sm text-fg-muted">根拠: {item.note}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={ctx.locked} onClick={() => void ctx.press('learn', { index, accept: true, text })}>
          <Check aria-hidden />
          足す
        </Button>
        <Button size="sm" variant="ghost" disabled={ctx.locked} onClick={() => setEditing(!editing)}>
          <Pencil aria-hidden />
          {editing ? '直し終える' : '直す'}
        </Button>
        <Button size="sm" variant="ghost" disabled={ctx.locked} onClick={() => void ctx.press('learn', { index, accept: false })}>
          <X aria-hidden />
          捨てる
        </Button>
      </div>
    </li>
  )
}
