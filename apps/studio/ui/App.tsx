// 画面は寿命で分ける。やること (いま決める)・作品 (作る)・積み上げ (見返す)・ネタ帳 (溜める)
import { Flame, Library, Lightbulb, ListTodo } from 'lucide-react'
import { useEffect } from 'react'
import { ThemeToggle } from 'takibi-design-system'
import { NotifyButton, useTurnNotifications } from './components/Notifier'
import { api, useEvents, useLoad } from './lib/api'
import { link, usePath } from './lib/router'
import { Home } from './pages/Home'
import { NetaPage } from './pages/Neta'
import { Shelf } from './pages/Shelf'
import { WorkPage } from './pages/Work'

const tabs = [
  { path: '/', label: 'やること', Icon: ListTodo },
  { path: '/shelf', label: '積み上げ', Icon: Library },
  { path: '/neta', label: 'ネタ帳', Icon: Lightbulb },
]

export function App() {
  const path = usePath()
  const home = useLoad(api.home, [])
  useEvents('home', { home: () => home.reload() })
  useTurnNotifications(home.data?.todo ?? null)
  const todo = home.data?.todo.length ?? 0
  useEffect(() => {
    document.title = todo > 0 ? `(${todo}) hokuchi studio` : 'hokuchi studio'
  }, [todo])
  const work = path.match(/^\/works\/([^/]+)/)?.[1]
  return (
    <div className="flex h-dvh flex-col bg-surface text-fg">
      <header className="z-10 shrink-0 border-b border-line-subtle bg-surface">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 md:px-6">
          <a {...link('/')} className="flex items-center gap-2 font-semibold text-fg-strong">
            <Flame className="size-5 text-brand" aria-hidden />
            <span className="hidden sm:inline">hokuchi studio</span>
          </a>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="画面">
            {tabs.map(({ path: to, label, Icon }) => {
              const active = path === to
              return (
                <a key={to} {...link(to)} aria-label={label} aria-current={active ? 'page' : undefined} className={`motion-press flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${active ? 'bg-surface-hover text-fg-strong' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'}`}>
                  <Icon className="size-4" aria-hidden />
                  {/* 狭い画面では 3 つとも見えるように、文字を隠してアイコンだけにする */}
                  <span className="hidden sm:inline">{label}</span>
                  {to === '/' && todo > 0 && <span className="rounded-full bg-brand px-1.5 text-xs font-semibold tabular-nums text-fg-on-brand">{todo}</span>}
                </a>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotifyButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        {work ? <WorkPage id={work} /> : path === '/shelf' ? <Shelf /> : path === '/neta' ? <NetaPage onChange={home.reload} /> : <Home data={home.data} error={home.error} reload={home.reload} />}
      </main>
    </div>
  )
}
