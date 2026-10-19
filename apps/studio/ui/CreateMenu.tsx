// ホーム右上の「作成」。押すと「発表」「記事」を選ぶメニューを開く (ADR-0044)
import { ChevronDown, FileText, Plus, Presentation } from 'lucide-react'
import { Button } from './components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import type { Kind } from './lib/stages'

export function CreateMenu({ onPick }: { onPick: (kind: Kind) => void }) {
  const item = 'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus /> 作成 <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <button className={item} onClick={() => onPick('talk')}>
          <Presentation /> 発表
        </button>
        <button className={item} onClick={() => onPick('note')}>
          <FileText /> 記事
        </button>
      </PopoverContent>
    </Popover>
  )
}
