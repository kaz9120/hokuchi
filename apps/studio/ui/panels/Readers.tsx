// 聴衆役の読み。読み手を選んで読んでもらい、点と感想を見る。Claude が見送った感想は戻せる。
// AI が演じる聴衆で、本物の聴衆ではない
import { Undo2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, SelectableTag, TagGroup } from 'takibi-design-system'
import { useLoad } from '../lib/api'
import type { WorkCtx } from '../pages/Work'
import { Section } from './common'

type Persona = { id: string; name: string; label: string; who: string; decided?: boolean }
const LABEL: Record<string, string> = { got: '目的を果たせた', trouble: '悩みに触れた', insight: '新しい見方', follow: '迷わず追えた', hook: '冒頭で読みたくなった', glance: '画面がひと目で分かった', convinced: '納得した', action: 'やってみたい', recommend: '勧めたい' }

export function Readers({ ctx }: { ctx: WorkCtx }) {
  const personas = useLoad<Persona[]>(() => fetch(`/api/works/${ctx.id}/personas`).then((r) => r.json()), [ctx.id])
  const chosen = useLoad<{ persona: string }[]>(() => fetch(`/api/works/${ctx.id}/readers`).then((r) => r.json()), [ctx.id, ctx.view.version])
  const [sel, setSel] = useState<string[]>([])
  useEffect(() => setSel((chosen.data ?? []).map((r) => r.persona)), [chosen.data])
  const reads = ctx.view.reads
  const last = reads?.rounds.at(-1)
  const keys = last ? Object.keys(last.readers[0]?.scores ?? {}) : []
  const asked = reads?.threads.filter((t) => t.ball === '話者') ?? []
  const kept = reads?.threads.filter((t) => t.closed === 'そのままにした' && t.ball !== '話者') ?? []
  const reopened = reads?.threads.filter((t) => t.ball === 'Claude') ?? []
  return (
    <Section title="聴衆役の読み" hint="AI が演じる読み手です。本物の読者ではありません">
      <div className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
        <p className="text-sm text-fg-muted">企画で決めた{ctx.view.work.kind === 'note' ? '読者' : '聴衆'}を先頭に並べています。属性は名前に添えています</p>
        <TagGroup aria-label="読み手">
          {(personas.data ?? []).map((p) => (
            <SelectableTag
              key={p.id}
              pressed={sel.includes(p.id)}
              onPressedChange={(on: boolean) => {
                const next = on ? [...sel, p.id] : sel.filter((x) => x !== p.id)
                setSel(next)
                void ctx.press('set-readers', { readers: next.map((persona) => ({ persona })) })
              }}
            >
              <span title={p.who}>
                {p.name}
                <span className="ml-1 text-fg-muted">（{p.decided && ctx.view.work.kind === 'talk' ? '決めた聴衆' : p.label.length > 24 ? `${p.label.slice(0, 24)}…` : p.label}）</span>
              </span>
            </SelectableTag>
          ))}
        </TagGroup>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={!sel.length || ctx.locked} onClick={() => void ctx.press('read')}>
            <Users aria-hidden />
            {reads?.rounds.length ? 'もう一度読んでもらう' : '聴衆役に読んでもらう'}
          </Button>
          {!sel.length && <span className="text-sm text-fg-muted">読み手を選ぶと頼めます</span>}
        </div>
      </div>
      {last && (
        <div className="overflow-x-auto rounded-lg border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="px-3 py-2 font-medium">{reads!.rounds.length}回目の読み</th>
                {last.readers.map((r) => (
                  <th key={r.name} className="px-3 py-2 font-medium">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-t border-line-subtle">
                  <td className="px-3 py-1.5 text-fg-muted">{LABEL[k] ?? k}</td>
                  {last.readers.map((r) => (
                    <td key={r.name} className={`px-3 py-1.5 tabular-nums ${r.scores[k] <= 2 ? 'text-danger' : r.scores[k] >= 4 ? 'text-success' : 'text-fg'}`}>
                      {r.scores[k]}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-line-subtle align-top">
                <td className="px-3 py-1.5 text-fg-muted">いちばん伝えたかったこと（と読んだ）</td>
                {last.readers.map((r) => (
                  <td key={r.name} className="px-3 py-1.5 text-fg">
                    {r.message}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {reads && (reads.closed.fixed > 0 || kept.length > 0) && (
        <p className="text-sm text-fg-muted">
          Claude が直した感想 {reads.closed.fixed}件・見送った感想 {kept.length}件
        </p>
      )}
      {asked.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-brand">Claude があなたに聞いている感想 {asked.length}件。会話で答えてください</p>
          <ul className="flex flex-col gap-2">
            {asked.map((t) => (
              <li key={t.id} className="flex flex-col gap-1 rounded-md border border-brand/40 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge>{t.where}</Badge>
                  <span className="text-fg-muted">{t.by}</span>
                </div>
                <p className="text-fg">{t.text}</p>
                {t.thinking && <p className="text-fg-muted">Claude が聞きたいこと: {t.thinking}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {kept.length > 0 && (
        <ul className="flex flex-col gap-2">
          {kept.map((t) => (
            <li key={t.id} className="flex flex-col gap-1 rounded-md border border-line-subtle px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge>{t.where}</Badge>
                <span className="text-fg-muted">{t.by}</span>
                <Button size="sm" variant="ghost" className="ml-auto" disabled={ctx.locked} onClick={() => void ctx.press('reopen', { thread: t.id })}>
                  <Undo2 aria-hidden />
                  戻す
                </Button>
              </div>
              <p className="text-fg">{t.text}</p>
              {t.thinking && <p className="text-fg-muted">見送った理由: {t.thinking}</p>}
            </li>
          ))}
        </ul>
      )}
      {reopened.length > 0 && !ctx.locked && (
        <Button variant="secondary" className="self-start" onClick={() => void ctx.press('send-reopened')}>
          戻した感想を直してもらう（{reopened.length}件）
        </Button>
      )}
    </Section>
  )
}
