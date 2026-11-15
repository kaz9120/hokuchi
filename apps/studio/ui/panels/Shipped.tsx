// 出した後の面。片付け (学びの案を選ぶ → 変更を記録する) と、出したものへの行き先
import { Check, ExternalLink, GitCommitHorizontal, Upload } from 'lucide-react'
import { Button } from 'takibi-design-system'
import type { WorkCtx } from '../pages/Work'
import { Frame, Section, LinkButton } from './common'
import { Learnings } from './Learnings'

export function Shipped({ ctx }: { ctx: WorkCtx }) {
  const w = ctx.view.work
  const learnings = ctx.view.proposals.learnings ?? []
  const files = ctx.view.uncommitted ?? []
  const what = w.kind === 'note' ? '公開した記事' : w.decided.scope === 'public' ? 'サイトに出した発表' : '社内で発表した発表'
  return (
    <Frame ctx={ctx} title={ctx.view.chores.length ? '片付け' : '出した'} lead={`${what}（${(w.shipped?.at ?? '').slice(0, 10)}）`}>
      <div className="flex flex-wrap gap-2">
        {w.note?.url && (
          <LinkButton variant="secondary" href={w.note.url}>
            <ExternalLink aria-hidden />
            note で開く
          </LinkButton>
        )}
        {w.kind === 'talk' && ctx.view.talk?.slug && w.decided.scope === 'public' && (
          <LinkButton variant="secondary" href={`https://slides.y-kaz.com/${ctx.view.talk.slug}/`}>
            <ExternalLink aria-hidden />
            slides.y-kaz.com で開く
          </LinkButton>
        )}
        {w.kind === 'note' && (
          <Button variant="ghost" onClick={() => void ctx.press('revise')}>
            改稿する
          </Button>
        )}
        {w.kind === 'talk' && w.decided.scope === 'public' && (
          <Button variant="ghost" disabled={ctx.locked} onClick={() => void ctx.press('rework')}>
            スライドを手直しする
          </Button>
        )}
      </div>
      <Learnings ctx={ctx} />
      <Section title="変更を記録する" hint="git のコミット。取り込みと学びで変わったファイルを 1 回で記録します">
        {!w.learned ? (
          <p className="text-sm text-fg-muted">学びの案を選び終えると、記録できます</p>
        ) : files.length ? (
          <>
            <p className="text-sm text-fg">{summarize(files.map((f) => f.path))}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-fg-muted hover:text-fg">変わったファイル（{files.length}件）</summary>
              <ul className="mt-2 flex flex-col gap-1 rounded-md border border-line-subtle bg-surface-sunken p-3 font-mono text-xs">
                {files.map((f) => (
                  <li key={f.path} className="truncate text-fg">
                    {f.path}
                  </li>
                ))}
              </ul>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button disabled={ctx.locked} onClick={() => void ctx.press('record')}>
                <GitCommitHorizontal aria-hidden />
                変更を記録する
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" aria-hidden />
              {ctx.view.unpushed ? '記録しました' : w.recorded ? '記録して、GitHub に送ってあります' : '記録していない変更はありません'}
            </p>
            {!!ctx.view.unpushed && (
              <Button size="sm" variant="secondary" disabled={ctx.locked} onClick={() => void ctx.press('push')}>
                <Upload aria-hidden />
                GitHub に送る（{ctx.view.unpushed}件）
              </Button>
            )}
          </div>
        )}
      </Section>
    </Frame>
  )
}

/** 変わったファイルを、話者の言葉でまとめる (「取り込んだ記事 1 本・学び 2 か所」) */
function summarize(paths: string[]): string {
  const articles = new Set(paths.filter((p) => p.startsWith('articles/note/') && /\d{4}-\d{2}-\d{2}-/.test(p)).map((p) => p.split('/')[2])).size
  const rules = paths.filter((p) => p.includes('/references/')).length
  const talks = paths.filter((p) => p.startsWith('talks/')).length
  const parts = paths.filter((p) => p.startsWith('packages/') || p.startsWith('parts/')).length
  const out = [articles && `取り込んだ記事 ${articles}本`, rules && `学びを足した規範 ${rules}つ`, talks && `発表のファイル ${talks}件`, parts && `部品 ${parts}件`].filter(Boolean)
  return out.length ? out.join('・') : `${paths.length}件のファイル`
}
