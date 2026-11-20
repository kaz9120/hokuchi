// 記事の「伝えたいこと」の面
import { useEffect, useState } from 'react'
import { Field, FieldLabel, Input, Textarea } from 'takibi-design-system'
import type { Proposals, Reader } from '../../shared/types'
import type { WorkCtx } from '../pages/Work'
import { Advance, Choice, Frame, Section, waitingNote } from './common'

/** 確定した値があればそれ、無ければ候補から始める。話者が触るまでは候補の更新に追従する */
function useDraft<T>(decided: T | undefined, proposed: T | undefined, empty: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(decided ?? proposed ?? empty)
  // Claude が新しい候補を書いたら、話者が触っていても新しい候補に合わせる (会話で直してもらったものを出すため)
  useEffect(() => {
    if (proposed !== undefined) setV(proposed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(proposed)])
  useEffect(() => {
    if (decided !== undefined && proposed === undefined) setV(decided)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(decided)])
  return [v, setV]
}

/** 確定の前に Claude が「直す案」を出したら、候補の先頭に足して選んだことにする */
export function withRevision(p: Proposals): Proposals {
  if (!p.coreRevision?.text || p.core?.some((o) => o.text === p.coreRevision!.text)) return p
  return { ...p, core: [p.coreRevision, ...(p.core ?? [])], picked: { ...p.picked, core: 0 }, coreRevision: undefined }
}

export function NoteCore({ ctx }: { ctx: WorkCtx }) {
  const { decided } = ctx.view.work
  const p = withRevision(ctx.view.proposals)
  const [reader, setReader] = useDraft<Reader>(decided.reader, p.reader, {})
  const [takeaway, setTakeaway] = useDraft<string>(decided.takeaway, p.takeaway, '')
  const [core, setCore] = useDraft<string>(decided.core, p.picked?.core !== undefined ? p.core?.[p.picked.core]?.text : undefined, '')
  return (
    <Frame
      ctx={ctx}
      title="伝えたいこと"
      lead="誰に向けて、何を持ち帰ってほしいか。この記事で言いたいことを 1 文にします"
      footer={<Advance ctx={ctx} action="decide-core" label="この内容で書く" disabled={!core.trim()} hint={!core.trim() ? '伝えたいことを選ぶと進めます' : undefined} payload={() => ({ decided: { core, reader, takeaway } })} />}
    >
      <Section title="読者" hint={waitingNote(ctx)}>
        <div className="grid gap-3">
          <Field>
            <FieldLabel>どんな人か</FieldLabel>
            <Textarea rows={2} value={reader.who ?? ''} onChange={(e) => setReader({ ...reader, who: e.target.value })} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>悩んでいること</FieldLabel>
              <Textarea rows={2} value={reader.trouble ?? ''} onChange={(e) => setReader({ ...reader, trouble: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>知っていること</FieldLabel>
              <Textarea rows={2} value={reader.knows ?? ''} onChange={(e) => setReader({ ...reader, knows: e.target.value })} />
            </Field>
          </div>
          <Field>
            <FieldLabel>持ち帰ってほしいこと</FieldLabel>
            <Input value={takeaway} onChange={(e) => setTakeaway(e.target.value)} />
          </Field>
        </div>
      </Section>
      <Section title="伝えたいこと" hint="主張になっているか・自分の体験から出ているか・読者にとって新しいか">
        <Choice name="伝えたいこと" options={p.core ?? []} value={core} onChange={setCore} picked={p.picked?.core} />
      </Section>
    </Frame>
  )
}
