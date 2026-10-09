// 作品の画面。左に段階、中央にその段階の欄、右に AI に頼めること。一言と相手は上に出し続ける (docs/design.md の 4)
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, Circle, CircleDot, Info, Loader2, Lock, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, type Candidate } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AUDIENCE_LABEL, KIND_LABEL, PERSONA_FIELDS, STAGES, audienceSummary, emptyPersona, stageStatus, type Brief, type Field, type Persona, type Stage } from '@/lib/stages'

/** 企画シートを読み、直すたびに少し待ってから保存する */
function useBrief(id: string) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    api.work(id).then(setBrief)
  }, [id])
  const update = useCallback(
    (fn: (b: Brief) => Brief) => {
      setBrief((b) => {
        if (!b) return b
        const next = fn(b)
        setSaving('pending')
        clearTimeout(timer.current)
        timer.current = window.setTimeout(async () => {
          await api.saveWork(id, { title: next.title, fields: next.fields, gates: next.gates })
          setSaving('saved')
        }, 600)
        return next
      })
    },
    [id],
  )
  return { brief, setBrief, update, saving }
}

export function Work({ id }: { id: string }) {
  const { brief, setBrief, update, saving } = useBrief(id)
  // 段階は URL のハッシュに持つ。agentation のメモが段階ごとに分かれ、コピーにも段階が載る
  const [stageKey, setStageKey] = useState(() => location.hash.slice(1) || 'seed')
  useEffect(() => {
    if (location.hash.slice(1) !== stageKey) location.hash = stageKey
  }, [stageKey])
  useEffect(() => {
    const on = () => setStageKey(location.hash.slice(1) || 'seed')
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  if (!brief) return <div className="p-10 text-muted-foreground">読み込み中…</div>
  const stage = STAGES.find((s) => s.key === stageKey) ?? STAGES[0]
  const setField = (key: string, value: unknown) => update((b) => ({ ...b, fields: { ...b.fields, [key]: value } }))

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <ArrowLeft /> 一覧
          </a>
        </Button>
        <Badge variant="secondary">{KIND_LABEL[brief.kind]}</Badge>
        <Input
          value={brief.title}
          onChange={(e) => update((b) => ({ ...b, title: e.target.value }))}
          placeholder="仮のタイトル (あとで何度でも変えられます)"
          className="h-8 max-w-md border-transparent shadow-none hover:border-input focus-visible:border-input"
        />
        <span className="ml-auto text-xs text-muted-foreground">{saving === 'pending' ? '保存中…' : saving === 'saved' ? '保存しました' : ''}</span>
      </header>

      <Compass brief={brief} onJump={setStageKey} />

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px]">
        <StageNav brief={brief} current={stage.key} onPick={setStageKey} />
        <main className="min-h-0 overflow-y-auto px-8 py-6">
          <StagePanel brief={brief} stage={stage} setField={setField} update={update} />
        </main>
        <AiPanel brief={brief} stage={stage} setBrief={setBrief} setField={setField} update={update} />
      </div>
    </div>
  )
}

/** 一言と相手。決めたあとは、どの段階にいても見えるようにする (slide:ology p.39 のメッセージマップと同じ考え) */
function Compass({ brief, onJump }: { brief: Brief; onJump: (k: string) => void }) {
  const one = brief.fields.oneLiner as string | undefined
  const who = audienceSummary(brief)
  const decided = stageStatus(STAGES.find((s) => s.key === 'oneLiner')!, brief) === 'done'
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 border-b bg-background px-6 py-2 text-sm">
      <button className="flex min-w-0 items-baseline gap-2 text-left" onClick={() => onJump('oneLiner')}>
        <span className="shrink-0 text-xs text-muted-foreground">伝えたいこと</span>
        <span className={cn('truncate', !one && 'text-muted-foreground')}>{one || 'まだ決めていません'}</span>
        {one && !decided && <Badge variant="outline">未確定</Badge>}
      </button>
      <button className="flex min-w-0 items-baseline gap-2 text-left" onClick={() => onJump('audience')}>
        <span className="shrink-0 text-xs text-muted-foreground">{AUDIENCE_LABEL[brief.kind]}</span>
        <span className={cn('truncate', !who && 'text-muted-foreground')}>{who || 'まだ決めていません'}</span>
      </button>
    </div>
  )
}

function StageNav({ brief, current, onPick }: { brief: Brief; current: string; onPick: (k: string) => void }) {
  return (
    <nav className="min-h-0 overflow-y-auto border-r bg-background px-2 py-4">
      {STAGES.map((s) => {
        const st = stageStatus(s, brief)
        const Icon = s.later ? Lock : st === 'done' ? Check : st === 'doing' ? CircleDot : Circle
        return (
          <button
            key={s.key}
            onClick={() => onPick(s.key)}
            className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', current === s.key && 'bg-accent font-medium', s.later && 'text-muted-foreground')}
          >
            <Icon className={cn('size-4 shrink-0', st === 'done' && 'text-emerald-600')} />
            <span>
              {s.n}. {s.title[brief.kind]}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function StagePanel({ brief, stage, setField, update }: { brief: Brief; stage: Stage; setField: (k: string, v: unknown) => void; update: (fn: (b: Brief) => Brief) => void }) {
  const oneLinerDone = stageStatus(STAGES.find((s) => s.key === 'oneLiner')!, brief) === 'done'
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <div className="text-sm text-muted-foreground">段階 {stage.n} / {STAGES.length}</div>
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

      {stage.n > 4 && !oneLinerDone && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>伝えたいことが、まだ確定していません</AlertTitle>
          <AlertDescription>先に進んでもかまいません。ただ、伝えたいことが決まらないまま構成や本文に入ると、何を残して何を削るかを判断できません。</AlertDescription>
        </Alert>
      )}

      {stage.later ? (
        <Card>
          <CardContent className="text-muted-foreground">この段階の画面は、まだ作っていません。次の試作で作ります。</CardContent>
        </Card>
      ) : stage.key === 'audience' && brief.kind === 'talk' ? (
        <Personas personas={brief.fields.personas ?? []} onChange={(p) => setField('personas', p)} />
      ) : (
        <div className="grid gap-5">
          {(stage.fields?.[brief.kind] ?? []).map((f) => (
            <FieldInput key={f.key} field={f} value={brief.fields[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      )}

      {stage.confirm && !stage.later && <Confirm brief={brief} stage={stage} update={update} />}
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
            <Input value={p.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder={`${i + 1} 人目の名前 (例: 佐藤さん)`} className="max-w-72 bg-background" />
            {list.length > 1 && (
              <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="この人を消す">
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
        <Plus /> 別の層の聴衆を描く
      </Button>
    </div>
  )
}

/** 確定。人が「この内容で確定する」を押して進む。確定したあとに中身を変えると、未確定に戻る */
function Confirm({ brief, stage, update }: { brief: Brief; stage: Stage; update: (fn: (b: Brief) => Brief) => void }) {
  const value = (brief.fields[stage.key] as string | undefined) ?? ''
  const st = stageStatus(stage, brief)
  const g = brief.gates[stage.key]
  if (st === 'done')
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <Check className="size-4" /> {g.passedAt.slice(0, 10)} に確定しました。書き直すと、もう一度確定が必要になります。
      </div>
    )
  return (
    <div className="flex items-center gap-3">
      <Button disabled={!value.trim()} onClick={() => update((b) => ({ ...b, gates: { ...b.gates, [stage.key]: { passedAt: new Date().toISOString(), value } } }))}>
        <Check /> この内容で確定する
      </Button>
      {g && <span className="text-sm text-muted-foreground">前に確定した内容から変わっています</span>}
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

/** AI に頼めること。候補は欄の横に並べ、選んだものだけを人が欄に入れる */
function AiPanel({ brief, stage, setBrief, update }: { brief: Brief; stage: Stage; setBrief: (b: Brief) => void; setField: (k: string, v: unknown) => void; update: (fn: (b: Brief) => Brief) => void }) {
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    api.home().then((h) => setLabels(h.tasks))
  }, [])
  const tasks = stage.tasks?.[brief.kind] ?? []
  const run = async (task: string) => {
    setRunning(task)
    setError(null)
    try {
      await api.ask(brief.id, task)
      // 候補は企画シートに残る。読み直して、手元の未保存の欄はそのまま残す
      const fresh = await api.work(brief.id)
      setBrief({ ...brief, candidates: fresh.candidates })
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setRunning(null)
    }
  }
  return (
    <aside className="min-h-0 overflow-y-auto border-l bg-background px-4 py-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4" /> AI に頼めること
      </div>
      <p className="mb-3 text-sm text-muted-foreground">AI は案や意見を出すだけで、欄は書き換えません。使いたい案だけ「この案を使う」で欄に入れます。</p>
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">{stage.later ? 'この段階は、まだ作っていません。' : 'この段階は、自分の言葉で書くことに集中します。AI に頼めることはありません。'}</p>}
      <div className="grid gap-2">
        {tasks.map((t) => (
          <Button key={t} variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" disabled={!!running} onClick={() => run(t)}>
            {running === t ? <Loader2 className="animate-spin" /> : <Sparkles />} {labels[t] ?? t}
          </Button>
        ))}
      </div>
      {running && <p className="mt-2 text-sm text-muted-foreground">Claude に聞いています。20 秒ほどかかります。</p>}
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
    </aside>
  )
}

