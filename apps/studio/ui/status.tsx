// 作品の状態のバッジ (ADR-0045)。進み具合 (下書き・完成) と公開範囲 (非公開・公開) の 2 つの軸を、別々のバッジで出す。
// 進み具合は話者が決め、公開範囲は実物 (サイトに載る発表・note のアーカイブの記事) から決まる
import { Badge } from './components/ui/badge'
import type { Progress, Visibility } from './lib/api'
import { cn } from './lib/utils'

export const PROGRESS_LABEL: Record<Progress, string> = { draft: '下書き', finished: '完成' }
export const VISIBILITY_LABEL: Record<Visibility, string> = { private: '非公開', public: '公開' }

/** ホームの絞り込みの選択肢 */
export const PROGRESS_OPTIONS: { value: 'all' | Progress; label: string }[] = [{ value: 'all', label: 'すべて' }, ...(['draft', 'finished'] as const).map((value) => ({ value, label: PROGRESS_LABEL[value] }))]
export const VISIBILITY_OPTIONS: { value: 'all' | Visibility; label: string }[] = [{ value: 'all', label: 'すべて' }, ...(['private', 'public'] as const).map((value) => ({ value, label: VISIBILITY_LABEL[value] }))]

const TONE: Record<Progress | Visibility, string> = {
  draft: 'border-transparent bg-amber-100 text-amber-900',
  finished: 'border-transparent bg-sky-100 text-sky-900',
  private: 'text-muted-foreground',
  public: 'border-transparent bg-emerald-100 text-emerald-900',
}

/** 進み具合と公開範囲のバッジを並べる。公開したものは完成なので、公開だけを出す */
export function StateBadges({ progress, visibility, className }: { progress: Progress; visibility: Visibility; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {/* 公開したものは完成なので「公開」だけ。改稿中 (ADR-0047) は「下書き」も並べる */}
      {(visibility !== 'public' || progress === 'draft') && (
        <Badge variant="outline" className={TONE[progress]}>
          {PROGRESS_LABEL[progress]}
        </Badge>
      )}
      <Badge variant="outline" className={TONE[visibility]}>
        {VISIBILITY_LABEL[visibility]}
      </Badge>
    </span>
  )
}
