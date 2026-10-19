// 作品の画面 (design.md 3 章「作品の画面」・ADR-0049)。帯 1 行・左のレール・面 の骨組み。
// 発表も記事も、公開済みも改稿中も、企画シートの無い作品も、この 1 つの骨組みで見せる。
// 面と場所は URL のハッシュ (/works/<key>#<面>/<場所>) に持ち、ルータ (lib/router.ts) から受け取る
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { WorkView } from '../../shared/api'
import { notify } from '@/lib/notice'
import { setTitle, toDraft } from '@/lib/note'
import { navigate, onLinkClick, workHref, type Face } from '@/lib/router'
import { talkApi, toTalk } from '@/lib/talk'
import { cn } from '@/lib/utils'
import { send, useWork, type WorkData } from '@/lib/works'
import { StateLabel } from '../status'
import { FlowView } from '../talk/Flow'
import { KomaView } from '../talk/Koma'
import { PublishView } from '../talk/Publish'
import { ReadsView } from '../talk/Reads'
import { ArchivePublished, ArchiveView } from '../note/ArchiveView'
import { CreateDraft, DraftView } from '../note/DraftView'
import { NotePublishView } from '../note/NotePublish'
import { NoteReadsView } from '../note/NoteReads'
import { OutlineView } from '../note/OutlineView'
import { defaultFace, facesOf } from './faces'
import { FaceFrame } from './FaceBar'
import { PlanFace } from './Plan'
import { Rail } from './Rail'
import { StateMenu } from './StateMenu'

/** 発表と記事で、同じ位置の面は名前が違う。もう片方の名前で来たら、こちらの名前に読み替える */
const SAME: Record<'talk' | 'note', Partial<Record<Face, Face>>> = { talk: { outline: 'flow', draft: 'koma' }, note: { flow: 'outline', koma: 'draft' } }

const RAIL = 'grid-cols-[248px_minmax(0,1fr)]'

export function WorkScreen({ routeKey, face, place, seq }: { routeKey: string; face: Face | null; place: string | null; seq: number }) {
  const data = useWork(routeKey)
  const { view, missing, gone } = data

  // 企画シートに紐づく作品を talk:<slug> などで開いたら、本当の key の URL に置き換える
  useEffect(() => {
    if (view && view.key !== routeKey) navigate(workHref(view.key, face, place), { replace: true })
  }, [view?.key])
  // 面の無い URL と、使えない面への URL は、開ける面の URL に置き換える (面がいつも URL に載るように)
  useEffect(() => {
    if (!view || view.key !== routeKey) return
    const items = facesOf(view)
    const want = face ? (SAME[view.kind][face] ?? face) : null
    const ok = want && items.some((x) => x.face === want && !x.disabled)
    if (!ok) navigate(workHref(view.key, defaultFace(view), null), { replace: true })
    else if (want !== face) navigate(workHref(view.key, want, place), { replace: true })
  }, [view?.key, view?.state.word, !!view?.body, face])
  useEffect(() => {
    if (!gone) return
    notify('この作品は、ごみ箱に移されました。')
    navigate('/', { replace: true })
  }, [gone])
  useEffect(() => {
    document.title = view ? `${view.title || '無題'} — hokuchi studio` : 'hokuchi studio'
  }, [view?.title])

  if (missing)
    return (
      <div className="grid h-screen place-items-center bg-muted/40">
        <div className="grid gap-3 text-center">
          <p className="text-lg font-semibold">作品が見つかりません</p>
          <p className="text-sm text-muted-foreground">ごみ箱に移したか、置き場の名前が変わった可能性があります。</p>
          <BackLink className="justify-self-center" />
        </div>
      </div>
    )
  if (!view)
    return (
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] bg-muted/40">
        <header className={cn('grid h-14 items-center border-b bg-background', RAIL)}>
          <BackLink className="ml-3" />
          <div className="ml-6 h-5 w-72 animate-pulse rounded bg-muted" />
        </header>
        <div className={cn('grid min-h-0', RAIL)}>
          <aside className="border-r bg-background" />
          <div />
        </div>
      </div>
    )

  const f = SAME[view.kind][face ?? defaultFace(view)] ?? face ?? defaultFace(view)
  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] bg-muted/40">
      <header className={cn('grid min-h-14 items-center border-b bg-background', RAIL)}>
        <BackLink className="ml-3 self-center" />
        <div className="flex min-w-0 items-center gap-3 py-2 pr-3 pl-6">
          <Title view={view} />
          <StateLabel state={view.state} className="ml-auto" />
          <StateMenu view={view} />
        </div>
      </header>
      <div className={cn('grid min-h-0', RAIL)}>
        <Rail view={view} face={f} place={place} />
        <main key={f} className="flex min-h-0 animate-in flex-col duration-200 fade-in-0">
          <FaceFrame label={facesOf(view).find((x) => x.face === f)?.label ?? ''}>
            <FaceBody data={data} view={view} face={f} place={place} seq={seq} />
          </FaceFrame>
        </main>
      </div>
    </div>
  )
}

function BackLink({ className }: { className?: string }) {
  return (
    <a href="/" onClick={(e) => onLinkClick(e, '/')} className={cn('inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground', className)}>
      <ArrowLeft className="size-4" /> 作品一覧
    </a>
  )
}

/**
 * 帯のタイトル。省略せず、長ければ折り返す。その場で直し、Enter か欄の外で保存する。
 * 正は中身 (発表は talk.tsx、記事は原稿)。中身が無ければ企画シート。公開した作品は読むだけ
 */
function Title({ view }: { view: WorkView }) {
  const [value, setValue] = useState(view.title)
  useEffect(() => setValue(view.title), [view.title])
  const readOnly = view.state.word === '公開' || (!view.brief && !view.body)
  if (readOnly) return <h1 className="min-w-0 text-lg leading-snug font-semibold">{view.title || '無題'}</h1>
  const save = () => {
    const t = value.trim()
    if (t && t !== view.title) void setTitle(view.key, t)
    else setValue(view.title)
  }
  return (
    <textarea
      aria-label="タイトル"
      rows={1}
      value={value}
      placeholder="タイトル（仮でかまいません）"
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setValue(view.title)
          e.currentTarget.blur()
        }
      }}
      className="field-sizing-content -ml-2 max-w-full min-w-[12em] resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-lg leading-snug font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus:border-ring focus:bg-background"
    />
  )
}

/** まだ使えない面に、URL で直接来たとき */
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto grid max-w-xl gap-2 rounded-lg border border-dashed bg-background p-8 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

/** 面の中身。発表と記事で、同じ位置の面に、媒体ごとの中身を載せる */
function FaceBody({ data, view, face, place, seq }: { data: WorkData; view: WorkView; face: Face; place: string | null; seq: number }) {
  const talk = useMemo(() => toTalk(view), [view])
  const draft = useMemo(() => toDraft(view), [view])
  const tApi = useMemo(() => talkApi(view.key), [view.key])
  const go = (f: Face, p?: string | null) => navigate(workHref(view.key, f, p ?? null))

  if (face === 'plan') return <PlanFace view={view} place={place} />

  if (view.kind === 'talk') {
    if (!talk) return <Empty title="絵コンテはまだありません" text="企画で伝えたいことが決まったら、Claude Code に絵コンテを頼んでください。絵コンテができると、流れ・コマ・読み・公開が使えます。" />
    if (face === 'flow') return <FlowView data={talk} thumbs={data.thumbs} api={tApi} onOpen={(scene) => go('koma', scene)} />
    if (face === 'reads') return <ReadsView data={talk} api={tApi} reading={data.reading} onJump={(scene) => go('koma', scene)} />
    if (face === 'publish') return <PublishView data={talk} />
    return <KomaView data={talk} thumbs={data.thumbs} api={tApi} focus={place} seq={seq} />
  }

  const archive = view.archive
  if (face === 'draft') {
    if (draft) return <DraftView data={draft} focus={place} seq={seq} />
    if (archive) return <ArchiveView view={view} archive={archive} focus={place} seq={seq} />
    if (!view.brief) return <Empty title="原稿がありません" text="この記事には、原稿も企画シートもありません。" />
    return (
      <CreateDraft
        title={view.title}
        onCreate={async (slug) => {
          await send(view.key, '/body', 'POST', { slug }, { quiet: true })
        }}
      />
    )
  }
  if (face === 'publish' && !draft && archive) return <ArchivePublished archive={archive} />
  if (!draft) return <Empty title={archive ? '公開済みの記事です' : '原稿はまだありません'} text={archive ? '構成と読みは、「改稿する」と使えます。原稿の面で記事を読めます。' : '原稿の面で原稿を作ると、構成・読み・公開が使えます。'} />
  if (face === 'outline') return <OutlineView data={draft} onOpen={(n) => go('draft', n ? String(n) : null)} />
  if (face === 'reads') return <NoteReadsView data={draft} reading={data.reading} onJump={(n) => go('draft', n ? String(n) : null)} />
  return <NotePublishView data={draft} />
}
