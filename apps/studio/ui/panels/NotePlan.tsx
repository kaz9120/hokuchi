// 記事の「伝えたいこと」と「構成」の面
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Field, FieldLabel, Input, Textarea, ToggleGroup, ToggleGroupItem, toast } from 'takibi-design-system'
import type { Proposals, Reader, Section as Sec } from '../../shared/types'
import { api } from '../lib/api'
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
      footer={<Advance ctx={ctx} action="decide-core" label="この内容で構成へ" disabled={!core.trim()} hint={!core.trim() ? '伝えたいことを選ぶと進めます' : undefined} payload={() => ({ decided: { core, reader, takeaway } })} />}
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

export function NoteOutline({ ctx }: { ctx: WorkCtx }) {
  const note = ctx.view.note
  const hooks = ctx.view.proposals.hook ?? []
  const [sections, setSections] = useState<Sec[]>(note?.outline ?? [])
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) setSections(note?.outline ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.outlineVersion])
  const total = sections.reduce((s, x) => s + (x.budget || 0), 0)
  const hookChosen = !!sections[0]?.point?.trim()
  const thick = sections.filter((s) => s.grain === '密').length
  const save = async () => {
    if (!note || !dirty) return
    try {
      ctx.set(await api.outline(ctx.id, sections, note.outlineVersion))
      setDirty(false)
    } catch (e) {
      toast.add({ title: String((e as Error).message), type: 'error' })
    }
  }
  const edit = (i: number, patch: Partial<Sec>) => {
    setDirty(true)
    setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 1 || j >= sections.length) return
    const next = [...sections]
    ;[next[i], next[j]] = [next[j], next[i]]
    setDirty(true)
    setSections(next)
  }
  return (
    <Frame
      ctx={ctx}
      title="構成"
      lead={`伝えたいこと: ${ctx.view.work.decided.core ?? '未定'}`}
      footer={
        <>
          {dirty && (
            <Button variant="secondary" onClick={() => void save()}>
              構成を保存する
            </Button>
          )}
          <Advance ctx={ctx} action="decide-outline" label="この構成で書く" disabled={sections.length < 2 || dirty || !hookChosen} hint={dirty ? '保存してから進めます' : !hookChosen ? 'フックを選ぶと進めます' : `目安 ${total}字・厚く書く見出し ${thick}つ`} />
        </>
      }
    >
      {(hooks.length > 0 || sections.length > 0) && (
        <Section title="フック" hint="冒頭に置く場面。選ぶと構成の「冒頭」に入ります">
          <Choice
            name="フック"
            options={hooks}
            picked={ctx.view.proposals.picked?.hook}
            value={sections[0]?.point ?? ''}
            rows={2}
            onChange={(v) => {
              if (!note) return
              const next = sections.length ? sections.map((s, i) => (i === 0 ? { ...s, point: v } : s)) : [{ title: '冒頭', point: v, grain: '粗' as const, budget: 60 }]
              setSections(next)
              void api
                .outline(ctx.id, next, note.outlineVersion)
                .then(ctx.set)
                .catch((e) => toast.add({ title: String(e.message), type: 'error' }))
            }}
          />
        </Section>
      )}
      <Section title="見出し" hint={sections.length ? '厚く書くのは 1〜2 か所。短く通る見出しは 150 字まで' : waitingNote(ctx) ?? 'まだ構成はありません'}>
        <ol className="flex flex-col gap-3">
          {sections.map((s, i) => (
            <li key={i} className={`flex flex-col gap-2 rounded-lg border bg-surface-raised p-3 ${s.grain === '密' ? 'border-brand' : 'border-line-subtle'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={s.title} onChange={(e) => edit(i, { title: e.target.value })} onBlur={save} disabled={i === 0} aria-label="見出し" className="min-w-0 flex-1 font-medium" />
                <ToggleGroup size="sm" variant="segmented" value={[s.grain]} onValueChange={(v) => v[0] && edit(i, { grain: v[0] as '密' | '粗' })} aria-label="厚さ">
                  <ToggleGroupItem value="密">厚く書く</ToggleGroupItem>
                  <ToggleGroupItem value="粗">短く通る</ToggleGroupItem>
                </ToggleGroup>
                <Input type="number" value={s.budget} onChange={(e) => edit(i, { budget: Number(e.target.value) })} onBlur={save} aria-label="目安の字数" className="w-24 tabular-nums" />
                <span className="text-sm text-fg-muted">字</span>
                {i > 0 && (
                  <span className="flex">
                    <Button variant="ghost" size="icon-sm" aria-label="上へ" onClick={() => move(i, -1)}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="下へ" onClick={() => move(i, 1)}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="消す"
                      onClick={() => {
                        setDirty(true)
                        setSections(sections.filter((_, j) => j !== i))
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                )}
              </div>
              <Textarea rows={1} value={s.point} onChange={(e) => edit(i, { point: e.target.value })} onBlur={save} aria-label="伝えること" placeholder={i === 0 ? 'フック（冒頭に置く場面）' : 'この見出しで伝えること'} />
            </li>
          ))}
        </ol>
        {sections.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setDirty(true)
              setSections([...sections, { title: '', point: '', grain: '粗', budget: 150 }])
            }}
          >
            <Plus aria-hidden />
            見出しを足す
          </Button>
        )}
      </Section>
    </Frame>
  )
}
