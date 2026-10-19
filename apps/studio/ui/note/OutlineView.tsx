// 構成の面 (ADR-0046)。発表の流れの面に当たる。記事全体を見渡して、見出しの並び・フック・密にする場所・字数の予算を決める。
// 上の帯は、見出しごとの実際の字数を 1 本に並べたもの (密は濃く、粗は薄く)。下に予算の帯を並べ、どこが太ったかを見比べる。
// カード 1 枚が見出し 1 つ。writing-note skill の Phase 3 と references/somitsu.md の決め方を、その場で直せる形にする
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import { BarSummary } from '../work/FaceBar'
import { draftApi, type Draft, type Section, type SectionChars } from '../lib/note'

/** 粗のブロックの字数の目安 (somitsu.md)。超えたら、粗になっていない */
const ROUGH_MAX = 150
/** 密は 2 つまで */
const DENSE_MAX = 2

export function OutlineView({ data, onOpen }: { data: Draft; onOpen: (n: number | null) => void }) {
  const api = useMemo(() => draftApi(data.key), [data.key])
  const saved = data.outline.sections
  const [sections, setSections] = useState<Section[]>(saved)
  // Claude Code が outline.yaml を直したら、画面も読み直す
  useEffect(() => setSections(saved), [JSON.stringify(saved)])
  const save = (next: Section[]) => {
    setSections(next)
    api.saveOutline(next)
  }
  const actual = (title: string) => data.sections.find((s) => s.title === title)
  const fromDraft = () => save(mergeFromDraft(sections, data.sections))

  if (sections.length === 0)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto grid max-w-xl gap-4 rounded-lg border bg-background p-6">
          <h2 className="text-lg font-semibold">構成はまだありません</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            本文を書く前に、見出しの並びと、どこを厚く書くかを決めます。厚く書くのは、伝えたいことを読者が信じる根拠になる場面で、1 つ（長い記事でも 2 つまで）です。ほかは短く通り過ぎます。
          </p>
          <div className="flex gap-2">
            {data.sections.length > 1 && <Button onClick={fromDraft}>原稿の見出しから作成</Button>}
            <Button variant={data.sections.length > 1 ? 'outline' : 'default'} onClick={() => save([{ title: '冒頭', point: '', grain: '粗', budget: 60 }, { title: '', point: '', grain: '密', budget: 600 }])}>
              <Plus /> 見出しを追加
            </Button>
          </div>
        </div>
      </div>
    )

  const set = (i: number, patch: Partial<Section>) => save(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...sections]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    save(next)
  }
  const missingInDraft = sections.slice(1).filter((s) => s.title && !actual(s.title))
  const missingInOutline = data.sections.slice(1).filter((d) => !sections.some((s) => s.title === d.title))
  const dense = sections.filter((s) => s.grain === '密')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto max-w-[1400px]">
        <Band data={data} sections={sections} actual={actual} />

        {(missingInDraft.length > 0 || missingInOutline.length > 0 || dense.length > DENSE_MAX) && (
          <div className="mt-4 grid gap-1.5 rounded-md border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm">
            {dense.length > DENSE_MAX && <p>厚く書く見出しが {dense.length} つあります。2 つまでにします。いちばん伝えたいことの根拠になる場面だけを残してください。</p>}
            {missingInDraft.length > 0 && <p>原稿に無い見出し: {missingInDraft.map((s) => `「${s.title}」`).join(' ')}</p>}
            {missingInOutline.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span>構成に無い見出し: {missingInOutline.map((s) => `「${s.title}」`).join(' ')}</span>
                <Button size="xs" variant="outline" onClick={fromDraft}>
                  原稿の見出しを取り込む
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] items-start gap-3">
          {sections.map((s, i) => (
            <SectionCard
              key={i}
              index={i}
              section={s}
              actual={actual(s.title)}
              last={i === sections.length - 1}
              onChange={(patch) => set(i, patch)}
              onMove={(d) => move(i, d)}
              onRemove={() => save(sections.filter((_, j) => j !== i))}
              onOpen={() => onOpen(actual(s.title)?.n ?? null)}
            />
          ))}
          <button onClick={() => save([...sections, { title: '', point: '', grain: '粗', budget: ROUGH_MAX }])} className="grid min-h-40 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-background hover:text-foreground">
            <span className="flex items-center gap-1">
              <Plus className="size-4" /> 見出しを追加
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

/** 原稿の見出しのうち、構成に無いものを足す。並びは原稿に合わせ、構成だけにある見出しは後ろに残す */
function mergeFromDraft(sections: Section[], drafted: SectionChars[]): Section[] {
  const head = sections[0] ?? { title: '冒頭', point: '', grain: '粗' as const, budget: 60 }
  const rest = drafted.slice(1).map((d) => sections.find((s) => s.title === d.title) ?? { title: d.title, point: '', grain: '粗' as const, budget: ROUGH_MAX })
  const only = sections.slice(1).filter((s) => !drafted.some((d) => d.title === s.title))
  return [head, ...rest, ...only]
}

/** 上の帯。予算の合計と実際の字数を並べ、見出しごとの太さを 2 本の帯で見比べる */
function Band({ data, sections, actual }: { data: Draft; sections: Section[]; actual: (t: string) => SectionChars | undefined }) {
  const budget = sections.reduce((n, s) => n + s.budget, 0)
  const total = data.stats.chars
  const diff = total - budget
  const denseChars = sections.filter((s) => s.grain === '密').reduce((n, s) => n + (actual(s.title)?.chars ?? 0), 0)
  const denseShare = total ? denseChars / total : 0
  const scale = Math.max(total, budget, 1)
  return (
    <div className="sticky top-0 z-10 -mx-6 border-b bg-muted/95 px-6 pt-1 pb-3 backdrop-blur">
      <BarSummary>
        <span className="text-lg font-semibold text-foreground tabular-nums">{total.toLocaleString()} 字</span>
        <span className="text-sm">
          <span className="text-muted-foreground">目安 {budget.toLocaleString()} 字に対して </span>
          <span className={cn('font-semibold', diff > budget * 0.15 ? 'text-amber-700' : 'text-emerald-700')}>{diff >= 0 ? `${diff.toLocaleString()} 字多い` : `${(-diff).toLocaleString()} 字少ない`}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {sections.length} 見出し・厚く書く {sections.filter((s) => s.grain === '密').length} つ
          {total > 0 && sections.some((s) => s.grain === '密') && (
            <span className={cn('ml-2', denseShare < 0.3 && 'text-amber-700')}>
              厚く書く見出しが本文の {Math.round(denseShare * 100)}%{denseShare < 0.3 ? '（3 割に届いていません）' : ''}
            </span>
          )}
        </span>
        <span className="text-xs">字数は原稿の地の文（空白を除く）。見出し・画像・埋め込みは数えません。</span>
      </BarSummary>
      <div className="mt-2 grid grid-cols-[3.5em_1fr] items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>実際</span>
        <Bar sections={sections} value={(s) => actual(s.title)?.chars ?? 0} scale={scale} />
        <span>目安</span>
        <Bar sections={sections} value={(s) => s.budget} scale={scale} faint />
      </div>
    </div>
  )
}

function Bar({ sections, value, scale, faint = false }: { sections: Section[]; value: (s: Section) => number; scale: number; faint?: boolean }) {
  return (
    <div className="flex h-4 overflow-hidden rounded bg-background">
      {sections.map((s, i) => {
        const v = value(s)
        if (!v) return null
        return (
          <span
            key={i}
            title={`${s.title || '（見出し未定）'}・${s.grain === '密' ? '厚く書く' : '短く通る'}・${v.toLocaleString()} 字`}
            style={{ width: `${(v / scale) * 100}%` }}
            className={cn('border-r border-background/80', s.grain === '密' ? (faint ? 'bg-foreground/35' : 'bg-foreground/70') : faint ? 'bg-foreground/12' : 'bg-foreground/25')}
          />
        )
      })}
    </div>
  )
}

/** 見出し 1 つ。見出し・伝えること・密か粗か・予算・実際の字数を、その場で直す */
function SectionCard({ index, section, actual, last, onChange, onMove, onRemove, onOpen }: { index: number; section: Section; actual: SectionChars | undefined; last: boolean; onChange: (p: Partial<Section>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; onOpen: () => void }) {
  const lead = index === 0
  const [title, setTitle] = useState(section.title)
  const [point, setPoint] = useState(section.point)
  const [budget, setBudget] = useState(String(section.budget || ''))
  useEffect(() => setTitle(section.title), [section.title])
  useEffect(() => setPoint(section.point), [section.point])
  useEffect(() => setBudget(String(section.budget || '')), [section.budget])
  const chars = actual?.chars ?? null
  // 粗なのに太っている・予算を大きく超えている、を知らせる
  const warn = chars === null ? null : section.grain === '粗' && chars > ROUGH_MAX ? `短く通る見出しですが、${chars} 字あります（${ROUGH_MAX} 字までが目安）` : section.budget && chars > section.budget * 1.3 ? `目安より ${chars - section.budget} 字多い` : null
  return (
    <div className={cn('group grid gap-2 rounded-lg border bg-background p-3', section.grain === '密' && 'border-foreground/40 shadow-sm')}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">{lead ? 'フック' : `見出し ${index}`}</span>
        <div className="ml-auto flex rounded-md border p-0.5 text-xs">
          {(['密', '粗'] as const).map((g) => (
            <button key={g} onClick={() => g !== section.grain && onChange({ grain: g })} className={cn('rounded px-2 py-0.5', section.grain === g ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')} title={g === '密' ? '厚く書く: その場にカメラを置いたように、場面を描き切る' : '短く通る: 1〜2 文で通り過ぎる。論点は 1 つだけ'}>
              {g === '密' ? '厚く' : '短く'}
            </button>
          ))}
        </div>
      </div>
      {lead ? (
        <div className="px-1 font-semibold">冒頭</div>
      ) : (
        <textarea
          value={title}
          rows={1}
          placeholder="見出し（言い切る）"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
          onBlur={() => title.trim() !== section.title && onChange({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
          className="field-sizing-content resize-none rounded border border-transparent bg-transparent px-1 leading-snug font-semibold outline-none hover:border-border focus:border-ring"
        />
      )}
      <textarea
        value={point}
        placeholder={lead ? 'フック（冒頭に置く場面・引っかかった瞬間）' : 'この見出しで伝えること'}
        onChange={(e) => setPoint(e.target.value)}
        onBlur={() => point.trim() !== section.point && onChange({ point: point.trim() })}
        className="field-sizing-content min-h-12 resize-none rounded border border-transparent bg-transparent px-1 text-sm leading-relaxed text-muted-foreground outline-none hover:border-border focus:border-ring focus:text-foreground"
      />
      <div className="flex items-center gap-2 px-1 text-xs">
        <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground">
          目安
          <input
            value={budget}
            inputMode="numeric"
            onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => Number(budget || 0) !== section.budget && onChange({ budget: Number(budget || 0) })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-14 rounded border border-transparent bg-transparent px-1 text-right tabular-nums outline-none hover:border-border focus:border-ring"
          />
          字
        </label>
        {chars !== null ? (
          <button onClick={onOpen} className="ml-auto whitespace-nowrap text-muted-foreground tabular-nums hover:text-foreground hover:underline" title="原稿でこの見出しを開く">
            実際 {chars.toLocaleString()} 字
          </button>
        ) : (
          <span className="ml-auto whitespace-nowrap text-amber-700">原稿に無い</span>
        )}
      </div>
      {warn && <p className="px-1 text-xs text-amber-700">{warn}</p>}
      {!lead && (
        <div className="hidden items-center gap-1 group-hover:flex">
          <button disabled={index <= 1} onClick={() => onMove(-1)} title="前へ移動" className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30">
            <ChevronLeft className="size-3.5" />
          </button>
          <button disabled={last} onClick={() => onMove(1)} title="後ろへ移動" className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30">
            <ChevronRight className="size-3.5" />
          </button>
          <button onClick={onRemove} title="この見出しを構成から削除" className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
