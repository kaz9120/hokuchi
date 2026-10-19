// 企画の面 (段階 1〜4)。段階はレールの「企画」の子で選び、ここには選んだ段階の欄だけを出す (design.md 3 章)。
// 欄は直すとすぐ手元に映り、少し待ってから企画シートに保存する (works.ts の editBrief)。
// 企画シートの無い作品 (企画を作らずに公開した発表・記事) は「企画シートはありません」と出す
import { useEffect, useState } from 'react'
import { Check, Info, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { WorkView } from '../../shared/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { KIND_LABEL, PERSONA_FIELDS, emptyPersona, stageStatus, type Brief, type Field, type Persona, type Stage } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { call, editBrief, send, useSaving } from '@/lib/works'
import { PLAN_STAGES } from './faces'

type Candidate = { text: string; note: string }

/** Claude に頼めることの名前 (サーバの TASKS)。一度だけ読む */
let taskLabels: Promise<Record<string, string>> | null = null
function useTaskLabels() {
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    taskLabels ??= call<{ tasks: Record<string, string> }>('/api/home').then((h) => h.tasks)
    taskLabels.then(setLabels, () => {})
  }, [])
  return labels
}

/** 変わった欄だけを返す (Claude Code が直したほかの欄を消さないため)。消した欄は null */
function changed(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out[k] = next[k] === undefined ? null : next[k]
  return out
}

export function PlanFace({ view, place }: { view: WorkView; place: string | null }) {
  const saving = useSaving(view.key)
  const brief = view.brief
  if (!brief)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto grid max-w-xl gap-2 rounded-lg border border-dashed bg-background p-8 text-center">
          <h1 className="text-lg font-semibold">企画シートはありません</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">この{KIND_LABEL[view.kind]}は、企画シートを作らずに作りました。{view.kind === 'talk' && view.oneLiner ? '伝えたいことは、絵コンテから読んで出しています。' : ''}</p>
        </div>
      </div>
    )
  const stage = PLAN_STAGES.find((s) => s.key === place) ?? PLAN_STAGES.find((s) => stageStatus(s, brief) !== 'done') ?? PLAN_STAGES[0]
  const update = (fn: (b: Brief) => Brief) => {
    const next = fn(brief)
    editBrief(view.key, { fields: changed(brief.fields, next.fields), gates: changed(brief.gates, next.gates) })
  }
  const setField = (key: string, value: unknown) => editBrief(view.key, { fields: { [key]: value } })
  const next = PLAN_STAGES[PLAN_STAGES.indexOf(stage) + 1]
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 h-5 text-right text-xs text-muted-foreground" aria-live="polite">
          {saving === 'pending' ? '保存中…' : saving === 'saved' ? '保存しました' : ''}
        </div>
        <StagePanel key={stage.key} workKey={view.key} brief={brief} stage={stage} setField={setField} update={update} />
        {brief.kind === 'talk' && !view.body && stage.key === 'oneLiner' && <p className="mt-10 text-sm text-muted-foreground">伝えたいことが決まったら、Claude Code に絵コンテを頼んでください。絵コンテができると、流れ・コマ・読み・公開が使えます。</p>}
        {next && (
          <div className="mt-10 flex justify-end border-t pt-4">
            <Button variant="ghost" size="sm" asChild>
              <a href={`#plan/${next.key}`}>次の段階: {next.title[brief.kind]} →</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function StagePanel({ workKey, brief, stage, setField, update }: { workKey: string; brief: Brief; stage: Stage; setField: (k: string, v: unknown) => void; update: (fn: (b: Brief) => Brief) => void }) {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <div className="text-sm text-muted-foreground">企画 {stage.n} / {PLAN_STAGES.length}</div>
        <h1 className="text-2xl font-semibold">{stage.title[brief.kind]}</h1>
        <p className="mt-2 text-base">{stage.lead[brief.kind]}</p>
      </div>

      {stage.why && (
        <div className="flex gap-3 rounded-lg border bg-background px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">なぜやるのか</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{stage.why[brief.kind]}</p>
            {stage.source && <p className="mt-2 text-xs text-muted-foreground">出典: {stage.source}</p>}
          </div>
        </div>
      )}

      {stage.key === 'audience' && brief.kind === 'talk' ? (
        <Personas personas={brief.fields.personas ?? []} onChange={(p) => setField('personas', p)} />
      ) : (
        <div className="grid gap-5">
          {(stage.fields?.[brief.kind] ?? []).map((f) => (
            <FieldInput key={f.key} field={f} value={brief.fields[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      )}

      {stage.confirm && <Confirm brief={brief} stage={stage} update={update} />}
      <AiTasks workKey={workKey} brief={brief} stage={stage} update={update} />
    </div>
  )
}

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label className="text-base">{field.label}</Label>
      {field.help && <p className="-mt-1 text-sm text-muted-foreground">{field.help}</p>}
      {field.type === 'choice' ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {field.options!.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(value === o.value ? '' : o.value)}
              className={cn('rounded-lg border bg-background px-4 py-2 text-left transition-colors hover:border-foreground/40', value === o.value && 'border-foreground bg-foreground text-background hover:border-foreground')}
            >
              <div className="font-medium">{o.value}</div>
              {o.description && <div className={cn('mt-0.5 text-sm', value === o.value ? 'text-background/80' : 'text-muted-foreground')}>{o.description}</div>}
            </button>
          ))}
        </div>
      ) : field.type === 'textarea' ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={3} className="bg-background" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="bg-background" />
      )}
      {field.example && <Example text={field.example} />}
    </div>
  )
}

/** 書いた例。例であることが一目で分かるよう、欄とは違う見た目にする */
function Example({ text }: { text: string }) {
  const body = text.replace(/^例: /, '')
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      <span className="mr-2 font-medium text-foreground/70">例</span>
      {body}
    </p>
  )
}

/** 聴衆のプロフィールシート。名前のある人として、7 つの問いに答える (slide:ology p.35-37)。聴衆が多様なら複数 */
function Personas({ personas, onChange }: { personas: Persona[]; onChange: (p: Persona[]) => void }) {
  const list = personas.length ? personas : [emptyPersona()]
  const set = (i: number, key: keyof Persona, v: string) => onChange(list.map((p, j) => (j === i ? { ...p, [key]: v } : p)))
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">実在の誰かでも、架空の人でもかまいません。名前を付けると、その人に向けて話す感覚を持ちやすくなります。</p>
      {list.map((p, i) => (
        <Card key={i} className="gap-4">
          <CardHeader className="flex flex-row items-center gap-2">
            <Input value={p.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder={`${i + 1} 人目の名前（例: 佐藤さん）`} className="max-w-72 bg-background" />
            {list.length > 1 && (
              <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="この聴衆を削除">
                <Trash2 />
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {PERSONA_FIELDS.map((f, n) => (
              <div key={f.key} className="grid gap-2">
                <Label className="text-base">
                  {n + 1}. {f.label}
                </Label>
                <p className="-mt-1 text-sm text-muted-foreground">{f.help}</p>
                <Textarea value={p[f.key]} onChange={(e) => set(i, f.key, e.target.value)} rows={2} className="bg-background" />
                <Example text={f.example} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...list, emptyPersona()])}>
        <Plus /> 聴衆を追加
      </Button>
    </div>
  )
}

/** 確定。人が「確定する」を押して進む。確定したあとに中身を変えると、未確定に戻る */
function Confirm({ brief, stage, update }: { brief: Brief; stage: Stage; update: (fn: (b: Brief) => Brief) => void }) {
  const value = (brief.fields[stage.key] as string | undefined) ?? ''
  const st = stageStatus(stage, brief)
  const g = brief.gates[stage.key]
  if (st === 'done')
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <Check className="size-4" /> {g.passedAt.slice(0, 10)} に確定済み。書き換えたら、もう一度確定してください。
      </div>
    )
  return (
    <div className="flex items-center gap-3">
      <Button disabled={!value.trim()} onClick={() => update((b) => ({ ...b, gates: { ...b.gates, [stage.key]: { passedAt: new Date().toISOString(), value } } }))}>
        <Check /> 確定する
      </Button>
      {g && <span className="text-sm text-muted-foreground">確定した内容から変わっています</span>}
    </div>
  )
}

/** 候補を欄に入れる先。入れ先の無い依頼 (指摘・講評) は、読むだけにする */
function applyTarget(task: string, brief: Brief): ((b: Brief, c: Candidate) => Brief) | null {
  const put = (key: string) => (b: Brief, c: Candidate) => ({ ...b, fields: { ...b.fields, [key]: c.text } })
  if (task === 'oneLiner.candidates') return put('oneLiner')
  if (task === 'goal.candidates') return put(brief.kind === 'talk' ? 'callToAction' : 'afterFeeling')
  if (task === 'audience.pushback' && brief.kind === 'talk')
    return (b, c) => {
      const list = b.fields.personas?.length ? b.fields.personas : [emptyPersona()]
      const first = list[0]
      return { ...b, fields: { ...b.fields, personas: [{ ...first, pushback: [first.pushback, c.text].filter(Boolean).join('\n') }, ...list.slice(1)] } }
    }
  return null
}

/** AI に頼めること。使う段階が限られるので、欄の下に小さく置く。候補を選んで欄に入れるのは人 */
function AiTasks({ workKey, brief, stage, update }: { workKey: string; brief: Brief; stage: Stage; update: (fn: (b: Brief) => Brief) => void }) {
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const labels = useTaskLabels()
  const tasks = stage.tasks?.[brief.kind] ?? []
  if (tasks.length === 0) return null
  const run = async (task: string) => {
    setRunning(task)
    setError(null)
    try {
      // 候補は企画シートに残る。読み直しても、まだ送っていない欄は手元のまま残る (works.ts)
      await send(workKey, '/ask', 'POST', { task }, { quiet: true })
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setRunning(null)
    }
  }
  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Claude に頼む</span>
        {tasks.map((t) => (
          <Button key={t} variant="outline" size="sm" disabled={!!running} onClick={() => run(t)}>
            {running === t ? <Loader2 className="animate-spin" /> : <Sparkles />} {labels[t] ?? t}
          </Button>
        ))}
      </div>
      {running && <p className="mt-2 text-sm text-muted-foreground">Claude が考えています（20 秒ほど）。欄は書き換わりません。</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {tasks.map((t) => {
        const c = brief.candidates?.[t]
        if (!c) return null
        const apply = applyTarget(t, brief)
        return (
          <div key={t} className="mt-5">
            <div className="mb-2 flex items-baseline gap-2">
              <div className="text-xs font-medium">{labels[t] ?? t}</div>
              <div className="text-xs text-muted-foreground">{c.at.slice(5, 16).replace('T', ' ')}</div>
            </div>
            <div className="grid gap-2">
              {c.items.map((item, i) => (
                <Card key={i} className="gap-2 py-3">
                  <CardContent className="grid gap-1.5 px-3">
                    <div className="text-sm">{item.text}</div>
                    {item.note && <div className="text-xs text-muted-foreground">{item.note}</div>}
                    {apply && (
                      <Button size="xs" variant="secondary" className="justify-self-start" onClick={() => update((b) => apply(b, item))}>
                        この案を使う
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

