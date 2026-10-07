// hokuchi studio の画面。左に絵コンテのボード (状態ごとに描画・画面の説明・話すこと)、右にプレビューとチャット
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type State = { screen: string; roles: string[]; notes: string[] }
type Scene = { id: string; title: string; chapter: string | null; meta: Record<string, string>; states: State[]; notes: string[] }
type Board = { title: string; meta: Record<string, string>; chapters: { name: string; meta: Record<string, string> }[]; scenes: Scene[] }
type Studio = {
  talk: { name: string; date: string | null; tag: string | null; title: string }
  board: Board
  scenes: { id: string; steps: number }[]
  loadError: string | null
  thumbsVersion: number
  stageUrl: string
}
type Chat = { kind: 'user' | 'text' | 'tool' | 'done' | 'error' | 'closed'; text: string; draft?: boolean }
type Pick = { scene: string; state: number }

const THEMES = ['', 'mosh', 'hokuchi', 'hokuchi-light']

export function App() {
  const [data, setData] = useState<Studio | null>(null)
  const [thumbs, setThumbs] = useState({ version: 0, errors: [] as string[] })
  const [chat, setChat] = useState<Chat[]>([])
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<Pick | null>(null)
  const [theme, setTheme] = useState('')
  const [check, setCheck] = useState<{ running: boolean; report?: string }>({ running: false })

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((d: Studio) => {
        setData(d)
        setThumbs((t) => ({ ...t, version: d.thumbsVersion }))
        if (d.board.scenes[0]) setPick({ scene: d.board.scenes[0].id, state: 0 })
      })
    const es = new EventSource('/api/events')
    es.addEventListener('board', (e) => setData(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('thumbs', (e) => setThumbs(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('check', (e) => setCheck(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('chat-history', (e) => setChat(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('chat', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as { busy: boolean; kind: string; text: string }
      setBusy(ev.busy)
      setChat((c) => {
        const last = c.at(-1)
        // 書きかけの文は最後の吹き出しに足していき、確定した文で置き換える
        if (ev.kind === 'delta') return last?.draft ? [...c.slice(0, -1), { ...last, text: last.text + ev.text }] : [...c, { kind: 'text', text: ev.text, draft: true }]
        if (ev.kind === 'text' && last?.draft) return [...c.slice(0, -1), { kind: 'text', text: ev.text }]
        return [...c, { kind: ev.kind as Chat['kind'], text: ev.text }]
      })
    })
    return () => es.close()
  }, [])

  // 発表の順に並べた全状態。← → で順に送る
  const order = useMemo(() => (data ? data.board.scenes.flatMap((s) => s.states.map((_, i) => ({ scene: s.id, state: i }))) : []), [data])
  const move = useCallback(
    (d: 1 | -1) =>
      setPick((p) => {
        const i = order.findIndex((o) => o.scene === p?.scene && o.state === p?.state)
        return order[Math.max(0, Math.min(order.length - 1, i + d))] ?? p
      }),
    [order],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [move])

  const send = (text: string, withContext: boolean) => {
    const sc = data?.board.scenes.find((s) => s.id === pick?.scene)
    const st = sc?.states[pick?.state ?? 0]
    const prefix = withContext && pick && st ? `[選択: ${pick.scene} の状態 ${pick.state + 1}「${st.screen}」] ` : ''
    fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: prefix + text }) })
    setBusy(true)
  }

  if (!data) return <div className="loading">読み込み中…</div>
  const scene = data.board.scenes.find((s) => s.id === pick?.scene) ?? null
  const position = pick ? order.findIndex((o) => o.scene === pick.scene && o.state === pick.state) + 1 : 0
  const implemented = data.board.scenes.filter((b) => data.scenes.some((s) => s.id === b.id && s.steps === b.states.length)).length
  const issues = check.report ? (check.report.match(/^- /gm) ?? []).length : null
  const errors = [...(data.loadError ? [data.loadError] : []), ...thumbs.errors]

  return (
    <div className="studio">
      <header>
        <div className="title">
          <strong>{data.board.title || data.talk.title}</strong>
          <span>
            {data.talk.date} {data.talk.tag && `#${data.talk.tag}`}
          </span>
        </div>
        <span className={`pill ${implemented === data.board.scenes.length ? 'ok' : ''}`}>
          {data.board.scenes.length} シーン・{order.length} 状態・実装 {implemented}/{data.board.scenes.length}
        </span>
        <button className="pill" onClick={() => fetch('/api/check', { method: 'POST' })} disabled={check.running}>
          {check.running ? '検査中…' : issues === null ? '検査する' : issues === 0 ? '検査 指摘なし' : `検査 ${issues} 件`}
        </button>
        <div className="actions">
          <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="テーマ">
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t ? `テーマ: ${t}` : 'テーマ: トークの設定'}
              </option>
            ))}
          </select>
          <a href={data.stageUrl} target="_blank" rel="noreferrer">
            別窓で再生
          </a>
          <a href={`${data.stageUrl}?presenter`} target="_blank" rel="noreferrer">
            発表者ビュー
          </a>
        </div>
      </header>

      <main>
        <BoardView data={data} thumbs={thumbs.version} pick={pick} setPick={setPick} errors={errors} report={issues ? check.report : undefined} />
        <section className="side">
          <Preview stageUrl={data.stageUrl} theme={theme} pick={pick} position={position} total={order.length} move={move} />
          <ChatPanel chat={chat} busy={busy} send={send} context={scene && pick ? `${scene.title} ・ 状態 ${pick.state + 1}` : null} />
        </section>
      </main>
    </div>
  )
}

/** 絵コンテのボード。シーンごとに、状態の行 (描画の縮小画像・画面の説明・動きの役割・話すこと) を並べる */
function BoardView({ data, thumbs, pick, setPick, errors, report }: { data: Studio; thumbs: number; pick: Pick | null; setPick: (p: Pick) => void; errors: string[]; report?: string }) {
  const chapters = [...new Set(data.board.scenes.map((s) => s.chapter ?? ''))]
  const active = useRef<HTMLDivElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pick?.scene, pick?.state])
  return (
    <section className="board">
      {errors.length > 0 && (
        <details className="banner error" open>
          <summary>実行時のエラーがあります</summary>
          {errors.map((e, i) => (
            <pre key={i}>{e}</pre>
          ))}
        </details>
      )}
      {report && (
        <details className="banner">
          <summary>検査の指摘</summary>
          <pre>{report}</pre>
        </details>
      )}
      {chapters.map((ch) => (
        <div key={ch} className="chapter">
          <h2>{ch}</h2>
          {data.board.scenes
            .filter((s) => (s.chapter ?? '') === ch)
            .map((s) => {
              const impl = data.scenes.find((x) => x.id === s.id)
              const status = !impl ? '未実装' : impl.steps !== s.states.length ? '状態の数が絵コンテと違う' : null
              return (
                <div key={s.id} className={`scene ${pick?.scene === s.id ? 'current' : ''}`}>
                  <div className="scene-head">
                    <strong>{s.title}</strong>
                    {s.meta['粗密'] && <span className="grain">{s.meta['粗密']}</span>}
                    {status && <span className="pill warn">{status}</span>}
                  </div>
                  {s.meta['伝えること'] && <p className="tell">{s.meta['伝えること']}</p>}
                  {s.states.map((_, i) => {
                    const on = pick?.scene === s.id && pick.state === i
                    return (
                      <StateRow
                        key={i}
                        rowRef={on ? active : undefined}
                        scene={s}
                        index={i}
                        thumb={impl ? `/api/thumb/${s.id}-${i}?v=${thumbs}` : null}
                        active={on}
                        onPick={() => setPick({ scene: s.id, state: i })}
                      />
                    )
                  })}
                </div>
              )
            })}
        </div>
      ))}
    </section>
  )
}

function Preview({ stageUrl, theme, pick, position, total, move }: { stageUrl: string; theme: string; pick: Pick | null; position: number; total: number; move: (d: 1 | -1) => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const src = `${stageUrl}${theme ? `?theme=${theme}` : ''}`
  const go = (play: boolean) => {
    if (pick) frame.current?.contentWindow?.postMessage({ type: 'stage:goto', scene: pick.scene, step: pick.state, play }, '*')
  }
  useEffect(() => {
    go(true)
  }, [pick?.scene, pick?.state])
  return (
    <div className="preview">
      <div className="frame">
        <iframe ref={frame} src={src} title="プレビュー" onLoad={() => setTimeout(() => go(false), 300)} />
      </div>
      <div className="preview-bar">
        <button onClick={() => move(-1)} aria-label="前の状態">
          ←
        </button>
        <button onClick={() => go(true)} disabled={!pick}>
          ▶ 遷移を再生
        </button>
        <button onClick={() => move(1)} aria-label="次の状態">
          →
        </button>
        <span className="position">
          {position} / {total}
        </span>
        <span className="hint">← → キーでも送れます</span>
      </div>
    </div>
  )
}

/** 状態の行。描画の縮小画像・画面の説明・動きの役割・話すこと (その場で直せる) */
function StateRow({ scene, index, thumb, active, onPick, rowRef }: { scene: Scene; index: number; thumb: string | null; active: boolean; onPick: () => void; rowRef?: React.Ref<HTMLDivElement> }) {
  const state = scene.states[index]
  const [notes, setNotes] = useState(scene.notes[index] ?? '')
  const [saved, setSaved] = useState(scene.notes[index] ?? '')
  useEffect(() => {
    setNotes(scene.notes[index] ?? '')
    setSaved(scene.notes[index] ?? '')
  }, [scene.notes[index]])
  const save = () => {
    if (notes === saved) return
    fetch('/api/note', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scene: scene.id, state: index, text: notes }) })
    setSaved(notes)
  }
  return (
    <div ref={rowRef} className={`state ${active ? 'active' : ''}`} onClick={onPick}>
      <div className="thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="nothumb">未実装</div>}</div>
      <div className="state-body">
        <div className="screen">
          <span className="num">{index + 1}</span>
          {state.screen}
          {state.roles.map((r) => (
            <span key={r} className="role">
              {r}
            </span>
          ))}
        </div>
        <textarea className="notes" value={notes} rows={2} placeholder="話すこと" onChange={(e) => setNotes(e.target.value)} onFocus={onPick} onBlur={save} />
        {notes !== saved && <div className="unsaved">未保存 (欄の外をクリックで保存)</div>}
      </div>
    </div>
  )
}

function ChatPanel({ chat, busy, send, context }: { chat: Chat[]; busy: boolean; send: (text: string, withContext: boolean) => void; context: string | null }) {
  const [draft, setDraft] = useState('')
  const [withContext, setWithContext] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [chat, busy])
  const submit = () => {
    const text = draft.trim()
    if (!text) return
    send(text, withContext)
    setDraft('')
  }
  return (
    <div className="chat">
      <div className="messages">
        {chat.length === 0 && <p className="hint">状態を選んで話しかけると、その状態についての相談になります。</p>}
        {chat.map((m, i) =>
          m.kind === 'done' ? null : m.kind === 'user' ? (
            <UserMessage key={i} text={m.text} />
          ) : (
            <div key={i} className={`msg ${m.kind}`}>
              {m.text}
            </div>
          ),
        )}
        {busy && <div className="msg working">Claude が作業中…</div>}
        <div ref={end} />
      </div>
      <div className="composer">
        {context && (
          <button className={`context ${withContext ? '' : 'off'}`} onClick={() => setWithContext((v) => !v)} title="クリックで、選んだ状態を文脈に付けるかを切り替え">
            {withContext ? `「${context}」について` : '全体について'}
          </button>
        )}
        <textarea
          value={draft}
          placeholder="Enter で送信、Shift+Enter で改行"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
      </div>
    </div>
  )
}

// 選んだ状態の文脈 ([選択: …]) は、吹き出しの上に小さく出す
function UserMessage({ text }: { text: string }) {
  const m = text.match(/^\[選択: (\S+) の状態 (\d+)「[\s\S]*?」\] ([\s\S]*)$/)
  return (
    <div className="msg user">
      {m && (
        <div className="msg-context">
          {m[1]} ・ 状態 {m[2]}
        </div>
      )}
      {m ? m[3] : text}
    </div>
  )
}
