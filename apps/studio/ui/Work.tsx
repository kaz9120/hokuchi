// 作品の画面 (ADR-0040)。発表 1 本・記事 1 本を、企画から公開までタブで進める。
// 企画 (段階 1〜4) は、左に段階、右にその段階の欄。発表は、絵コンテができたら 流れ・コマ・読み・公開 のタブが使える。
// 伝えたいことと聴衆は、どのタブでも上に出し続ける (slide:ology p.36-37, p.39)。
// 状態は 下書き → 非公開 → 公開 の一方通行。下書きは「非公開にする」、非公開は公開の頼み方を出す (ADR-0043)
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Circle, CircleDot, Info, Loader2, Lock, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { api, type Candidate, type WorkView } from '@/lib/api'
import { cn } from '@/lib/utils'
import { KIND_LABEL, PERSONA_FIELDS, STAGES, audienceSummary, emptyPersona, stageStatus, type Brief, type Field, type Persona, type Stage } from '@/lib/stages'
import { talkApi, useTalk, type Talk } from '@/lib/talk'
import { StatusBadge } from './status'
import { Compass, Handoff, TALK_TABS, TabBar, TalkPane, yoursCount, type TalkTab } from './talk/TalkTabs'

/** 企画シートを読み、直すたびに少し待ってから保存する */
function useBrief(id: string) {
  const [brief, setBrief] = useState<WorkView | null>(null)
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    api.work(id).then(setBrief)
  }, [id])
  const update = useCallback(
    (fn: (b: Brief) => Brief) => {
      setBrief((b) => {
        if (!b) return b
        const next = { ...b, ...fn(b) }
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

/** 企画の段階 (1〜4)。5 から先は、絵コンテのタブで進める */
const PLAN = STAGES.filter((s) => !s.later)
type Tab = 'plan' | TalkTab

/** URL のハッシュから、タブと、その中の場所を読む。企画は段階の key、コマは koma/<シーン> */
function readHash(): { tab: Tab; stage: string; scene: string | null } {
  const h = decodeURIComponent(location.hash.slice(1))
  const [head, rest] = h.split('/')
  if (head === 'flow' || head === 'koma' || head === 'reads' || head === 'publish') return { tab: head, stage: PLAN[0].key, scene: rest ?? null }
  return { tab: 'plan', stage: PLAN.some((s) => s.key === head) ? head : PLAN[0].key, scene: null }
}

export function Work({ id }: { id: string }) {
  const { brief, setBrief, update, saving } = useBrief(id)
  // タブと段階は URL のハッシュに持つ。agentation のメモが場所ごとに分かれ、コピーにも場所が載る
  const [at, setAt] = useState(readHash)
  useEffect(() => {
    const on = () => setAt(readHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = (tab: Tab, where?: string) => {
    location.hash = tab === 'plan' ? (where ?? at.stage) : where ? `${tab}/${where}` : tab
  }
  const { data, thumbs, reading } = useTalk(brief?.talk)

  if (!brief) return <div className="p-10 text-muted-foreground">読み込み中…</div>
  const stage = PLAN.find((s) => s.key === at.stage) ?? PLAN[0]
  const setField = (key: string, value: unknown) => update((b) => ({ ...b, fields: { ...b.fields, [key]: value } }))
  const tabs = [{ key: 'plan' as Tab, label: '企画', hint: '場・聴衆・聞き終えたあと・伝えたいことを決める' }, ...(brief.kind === 'talk' ? TALK_TABS : [])]
  const tab: Tab = at.tab !== 'plan' && !data ? 'plan' : at.tab

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <ArrowLeft /> ホーム
          </a>
        </Button>
        <Badge variant="secondary">{KIND_LABEL[brief.kind]}</Badge>
        <StatusBadge status={brief.published ? 'public' : brief.status === 'private' ? 'private' : 'draft'} />
        <Input
          value={brief.title}
          onChange={(e) => update((b) => ({ ...b, title: e.target.value }))}
          placeholder="タイトル（仮でかまいません）"
          className="h-8 max-w-md border-transparent font-semibold shadow-none hover:border-input focus-visible:border-input"
        />
        {data && (
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            {[data.talk.event, data.talk.date, data.board.meta['持ち時間']].filter(Boolean).join('・')}
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">{saving === 'pending' ? '保存中…' : saving === 'saved' ? '保存済み' : ''}</span>
        <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
          <TabBar tabs={tabs} current={tab} onPick={(t) => (brief.talk || t === 'plan' ? go(t) : undefined)} badge={data ? { reads: yoursCount(data) } : undefined} />
          {!brief.published && (
            <div className="flex items-center gap-1 border-l pl-3">
              <NextStatus brief={brief} talk={data} setBrief={setBrief} />
              {brief.status !== 'private' && <DeleteDraft brief={brief} />}
            </div>
          )}
        </div>
      </header>

      <Compass oneLiner={(brief.fields.oneLiner as string | undefined) ?? ''} readers={data?.readers ?? []} right={data ? <Handoff data={data} /> : <span className="max-w-xs truncate text-xs text-muted-foreground">{audienceSummary(brief)}</span>} />

      {tab === 'plan' || !data || !brief.talk ? (
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
          <StageNav brief={brief} current={stage.key} onPick={(k) => go('plan', k)} />
          <main className="min-h-0 overflow-y-auto px-8 py-6">
            <StagePanel brief={brief} stage={stage} setField={setField} update={update} setBrief={(b: Brief) => setBrief((cur: WorkView | null) => cur && { ...cur, ...b })} />
            {brief.kind === 'talk' && !brief.talk && <p className="mx-auto mt-10 max-w-3xl text-sm text-muted-foreground">伝えたいことが決まったら、Claude Code に絵コンテを頼んでください。絵コンテができると、流れ・コマ・読みのタブが使えます。</p>}
          </main>
        </div>
      ) : (
        <TalkPane tab={tab as TalkTab} data={data} thumbs={thumbs} api={talkApi(brief.talk)} reading={reading} focus={at.scene} go={(t, scene) => go(t, scene)} />
      )}
    </div>
  )
}

/**
 * 下書きなら「非公開にする」(押すと status: private)。非公開なら、公開の頼み方を出す。
 * 公開は手作業とデプロイの確認が要るので、画面からはしない。どちらも戻す操作は置かない (ADR-0043)
 */
function NextStatus({ brief, talk, setBrief }: { brief: WorkView; talk: Talk | null; setBrief: React.Dispatch<React.SetStateAction<WorkView | null>> }) {
  const [busy, setBusy] = useState(false)
  if (brief.status === 'private')
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <Info /> 公開の手順
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 text-sm leading-relaxed">
          {brief.kind === 'talk'
            ? 'Claude Code に公開を頼んでください。発表をリポジトリの talks/ に移して public: true にし、デプロイします。一度公開すると、非公開には戻せません。'
            : 'note に投稿してから、Claude Code にアーカイブへの取り込みを頼んでください。一度公開すると、非公開には戻せません。'}
        </PopoverContent>
      </Popover>
    )
  const finish = async () => {
    setBusy(true)
    try {
      const saved = await api.saveWork(brief.id, { status: 'private' })
      setBrief((b: WorkView | null) => b && { ...b, status: saved.status })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Lock /> 非公開にする
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-96 gap-3 text-sm leading-relaxed">
        <p>非公開にすると、下書きには戻せません。あとから公開できます。</p>
        {talk && !talk.talk.outside && <p className="text-amber-800">この発表はリポジトリの talks/ にあります。非公開の発表はリポジトリの外に置くため、Claude Code に移動を頼んでください。</p>}
        <Button size="sm" className="justify-self-start" disabled={busy} onClick={finish}>
          <Check /> 非公開にする
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** 下書きの削除 (ADR-0044)。消さずにごみ箱へ移す。リポジトリの中のファイルは残し、消し方を案内する */
function DeleteDraft({ brief }: { brief: WorkView }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.deleteWork(brief.id)
      location.href = '/'
    } catch (e) {
      setError(String((e as Error).message))
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Trash2 /> 削除
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-96 gap-3 text-sm leading-relaxed">
        <p className="font-medium">この下書きを削除しますか？</p>
        <p>企画シート{brief.talk && brief.repoFiles.length === 0 ? 'と発表のファイル' : ''}を、ごみ箱（{brief.trashDir}）に移します。</p>
        {brief.repoFiles.length > 0 && (
          <p className="text-amber-800">
            リポジトリのファイル（{brief.repoFiles.join('、')}）は残ります。消すときは Claude Code に頼んでください。
          </p>
        )}
        {error && <p className="text-destructive">{error}</p>}
        <Button size="sm" variant="destructive" className="justify-self-start" disabled={busy} onClick={remove}>
          <Trash2 /> 削除する
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function StageNav({ brief, current, onPick }: { brief: Brief; current: string; onPick: (k: string) => void }) {
  return (
    <nav className="min-h-0 overflow-y-auto border-r bg-background px-2 py-4">
      {PLAN.map((s) => {
        const st = stageStatus(s, brief)
        const Icon = st === 'done' ? Check : st === 'doing' ? CircleDot : Circle
        return (
          <button key={s.key} onClick={() => onPick(s.key)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', current === s.key && 'bg-accent font-medium')}>
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

function StagePanel({ brief, stage, setField, update, setBrief }: { brief: Brief; stage: Stage; setField: (k: string, v: unknown) => void; update: (fn: (b: Brief) => Brief) => void; setBrief: (b: Brief) => void }) {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <div className="text-sm text-muted-foreground">企画 {stage.n} / {PLAN.length}</div>
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
      <AiTasks brief={brief} stage={stage} setBrief={setBrief} update={update} />
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
function AiTasks({ brief, stage, setBrief, update }: { brief: Brief; stage: Stage; setBrief: (b: Brief) => void; update: (fn: (b: Brief) => Brief) => void }) {
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    api.home().then((h) => setLabels(h.tasks))
  }, [])
  const tasks = stage.tasks?.[brief.kind] ?? []
  if (tasks.length === 0) return null
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

