// 発表 1 本の、絵コンテから先の面 (ADR-0040)。流れ・コマ・読み・公開を切り替える。
// 作品の画面 (Work.tsx) の中に入る。作品に紐づいていない発表では、単独の画面として出す
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { mine, type Persona, type Talk, type TalkApi } from '@/lib/talk'
import { FlowView } from './Flow'
import { Handoff } from './Handoff'
import { KomaView } from './Koma'
import { ReadsView } from './Reads'

export type TalkTab = 'flow' | 'koma' | 'reads' | 'publish'
export const TALK_TABS: { key: TalkTab; label: string; hint: string }[] = [
  { key: 'flow', label: '流れ', hint: '発表全体を見渡して、順序と時間を決める' },
  { key: 'koma', label: 'コマ', hint: '絵コンテを読んで、話すことを直し、指摘を書く' },
  { key: 'reads', label: '読み', hint: '聴衆役に読んでもらい、指摘に答える' },
  { key: 'publish', label: '公開', hint: '通しで見て、公開する' },
]

/** タブの並び。企画のタブは、作品の画面が先頭に足す */
export function TabBar<T extends string>({ tabs, current, onPick, badge }: { tabs: { key: T; label: string; hint: string }[]; current: T; onPick: (t: T) => void; badge?: Partial<Record<T, number>> }) {
  return (
    <nav className="flex items-center gap-1">
      {tabs.map((t) => (
        <button key={t.key} title={t.hint} onClick={() => onPick(t.key)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-accent', current === t.key ? 'bg-foreground text-background hover:bg-foreground' : 'text-muted-foreground')}>
          {t.label}
          {badge?.[t.key] ? <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{badge[t.key]}</span> : null}
        </button>
      ))}
    </nav>
  )
}

/** 伝えたいことと聴衆。決めたあとも、どの面でも見えるようにする (slide:ology p.36-37, p.39) */
export function Compass({ oneLiner, readers, right }: { oneLiner: string; readers: Persona[]; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b bg-background px-4 py-1.5 text-sm">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">伝えたいこと</span>
        <span className={cn('truncate', !oneLiner && 'text-muted-foreground')} title={oneLiner}>
          {oneLiner || 'まだ決めていません'}
        </span>
      </div>
      {readers.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">聴衆</span>
          {readers.map((p) => (
            <Popover key={p.id}>
              <PopoverTrigger asChild>
                <button className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent">{p.name}</button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-96 gap-2 text-sm leading-relaxed">
                <div className="font-semibold">
                  {p.name}（{p.label}）
                </div>
                <Row label="どんな人か" text={p.who} />
                <Row label="悩み" text={p.troubles} />
                <Row label="なぜここにいるか" text={p.why} />
                <Row label="引っかかりやすい点" text={p.pushback} />
              </PopoverContent>
            </Popover>
          ))}
        </div>
      )}
      {right}
    </div>
  )
}
const Row = ({ label, text }: { label: string; text: string }) =>
  text ? (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {text}
    </div>
  ) : null

/** 選んだタブの中身 */
export function TalkPane({ tab, data, thumbs, api, reading, focus, go }: { tab: TalkTab; data: Talk; thumbs: number; api: TalkApi; reading: Talk['reading']; focus: string | null; go: (tab: TalkTab, scene?: string) => void }) {
  if (tab === 'flow') return <FlowView data={data} thumbs={thumbs} api={api} onOpen={(scene) => go('koma', scene)} />
  if (tab === 'reads') return <ReadsView data={data} api={api} reading={reading} onJump={(scene) => go('koma', scene)} />
  if (tab === 'publish') return <PublishView data={data} />
  return <KomaView data={data} thumbs={thumbs} api={api} focus={focus} />
}

export const yoursCount = (data: Talk) => data.threads.filter(mine).length
export { Handoff }

/** 公開の面。いまは、通して見る入口だけ。公開の可否・OGP・振り返りは、これから作る */
function PublishView({ data }: { data: Talk }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto grid max-w-2xl gap-6">
        <div className="grid gap-3 rounded-lg border bg-background p-5">
          <h2 className="font-semibold">通して見る</h2>
          <p className="text-sm text-muted-foreground">発表を、本番と同じ動きで最初から見ます。別の窓が開きます。← → で前後に送れます。</p>
          <div className="flex gap-2">
            <Button asChild>
              <a href={data.stageUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> 最初から通して見る
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${data.stageUrl}?presenter`} target="_blank" rel="noreferrer">
                <ExternalLink /> 発表者の画面（話すこと付き）
              </a>
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">公開するかどうか、OGP の確認、リハーサルと当日の振り返りは、これから作ります。いまは、公開の作業をターミナルの Claude Code に頼んでください。</p>
      </div>
    </div>
  )
}
