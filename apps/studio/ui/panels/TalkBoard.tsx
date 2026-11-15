import { STRONG, classifyDiff, isChange, type DiffResult } from '../../shared/diff.ts'
// 発表の「絵コンテ」「スライド」「発表」の面。コマ (縮小画像と話すこと) を並べ、流れ (時間) を上に出す。
// 話すことはその場で直せ、コマを指して話せる。発表のステップでは、発表したこととサイトに出すことを扱う
import { CalendarClock, ExternalLink, Play, Presentation, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Callout, CalloutDescription, CalloutTitle, Input, Textarea, cn, toast } from 'takibi-design-system'
import type { SceneView, TalkView } from '../../shared/types'
import { api } from '../lib/api'
import type { WorkCtx } from '../pages/Work'
import { Advance, Frame, PointButton, Section, LinkButton } from './common'
import { Readers } from './Readers'
import { Learnings } from './Learnings'
import { useLoad } from '../lib/api'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function TalkBoard({ ctx }: { ctx: WorkCtx }) {
  const w = ctx.view.work
  const talk = ctx.view.talk
  const step = w.step
  const footer =
    step === 'storyboard' ? (
      <Advance ctx={ctx} action="decide-storyboard" label="この絵コンテで作る" disabled={!talk?.scenes.length} />
    ) : step === 'slides' ? (
      <Advance ctx={ctx} action="ready" label="発表の準備ができた" disabled={!talk?.scenes.length} />
    ) : (
      <Present ctx={ctx} />
    )
  return (
    <Frame ctx={ctx} title={step === 'storyboard' ? '絵コンテ' : step === 'slides' ? 'スライド' : '発表'} lead={`中核メッセージ: ${w.decided.core ?? '未定'}`} footer={footer}>
      {/* 組み立てが見た目の差で止まったら、確かめる画像を本文の先頭に出す (下の帯に入れると本文を覆う) */}
      {step === 'present' && w.decided.scope === 'public' && w.presented && w.deployBlocked ? <SiteDiff count={w.deployBlocked} /> : null}
      {talk?.stageUrl && (
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href={talk.stageUrl}>
            <Play aria-hidden />
            通しで見る
          </LinkButton>
          <LinkButton variant="ghost" href={`${talk.stageUrl}?presenter`}>
            <Presentation aria-hidden />
            発表者ビュー
          </LinkButton>
        </div>
      )}
      {talk && talk.scenes.length > 0 && <Flow talk={talk} />}
      <Section title="コマ" hint={talk?.scenes.length ? '話すことを押すと直せます' : ctx.locked ? 'Claude が書いています。書けたシーンから出ます' : 'まだ絵コンテはありません'}>
        {talk?.thumbErrors.length ? <p className="text-sm text-warning">縮小画像を撮れませんでした: {talk.thumbErrors[0].slice(0, 200)}</p> : null}
        <div className="flex flex-col gap-8">
          {talk?.scenes.map((s) => (
            <Scene key={s.id} ctx={ctx} scene={s} talk={talk} />
          ))}
        </div>
      </Section>
      {w.presented && !w.shipped && <Learnings ctx={ctx} />}
      {!w.presented && <Readers ctx={ctx} />}
    </Frame>
  )
}

/** 話すことの文字数から見積もる秒数。話す速さを 1 分 300 字と置く (測っていない目安) */
const estimate = (s: SceneView) => Math.round(s.koma.reduce((n, k) => n + k.note.replace(/\s/g, '').length, 0) / 5)
const secondsOf = (s: SceneView) => s.seconds ?? estimate(s)

/** シーンごとの時間を 1 本の帯に並べ、持ち時間と比べる。時間を決めていないシーンは、話すことの文字数から見積もる */
function Flow({ talk }: { talk: TalkView }) {
  const limit = (talk.minutes ?? 0) * 60
  const total = talk.scenes.reduce((n, s) => n + secondsOf(s), 0)
  const estimated = talk.scenes.some((s) => s.seconds == null)
  if (!total) return null
  const max = Math.max(total, limit, 1)
  const chapters = [...new Set(talk.scenes.map((s) => s.chapter))]
  return (
    <Section title="流れ" hint={`${estimated ? '見積もり ' : ''}${fmt(total)}${limit ? ` / 持ち時間 ${fmt(limit)}` : ''}`}>
      <div className="relative flex h-6 overflow-hidden rounded-md bg-surface-sunken">
        {talk.scenes.map((s) => (
          <span key={s.id} title={`${s.title} ${fmt(secondsOf(s))}`} className={cn('h-full border-r border-surface', chapters.indexOf(s.chapter) % 2 ? 'bg-brand/60' : 'bg-brand/35')} style={{ width: `${(secondsOf(s) / max) * 100}%` }} />
        ))}
        {limit > 0 && <span className="absolute inset-y-0 w-0.5 bg-fg-strong" style={{ left: `${(limit / max) * 100}%` }} aria-label="持ち時間" />}
      </div>
      {estimated && <p className="text-sm text-fg-muted">時間を決めていないシーンは、話すことの文字数から見積もっています（1 分 300 字）</p>}
      {limit > 0 && total > limit && <p className="text-sm text-warning">持ち時間を {fmt(total - limit)} 超えています</p>}
    </Section>
  )
}

function Scene({ ctx, scene: s, talk }: { ctx: WorkCtx; scene: SceneView; talk: TalkView }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-lg font-semibold text-fg-strong">{s.title}</h4>
        <span className="text-sm text-fg-muted">
          {s.chapter} {s.seconds ? `・${fmt(s.seconds)}` : secondsOf(s) ? `・約 ${fmt(secondsOf(s))}` : ''}
        </span>
        <PointButton ctx={ctx} anchor={{ ref: `s:${s.id}`, label: `シーン「${s.title}」` }} className="ml-auto" />
      </div>
      {s.message && <p className="text-sm text-fg-muted">{s.message}</p>}
      <ol className="flex flex-col gap-3">
        {s.koma.map((k) => (
          <Koma key={k.n} ctx={ctx} scene={s} n={k.n} note={k.note} screen={k.screen} talk={talk} />
        ))}
      </ol>
    </section>
  )
}

function Koma({ ctx, scene, n, note, screen, talk }: { ctx: WorkCtx; scene: SceneView; n: number; note: string; screen: string; talk: TalkView }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note)
  const [broken, setBroken] = useState(false)
  useEffect(() => setText(note), [note])
  useEffect(() => setBroken(false), [talk.thumbsVersion])
  const save = async () => {
    if (text === note) return setEditing(false)
    try {
      ctx.set(await api.koma(ctx.id, scene.id, n, note, text))
      setEditing(false)
    } catch (e) {
      toast.add({ title: String((e as Error).message), description: '打った文は欄に残しています。コピーしてから読み直してください', type: 'error' })
    }
  }
  return (
    <li className="group grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,320px)_1fr]">
      <div className="relative aspect-video overflow-hidden rounded-md border border-line-subtle bg-surface-sunken">
        {!broken && talk.thumbsVersion > 0 ? (
          <img src={`/api/works/${ctx.id}/thumbs/${scene.id}/${n}?v=${talk.thumbsVersion}`} alt={`${scene.title} のコマ ${n}`} className="size-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <p className="p-3 text-sm text-fg-muted">{screen}</p>
        )}
        <Badge className="absolute bottom-2 left-2">{n}</Badge>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {editing ? (
          <Textarea autoFocus rows={Math.max(3, Math.ceil(text.length / 36))} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} aria-label="話すこと" />
        ) : (
          <button type="button" disabled={ctx.locked} onClick={() => setEditing(true)} className="cursor-text whitespace-pre-wrap rounded-md px-2 py-1 text-left text-base leading-7 text-fg hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent">
            {note || <span className="text-fg-subtle">話すことはまだありません</span>}
          </button>
        )}
        <PointButton ctx={ctx} anchor={{ ref: `k:${scene.id}:${n}`, label: `「${scene.title}」のコマ ${n}`, quote: note.slice(0, 24) }} className="self-start opacity-60 group-hover:opacity-100 focus-visible:opacity-100" />
      </div>
    </li>
  )
}

/** 発表のステップの終わり。発表した・日を直す・サイトに出す */
function Present({ ctx }: { ctx: WorkCtx }) {
  const w = ctx.view.work
  const [date, setDate] = useState(w.decided.event?.date ?? '')
  const isPublic = w.decided.scope === 'public'
  const past = !!w.decided.event?.date && w.decided.event.date < new Date().toLocaleDateString('sv-SE')
  if (!w.presented)
    return (
      <div className="flex w-full flex-wrap items-center gap-3">
        {past && (
          <span className="flex items-center gap-1.5 text-sm text-warning">
            <CalendarClock className="size-4" aria-hidden />
            発表する日（{w.decided.event?.date}）を過ぎています
          </span>
        )}
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="発表する日" />
        <Button variant="ghost" disabled={date === (w.decided.event?.date ?? '')} title={date === (w.decided.event?.date ?? '') ? '日付を変えると押せます' : undefined} onClick={() => void ctx.press('set-date', { date })}>
          日を直す
        </Button>
        {!isPublic && (
          <Button variant="secondary" disabled={ctx.locked} onClick={() => void ctx.press('export')}>
            HTML と PDF に書き出す
          </Button>
        )}
        <Advance ctx={ctx} action="presented" label="発表した" />
      </div>
    )
  if (!isPublic) return null
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-fg-muted">{w.deployBlocked ? '上の前後の画像を確かめてから押してください' : 'サイトを組み立て、slides.y-kaz.com に出します'}</span>
        <Button size="lg" className="ml-auto" disabled={ctx.locked} onClick={() => void ctx.press('deploy', { accept: !!w.deployBlocked })}>
          {w.deployBlocked ? <Rocket aria-hidden /> : <ExternalLink aria-hidden />}
          {w.deployBlocked ? 'この変化で出す' : 'サイトに出す'}
        </Button>
      </div>
    </div>
  )
}

/** 「2026-10-31-komekaigi/knowledge-0.before.png」を「2026-10-31-komekaigi の knowledge 1 枚目・前」にする */
const diffLabel = (f: string) => {
  const m = f.match(/^(?:(.+)\/)?(.+)-(\d+)\.(before|after)\.\w+$/)
  return m ? `${m[1] ? `${m[1]} の ` : ''}${m[2]} ${Number(m[3]) + 1} 枚目・${m[4] === 'before' ? '前' : '後'}` : f
}

/** サイトの組み立てが止まったときの、前後の画像。状態ごとに前・後・差を並べる */
function SiteDiff({ count }: { count: number }) {
  const { data } = useLoad<string[]>(() => fetch('/api/site-diff').then((r) => r.json()), [count])
  const pairs = new Map<string, { before?: string; after?: string }>()
  for (const f of data ?? []) {
    const key = f.replace(/\.(before|after)\.\w+$/, '')
    const side = /\.before\./.test(f) ? 'before' : 'after'
    pairs.set(key, { ...pairs.get(key), [side]: f })
  }
  const [results, setResults] = useState<Record<string, boolean>>({})
  const done = Object.keys(results).length
  const visible = Object.values(results).filter(Boolean).length
  return (
    <Callout variant="warning">
      <CalloutTitle>前回と画像が違う状態が {count}件あります</CalloutTitle>
      <CalloutDescription>
        {/* build.mjs は画像のバイトで比べるので、目に見えない描画の揺れでも止まる。目に見える変化かを、ここで分けて伝える */}
        {done > 0 && done === pairs.size && (
          <p className={visible ? 'font-medium text-warning' : 'font-medium text-fg-strong'}>
            {visible ? `${visible}件は見た目が変わっています。赤と黄の所を確かめてください` : `${done}件とも、目に見える変化は見つかりませんでした（強く変わった画素 0 個）。前後を見て決めてください`}
          </p>
        )}
        <p>赤は強く変わった画素、黄は色が少し変わった画素です。画像を押すと原寸で開きます。意図した変化なら「この変化で出す」を押してください。</p>
        <div className="mt-3 flex flex-col gap-4">
          {[...pairs].map(([key, p]) => (p.before && p.after ? <DiffRow key={key} name={diffLabel(p.before).replace(/・前$/, '')} before={p.before} after={p.after} onResult={(v) => setResults((r) => (r[key] === v ? r : { ...r, [key]: v }))} /> : null))}
        </div>
      </CalloutDescription>
    </Callout>
  )
}

const diffUrl = (f: string) => `/api/site-diff/${f.split('/').map(encodeURIComponent).join('/')}`

/** 前と後を読み、強く変わった画素を赤く塗った差の画像を作る。判定は shared/diff.ts の classifyDiff */
function DiffRow({ name, before, after, onResult }: { name: string; before: string; after: string; onResult: (changed: boolean) => void }) {
  const [diff, setDiff] = useState<(DiffResult & { url: string | null }) | null>(null)
  useEffect(() => {
    let alive = true
    const load = (src: string) =>
      new Promise<HTMLImageElement>((ok, ng) => {
        const img = new Image()
        img.onload = () => ok(img)
        img.onerror = ng
        img.src = src
      })
    void Promise.all([load(diffUrl(before)), load(diffUrl(after))])
      .then(([a, b]) => {
        const pixels = (img: HTMLImageElement) => {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const g = c.getContext('2d')!
          g.drawImage(img, 0, 0)
          return { c, g, d: g.getImageData(0, 0, c.width, c.height) }
        }
        const A = pixels(a)
        const B = pixels(b)
        const result = classifyDiff(A.d.data, B.d.data, [A.c.width, A.c.height], [B.c.width, B.c.height])
        if (result.kind === 'size') return alive && setDiff({ ...result, url: null })
        const out = B.g.createImageData(B.c.width, B.c.height)
        for (let i = 0; i < A.d.data.length; i += 4) {
          const d = Math.abs(A.d.data[i] - B.d.data[i]) + Math.abs(A.d.data[i + 1] - B.d.data[i + 1]) + Math.abs(A.d.data[i + 2] - B.d.data[i + 2])
          if (d > STRONG) out.data.set([230, 40, 40, 255], i)
          else if (d > 0) out.data.set([240, 190, 30, 255], i)
          else {
            // 変わっていない所は薄くして、赤を目立たせる
            const v = (B.d.data[i] + B.d.data[i + 1] + B.d.data[i + 2]) / 3
            out.data.set([v, v, v, 70], i)
          }
        }
        B.g.putImageData(out, 0, 0)
        // data: の URL は新しいタブで開けないので、blob: の URL にする
        B.c.toBlob((blob) => alive && blob && setDiff({ ...result, url: URL.createObjectURL(blob) }))
      })
      .catch(() => alive && setDiff(null))
    return () => {
      alive = false
    }
  }, [before, after])
  const changed = !!diff && isChange(diff)
  useEffect(() => {
    if (diff) onResult(changed)
  }, [diff, changed, onResult])
  const label = !diff ? '' : diff.kind === 'size' ? '画像の大きさが変わっています' : diff.kind === 'changed' ? `強く変わった画素 ${diff.strong.toLocaleString()} 個` : diff.kind === 'tint' ? `広い範囲で色が少し変わっています（画素の ${((diff.weak * 100) / diff.total).toFixed(1)}%）` : diff.kind === 'jitter' ? `目に見える変化は見つかりませんでした（色がわずかに揺れた画素 ${diff.weak.toLocaleString()} 個・強く変わった画素 0 個）` : '画素は同じ（画像ファイルの書き方だけが違う）'
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium text-fg-strong">{name}</span>
        {diff && <span className={changed ? 'font-medium text-warning' : 'text-fg-muted'}>{label}</span>}
      </figcaption>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['前', diffUrl(before)],
          ['後', diffUrl(after)],
        ].map(([l, src]) => (
          <a key={l} href={src} target="_blank" rel="noreferrer" className="flex flex-col gap-0.5">
            <img src={src} alt={`${name}・${l}`} className="rounded border border-line-subtle" />
            <span className="text-xs text-fg-muted">{l}</span>
          </a>
        ))}
        <div className="flex flex-col gap-0.5">
          {diff?.url ? (
            <a href={diff.url} target="_blank" rel="noreferrer">
              <img src={diff.url} alt={`${name}・差`} className="rounded border border-line-subtle bg-surface-sunken" />
            </a>
          ) : (
            <div className="aspect-video rounded border border-line-subtle bg-surface-sunken" />
          )}
          <span className="text-xs text-fg-muted">差（赤: 強く変わった・黄: 少し変わった）</span>
        </div>
      </div>
    </figure>
  )
}
