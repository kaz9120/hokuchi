// 発表の「伝えたいこと」と「構成」の面
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Field, FieldLabel, Input, Textarea, ToggleGroup, ToggleGroupItem } from 'takibi-design-system'
import type { EventInfo, MapRow, Persona, Scope } from '../../shared/types'
import type { WorkCtx } from '../pages/Work'
import { Advance, Choice, Frame, Section, waitingNote } from './common'
import { withRevision } from './NotePlan'

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

export function TalkCore({ ctx }: { ctx: WorkCtx }) {
  const { decided } = ctx.view.work
  const p = withRevision(ctx.view.proposals)
  const hasEvent = decided.event && Object.values(decided.event).some(Boolean)
  const [event, setEvent] = useDraft<EventInfo>(hasEvent ? decided.event : undefined, p.event, {})
  const [scope, setScope] = useDraft<Scope>(p.scope ?? decided.scope, undefined, 'internal')
  const [audience, setAudience] = useDraft<Persona[]>(decided.audience, p.audience, [])
  const [core, setCore] = useDraft<string>(decided.core, p.picked?.core !== undefined ? p.core?.[p.picked.core]?.text : undefined, '')
  return (
    <Frame
      ctx={ctx}
      title="伝えたいこと"
      lead="どこで、誰に、何を理解してもらうか。中核メッセージを 1 文にします"
      footer={<Advance ctx={ctx} action="decide-core" label="この内容で構成へ" disabled={!core.trim()} hint={!core.trim() ? '中核メッセージを選ぶと進めます' : undefined} payload={() => ({ decided: { core, event, scope, audience } })} />}
    >
      <Section title="場" hint={waitingNote(ctx)}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel>イベント</FieldLabel>
            <Input value={event.name ?? ''} onChange={(e) => setEvent({ ...event, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>イベントのページ</FieldLabel>
            <Input value={event.url ?? ''} onChange={(e) => setEvent({ ...event, url: e.target.value })} placeholder="https://" />
          </Field>
          <Field>
            <FieldLabel>発表する日</FieldLabel>
            <Input type="date" value={event.date ?? ''} onChange={(e) => setEvent({ ...event, date: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>持ち時間（分）</FieldLabel>
            <Input type="number" value={event.minutes ?? ''} onChange={(e) => setEvent({ ...event, minutes: Number(e.target.value) || undefined })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-fg-muted">公開範囲</span>
          <ToggleGroup variant="segmented" size="sm" value={[scope]} onValueChange={(v) => v[0] && setScope(v[0] as Scope)} aria-label="公開範囲">
            <ToggleGroupItem value="internal">社内</ToggleGroupItem>
            <ToggleGroupItem value="public">公開（slides.y-kaz.com）</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Section>
      <Section title="聴衆" hint="名前のある 1〜2 人として描く">
        <ul className="flex flex-col gap-3">
          {audience.map((a, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-3">
              <div className="flex items-center gap-2">
                <Input value={a.name} onChange={(e) => setAudience(audience.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="名前" className="font-medium" />
                <Button variant="ghost" size="icon-sm" aria-label="消す" onClick={() => setAudience(audience.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {(['who', 'why', 'trouble', 'solve'] as const).map((k) => (
                <Textarea
                  key={k}
                  rows={1}
                  value={a[k] ?? ''}
                  onChange={(e) => setAudience(audience.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                  aria-label={{ who: 'どんな人か', why: 'なぜ来たか', trouble: '悩み', solve: '聞き終えて得られること' }[k]}
                  placeholder={{ who: 'どんな人か', why: 'なぜ来たか', trouble: '悩み', solve: '聞き終えて得られること' }[k]}
                />
              ))}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAudience([...audience, { name: '' }])}>
          <Plus aria-hidden />
          聴衆を足す
        </Button>
      </Section>
      <Section title="中核メッセージ" hint="理解の形で。反論できる主張になっているか">
        <Choice name="中核メッセージ" options={p.core ?? []} value={core} onChange={setCore} picked={p.picked?.core} />
      </Section>
    </Frame>
  )
}

export function TalkOutline({ ctx }: { ctx: WorkCtx }) {
  const p = ctx.view.proposals
  const [map, setMap] = useDraft<MapRow[]>(undefined, p.map, [])
  const [dir, setDir] = useDraft<string>(ctx.view.work.talk?.dir, p.talkDir, '')
  return (
    <Frame
      ctx={ctx}
      title="構成"
      lead={`中核メッセージ: ${ctx.view.work.decided.core ?? '未定'}`}
      footer={<Advance ctx={ctx} action="decide-map" label="この構成で絵コンテへ" disabled={!map.length} payload={() => ({ decided: { map }, talkDir: dir })} />}
    >
      <Section title="メッセージマップ" hint={map.length ? '章ごとに、聴衆が理解することと厚み' : (waitingNote(ctx) ?? 'まだありません')}>
        <ol className="flex flex-col gap-2">
          {map.map((r, i) => (
            <li key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-line-subtle bg-surface-raised p-3 md:grid-cols-[12rem_1fr_6rem_auto]">
              <Input value={r.chapter} onChange={(e) => setMap(map.map((x, j) => (j === i ? { ...x, chapter: e.target.value } : x)))} aria-label="章" className="font-medium" />
              <Textarea rows={1} value={r.understand} onChange={(e) => setMap(map.map((x, j) => (j === i ? { ...x, understand: e.target.value } : x)))} aria-label="この章で理解すること" />
              <Input value={r.weight} onChange={(e) => setMap(map.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} aria-label="厚み" />
              <Button variant="ghost" size="icon-sm" aria-label="消す" onClick={() => setMap(map.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
        {map.length > 0 && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setMap([...map, { chapter: '', understand: '', weight: '' }])}>
            <Plus aria-hidden />
            章を足す
          </Button>
        )}
      </Section>
      <Section title="フォルダの名前" hint="YYYY_MM_DD_タグ_演題。発表の URL は日付とタグから作られる">
        <Input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="2026_12_05_社内勉強会_演題" className="max-w-xl font-mono" />
      </Section>
    </Frame>
  )
}
