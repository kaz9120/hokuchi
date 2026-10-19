// 発表の公開の面。いまは、通して見る入口だけ。公開の可否・OGP・振り返りは、これから作る (段 4)
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Talk } from '@/lib/talk'

/** 公開の面。いまは、通して見る入口だけ。公開の可否・OGP・振り返りは、これから作る */
export function PublishView({ data }: { data: Talk }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto grid max-w-2xl gap-6">
        <div className="grid gap-3 rounded-lg border bg-background p-5">
          <h2 className="font-semibold">通しで再生</h2>
          <p className="text-sm text-muted-foreground">本番と同じ動きで、最初から再生します。新しいタブで開きます。← → キーで前後に移動できます。</p>
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
        </div>
        <p className="text-sm text-muted-foreground">公開の設定・OGP の確認・振り返りは準備中です。いまは Claude Code に公開を頼んでください。</p>
      </div>
    </div>
  )
}
