// 作品に紐づいていない発表の画面 (公開済みの発表など)。作品に紐づく発表は、作品の画面のタブで開く (ADR-0040)
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { talkApi, useTalk } from '@/lib/talk'
import { Compass, Handoff, TALK_TABS, TabBar, TalkPane, yoursCount, type TalkTab } from './TalkTabs'

const read = (): { tab: TalkTab; scene: string | null } => {
  const [head, rest] = decodeURIComponent(location.hash.slice(1)).split('/')
  return { tab: head === 'flow' || head === 'reads' || head === 'publish' ? head : 'koma', scene: rest ?? null }
}

export function TalkPage({ slug }: { slug: string }) {
  const { data, thumbs, reading } = useTalk(slug)
  const [at, setAt] = useState(read)
  useEffect(() => {
    const on = () => setAt(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  // 作品に紐づく発表は、作品の画面で開く
  useEffect(() => {
    if (data?.work) location.replace(`/works/${data.work.id}#${location.hash.slice(1) || 'koma'}`)
  }, [data?.work])
  if (!data || data.work) return <div className="p-10 text-muted-foreground">読み込み中…</div>
  const go = (tab: TalkTab, scene?: string) => {
    location.hash = scene ? `${tab}/${scene}` : tab
  }
  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="flex items-center gap-3 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <ArrowLeft /> 一覧
          </a>
        </Button>
        <Badge variant="secondary">発表</Badge>
        <span className="font-semibold">{data.board.title || data.talk.title}</span>
        <span className="text-xs text-muted-foreground">{[data.talk.event, data.talk.date, data.board.meta['持ち時間']].filter(Boolean).join('・')}</span>
        <div className="ml-auto">
          <TabBar tabs={TALK_TABS} current={at.tab} onPick={(t) => go(t)} badge={{ reads: yoursCount(data) }} />
        </div>
      </header>
      <Compass oneLiner={data.board.meta['中核メッセージ'] ?? ''} readers={data.readers} right={<Handoff data={data} />} />
      <TalkPane tab={at.tab} data={data} thumbs={thumbs} api={talkApi(slug)} reading={reading} focus={at.scene} go={go} />
    </div>
  )
}
