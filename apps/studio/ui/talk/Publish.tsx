// 発表の公開の面 (段 4)。記事と同じ型で、確かめる項目を上から順に並べ、最後に公開の依頼文をコピーする。
// 公開は手作業とデプロイの確認が要るので、画面からはしない。公開範囲の正は実物で、企画の「公開しますか」は意図として並べる
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { WorkView } from '../../shared/api'
import { Button } from '@/components/ui/button'
import { onLinkClick, workHref } from '@/lib/router'
import type { Talk } from '@/lib/talk'
import { RequestStep, Step, Steps } from '../work/Steps'
import { BarSummary } from '../work/FaceBar'

export function PublishView({ data, view }: { data: Talk; view: WorkView }) {
  const [cover, setCover] = useState<'loading' | 'ok' | 'none'>('loading')
  const published = view.state.visibility === 'public'
  const intent = String(view.brief?.fields?.publish ?? '')
  const internal = intent === '社内向け'
  const planHref = workHref(view.key, 'plan', 'seed')
  const text = [
    `発表 ${data.talk.dir} を公開してください。`,
    data.talk.outside ? 'いまは公開リポジトリの外にあるので、talks/ に移してから、' : '',
    'talk.tsx を public: true にし、apps/slides/README.md の手順でデプロイしてください。デプロイの前に、私に確認を取ってください。',
  ].join('')
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <BarSummary>
        <span>{published ? 'slides.y-kaz.com に公開しています' : '確かめてから、Claude Code に公開を頼みます'}</span>
      </BarSummary>
      <Steps>
        <Step n={1} title="通しで再生" state={null} help="本番と同じ動きで、最初から再生します。新しいタブで開きます。← → キーで前後に移動できます。">
          <div className="flex gap-2">
            <Button asChild>
              <a href={data.stageUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> 最初から再生
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${data.stageUrl}?presenter`} target="_blank" rel="noreferrer">
                <ExternalLink /> 発表者ビュー
              </a>
            </Button>
          </div>
        </Step>
        <Step n={2} title="表紙の絵（OGP）" state={cover === 'ok' ? 'done' : 'todo'} note={cover === 'none' ? '未設定' : undefined} help="SNS やサイトの一覧に出る絵です。表紙のスライドから撮ります。">
          {cover !== 'none' ? (
            <img src={`${data.stageUrl}og.png`} alt="表紙の絵" onLoad={() => setCover('ok')} onError={() => setCover('none')} className="w-full max-w-md rounded-md border" />
          ) : (
            <p className="text-sm text-muted-foreground">表紙の絵はまだ撮っていません。公開の依頼のときに、Claude Code が撮ります。</p>
          )}
        </Step>
        <Step n={3} title="公開するか" state={published ? 'done' : view.state.notices.length ? 'warn' : intent ? null : 'todo'} note={published ? '公開しています' : view.state.notices.length ? '企画と食い違っています' : intent ? `企画では「${intent}」` : '企画でまだ決めていません'}>
          <div className="grid gap-1.5 text-sm leading-relaxed">
            <p>
              いまの置き場: {published ? 'slides.y-kaz.com に載っています。一度公開したものは、非公開には戻せません。' : data.talk.outside ? '公開リポジトリの外（社内向けの置き場）にあります。' : '公開リポジトリの talks/ にあります（まだサイトには載っていません）。'}
            </p>
            {view.state.notices.map((n) => (
              <p key={n} className="text-amber-800">
                {n}
              </p>
            ))}
            {!intent && !published && (
              <p className="text-muted-foreground">
                <a href={planHref} onClick={(e) => onLinkClick(e, planHref)} className="underline underline-offset-2 hover:text-foreground">
                  企画の段階 1
                </a>
                の「資料を公開しますか」で決めます。
              </p>
            )}
          </div>
        </Step>
        <RequestStep
          n={4}
          title="公開を頼む"
          help="依頼文をコピーして、ターミナルの Claude Code に貼ります。サイトに載ると、作品は「公開」になります。"
          text={text}
          blocked={published ? 'この発表は公開しています。' : internal ? '企画で「社内向け」にしているので、公開しません。公開するときは、企画の段階 1 を変えてください。' : null}
        />
      </Steps>
    </div>
  )
}
