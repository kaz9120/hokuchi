// 作品の状態 (ADR-0043)。下書き → 非公開 → 公開の一方通行で、戻す操作は置かない。
// 公開は実物 (サイトに載る発表・note のアーカイブの記事) から決まり、企画シートには非公開にしたことだけを書く
import { Badge } from './components/ui/badge'
import type { Status } from './lib/api'
import { cn } from './lib/utils'

export const STATUS_LABEL: Record<Status, string> = { draft: '下書き', private: '非公開', public: '公開' }

const TONE: Record<Status, string> = {
  draft: 'bg-amber-100 text-amber-900',
  private: 'bg-slate-200 text-slate-800',
  public: 'bg-emerald-100 text-emerald-900',
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent', TONE[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
