// 流れの面 (ADR-0040)。発表全体を見渡して、何をどの順で、どれだけの時間で話すかを決める。
// 上の帯は、場面ごとの時間を 1 本に並べたもの。どの章が厚いかと、持ち時間に収まるかがひと目で分かる。
// 下のカード 1 枚がシーン 1 つ。伝えること (1 行) と、かける時間を、その場で直せる。
// slide:ology の「ポストイットを壁に貼って並べ替える」(p.48) と、メッセージマップ (p.39) に当たる
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatGrain, mine, mmss, parseGrain, sceneSeconds, spokenSeconds, toSeconds, type Scene, type Talk, type TalkApi } from '@/lib/talk'

export function FlowView({ data, thumbs, api, onOpen }: { data: Talk; thumbs: number; api: TalkApi; onOpen: (scene: string) => void }) {
  const { board } = data
  const chapters = board.chapters.filter((c) => board.scenes.some((s) => s.chapter === c.name))
  const total = board.scenes.reduce((n, s) => n + sceneSeconds(s), 0)
  const limit = data.talk.minutes
  const over = limit ? total - limit : 0
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32">
      <div className="mx-auto max-w-[1560px]">
        <div className="sticky top-0 z-10 -mx-6 border-b bg-muted/95 px-6 pt-3 pb-2 backdrop-blur">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-2xl font-semibold tabular-nums">{mmss(total)}</span>
            {limit && (
              <span className="text-sm">
                <span className="text-muted-foreground">持ち時間 {mmss(limit)} に対して </span>
                <span className={cn('font-semibold', over > 0 ? 'text-destructive' : 'text-emerald-700')}>{over > 0 ? `${mmss(over)} 超えています` : `${mmss(-over)} 余っています`}</span>
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {board.scenes.length} 場面・{board.scenes.reduce((n, s) => n + s.states.length, 0)} コマ
            </span>
            <span className="ml-auto text-xs text-muted-foreground">時間は、話すことの字数から見積もっています（1 分 300 字）。カードの時間を書き換えると、自分で決められます。</span>
          </div>
          <TimeBar data={data} total={total} limit={limit} />
        </div>

        {chapters.map((ch) => {
          const scenes = board.scenes.filter((s) => s.chapter === ch.name)
          const sec = scenes.reduce((n, s) => n + sceneSeconds(s), 0)
          return (
            <section key={ch.name} className="border-b py-4 last:border-0">
              <div className="mb-2.5 flex items-baseline gap-4">
                <h2 className="shrink-0 font-semibold">{ch.name}</h2>
                {ch.meta['この章で理解すること'] && <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={ch.meta['この章で理解すること']}>{ch.meta['この章で理解すること']}</p>}
                <span className="ml-auto shrink-0 text-sm tabular-nums">
                  {mmss(sec)}
                  {total > 0 && <span className="ml-1.5 text-muted-foreground">全体の {Math.round((sec / total) * 100)}%</span>}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,244px))] items-start gap-3">
                {scenes.map((s, i) => (
                  <SceneCard
                    key={s.id}
                    scene={s}
                    api={api}
                    thumb={data.scenes.some((x) => x.id === s.id) && thumbs > 0 ? api.thumb(s.id, 0, thumbs) : null}
                    yours={data.threads.filter((t) => t.scene === s.id && mine(t)).length}
                    first={i === 0}
                    last={i === scenes.length - 1}
                    onOpen={() => onOpen(s.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** 場面ごとの時間を 1 本に並べた帯。章ごとに濃さを変える。持ち時間を超える所に線を引く */
function TimeBar({ data, total, limit }: { data: Talk; total: number; limit: number | null }) {
  const { board } = data
  const chapters = board.chapters.filter((c) => board.scenes.some((s) => s.chapter === c.name))
  if (total === 0) return null
  return (
    <div className="relative mt-5">
      <div className="flex h-5 overflow-hidden rounded">
        {board.scenes.map((s) => {
          const ci = chapters.findIndex((c) => c.name === s.chapter)
          return (
            <button
              key={s.id}
              title={`${s.title}（${mmss(sceneSeconds(s))}）`}
              onClick={() => document.getElementById(`card-${s.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              style={{ width: `${(sceneSeconds(s) / total) * 100}%` }}
              className={cn('border-r border-background/70 hover:bg-amber-400', ci % 2 === 0 ? 'bg-foreground/55' : 'bg-foreground/30')}
            />
          )
        })}
      </div>
      {limit && limit < total && (
        <div className="absolute -top-4 h-9 border-l-2 border-destructive" style={{ left: `${(limit / total) * 100}%` }}>
          <span className="absolute -top-0.5 left-1 text-xs leading-none whitespace-nowrap text-destructive">持ち時間 {mmss(limit)} はここまで</span>
        </div>
      )}
      <div className="mt-1 flex text-xs text-muted-foreground">
        {chapters.map((c) => {
          const sec = board.scenes.filter((s) => s.chapter === c.name).reduce((n, s) => n + sceneSeconds(s), 0)
          return (
            <span key={c.name} className="truncate pr-1" style={{ width: `${(sec / total) * 100}%` }} title={c.name}>
              {c.name.replace(/（.*）$/, '')}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function SceneCard({ scene, api, thumb, yours, first, last, onOpen }: { scene: Scene; api: TalkApi; thumb: string | null; yours: number; first: boolean; last: boolean; onOpen: () => void }) {
  const tellNow = scene.meta['伝えること'] ?? ''
  const [tell, setTell] = useState(tellNow)
  useEffect(() => setTell(tellNow), [tellNow])
  const { grain, seconds } = parseGrain(scene.meta['粗密'])
  const spoken = spokenSeconds(scene)
  const [time, setTime] = useState(seconds ? mmss(seconds) : '')
  useEffect(() => setTime(seconds ? mmss(seconds) : ''), [seconds])
  const saveTime = () => {
    const next = toSeconds(time)
    if (next === seconds) return
    api.saveMeta(scene.id, '粗密', formatGrain(grain, next))
  }
  // 決めた時間と、話すことの量が大きくずれているときに知らせる
  const gap = seconds ? spoken - seconds : 0
  return (
    <div id={`card-${scene.id}`} className="group relative flex flex-col overflow-hidden rounded-lg border bg-background">
      <button onClick={onOpen} className="relative block bg-muted" title="この場面のコマを開く">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" /> : <div className="grid aspect-video place-items-center text-xs text-muted-foreground">絵はまだ</div>}
        {yours > 0 && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-500 px-2 text-xs font-semibold leading-5 text-white" title={`あなたが答える指摘が ${yours} 件`}>
            答える {yours}
          </span>
        )}
      </button>
      <div className="flex flex-col gap-1 p-2.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-sm leading-snug font-semibold">{scene.title}</span>
          <input
            value={time}
            placeholder={`約 ${mmss(spoken)}`}
            onChange={(e) => setTime(e.target.value)}
            onBlur={saveTime}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            title={`この場面にかける時間。話すことの字数からの見積もりは ${mmss(spoken)}。空にすると見積もりに戻ります`}
            className={cn('w-14 shrink-0 rounded border border-transparent bg-transparent px-1 text-right text-xs tabular-nums outline-none placeholder:text-muted-foreground hover:border-border focus:border-ring', seconds && 'font-semibold')}
          />
        </div>
        <textarea
          value={tell}
          placeholder="この場面で伝えること（1 行）"
          onChange={(e) => setTell(e.target.value)}
          onBlur={() => tell.trim() !== tellNow && api.saveMeta(scene.id, '伝えること', tell)}
          className="field-sizing-content w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs leading-relaxed text-muted-foreground outline-none hover:border-border focus:border-ring focus:text-foreground"
        />
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>{scene.states.length} コマ</span>
          {seconds && Math.abs(gap) >= 15 ? <span className={cn('ml-auto', gap > 0 && 'text-destructive')}>{gap > 0 ? `話すことが ${mmss(gap)} ぶん多い` : `話すことが ${mmss(-gap)} ぶん少ない`}</span> : null}
        </div>
      </div>
      <div className="absolute top-1.5 left-1.5 hidden gap-1 group-hover:flex">
        <button disabled={first} onClick={() => api.move(scene.id, -1)} title="章の中で、1 つ前へ動かす" className="rounded bg-background/90 p-1 shadow disabled:opacity-30">
          <ChevronLeft className="size-3.5" />
        </button>
        <button disabled={last} onClick={() => api.move(scene.id, 1)} title="章の中で、1 つ後ろへ動かす" className="rounded bg-background/90 p-1 shadow disabled:opacity-30">
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
