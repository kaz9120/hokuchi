// ステップごとの右の面を選ぶ
import type { WorkCtx } from '../pages/Work'
import { NoteCore, NoteOutline } from './NotePlan'
import { NoteDraft } from './NoteDraft'
import { NotePublish } from './NotePublish'
import { Shipped } from './Shipped'
import { TalkCore, TalkOutline } from './TalkPlan'
import { TalkBoard } from './TalkBoard'

export function Panel({ ctx }: { ctx: WorkCtx }) {
  const w = ctx.view.work
  if (w.shipped && !w.revising && !w.reworking) return <Shipped ctx={ctx} />
  if (w.kind === 'note') {
    if (w.step === 'core') return <NoteCore ctx={ctx} />
    if (w.step === 'outline') return <NoteOutline ctx={ctx} />
    if (w.step === 'draft') return <NoteDraft ctx={ctx} />
    return <NotePublish ctx={ctx} />
  }
  if (w.step === 'core') return <TalkCore ctx={ctx} />
  if (w.step === 'outline') return <TalkOutline ctx={ctx} />
  return <TalkBoard ctx={ctx} />
}
