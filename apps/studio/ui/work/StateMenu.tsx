// 帯の右端の「⋯」。状態の表がその状態で許す操作 (WorkState.actions) だけを出す。
// 画面は判定を持たない。危険な操作 (削除・改稿をやめる) は、確かめる文を 1 文で出す。パスは出さない
import { useState } from 'react'
import { Check, ExternalLink, FolderOpen, Info, MoreHorizontal, PenLine, TextCursorInput, Trash2, Undo2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Action, ActionResult, WorkView } from '../../shared/api'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { notify } from '@/lib/notice'
import { navigate, workHref } from '@/lib/router'
import { ApiFailure, call, send, workPath } from '@/lib/works'

const ITEMS: Record<Action, { label: string; icon: typeof Check; danger?: boolean }> = {
  finish: { label: '完成にする', icon: Check },
  unfinish: { label: '下書きに戻す', icon: Undo2 },
  'publish-howto': { label: '公開の手順', icon: Info },
  revise: { label: '改稿する', icon: PenLine },
  'cancel-revision': { label: '改稿をやめる', icon: Undo2, danger: true },
  delete: { label: '削除', icon: Trash2, danger: true },
}

/** 公開の頼み方。公開は手作業とデプロイの確認が要るので、画面からはしない */
const HOWTO = {
  talk: 'Claude Code に公開を頼んでください。発表をリポジトリの talks/ に移して public: true にし、デプロイします。一度公開すると、非公開には戻せません。',
  note: 'note に投稿してから、Claude Code にアーカイブへの取り込みを頼んでください。依頼文は「公開」の画面でコピーできます。一度公開すると、非公開には戻せません。',
}

/** 状態の表の操作を送る。改稿は、紐づく作品 (企画シートを作ったときは新しい key) の原稿の面へ移る */
export async function runAction(view: WorkView, action: Action) {
  const r = await send<ActionResult>(view.key, `/actions/${action}`, 'POST', {})
  if (!r) return
  if (action === 'revise') navigate(workHref(r.key, 'draft'), { replace: r.key !== view.key })
  if (action === 'finish') notify('完成にしました。「⋯」から下書きに戻せます。')
  if (action === 'unfinish') notify('下書きに戻しました。')
}

export function StateMenu({ view }: { view: WorkView }) {
  const [confirm, setConfirm] = useState<'delete' | 'cancel-revision' | null>(null)
  const [howto, setHowto] = useState(false)
  // 記事の原稿の置き場の名前 (slug)。ふだんは画面に出さず、ここでだけ見せて直せるようにする
  const slug = view.kind === 'note' && view.body?.kind === 'note' && !view.archive && view.brief ? view.body.slug : null
  const [renaming, setRenaming] = useState<string | null>(null)
  const rename = async () => {
    if (renaming === null || renaming === slug) return setRenaming(null)
    const r = await send(view.key, '/slug', 'PUT', { slug: renaming.trim() })
    if (r) {
      notify('原稿の名前を変えました。')
      setRenaming(null)
    }
  }
  const [busy, setBusy] = useState(false)
  const pick = (a: Action) => {
    if (a === 'delete' || a === 'cancel-revision') return setConfirm(a)
    if (a === 'publish-howto') return setHowto(true)
    void runAction(view, a)
  }
  const dangerous = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await call<ActionResult>(`${workPath(view.key)}/actions/${confirm}`, 'POST', {})
      if (confirm === 'delete') {
        notify('下書きをごみ箱に移しました。')
        navigate('/')
      } else {
        notify('改稿をやめました。公開している記事はそのままです。')
        navigate(workHref(view.key, 'draft'), { replace: true })
      }
      setConfirm(null)
    } catch (e) {
      notify(`できませんでした: ${e instanceof ApiFailure ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  const reveal = () => call(`${workPath(view.key)}/reveal`, 'POST', {}).catch((e) => notify(`開けませんでした: ${(e as Error).message}`, 'error'))
  const safe = view.state.actions.filter((a) => !ITEMS[a].danger)
  const danger = view.state.actions.filter((a) => ITEMS[a].danger)
  const noteUrl = view.archive?.url

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="作品の操作" className="data-[state=open]:bg-accent">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{view.state.label}</DropdownMenuLabel>
          {safe.map((a) => {
            const { label, icon: Icon } = ITEMS[a]
            return (
              <DropdownMenuItem key={a} onSelect={() => pick(a)}>
                <Icon /> {label}
              </DropdownMenuItem>
            )
          })}
          {safe.length > 0 && <DropdownMenuSeparator />}
          {slug && (
            <DropdownMenuItem onSelect={() => setRenaming(slug)}>
              <TextCursorInput /> 原稿の名前を変更…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={reveal}>
            <FolderOpen /> 置き場を開く
          </DropdownMenuItem>
          {noteUrl && (
            <DropdownMenuItem onSelect={() => window.open(noteUrl, '_blank', 'noopener')}>
              <ExternalLink /> note で開く
            </DropdownMenuItem>
          )}
          {danger.length > 0 && <DropdownMenuSeparator />}
          {danger.map((a) => {
            const { label, icon: Icon } = ITEMS[a]
            return (
              <DropdownMenuItem key={a} variant="destructive" onSelect={() => pick(a)}>
                <Icon /> {label}…
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'delete' ? 'この下書きを削除しますか？' : '改稿をやめますか？'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'delete'
                ? `ごみ箱に移すので、あとから戻せます。${view.repoFiles.length ? 'リポジトリの中のファイルは残ります。' : ''}`
                : '直した原稿をごみ箱に移します。公開している記事はそのままです。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void dangerous()
              }}
            >
              {confirm === 'delete' ? '削除する' : '改稿をやめる'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>原稿の名前を変更</AlertDialogTitle>
            <AlertDialogDescription>原稿のフォルダと、公開したあとのアーカイブの名前になります。半角の英小文字・数字・ハイフンで書きます。</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={renaming ?? ''} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void rename()} className="font-mono" aria-label="原稿の名前" />
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={!/^[a-z0-9][a-z0-9-]*$/.test(renaming ?? '')}
              onClick={(e) => {
                e.preventDefault()
                void rename()
              }}
            >
              変更する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={howto} onOpenChange={setHowto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>公開の手順</AlertDialogTitle>
            <AlertDialogDescription>{HOWTO[view.kind]}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>閉じる</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
