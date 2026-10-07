// hokuchi studio の画面。左にチャット、中央に絵コンテのボード、右にプレビュー
import { useEffect, useMemo, useRef, useState } from 'react'

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
type Chat = { kind: 'user' | 'text' | 'tool' | 'done' | 'error' | 'closed'; text: string }
type Pick = { scene: string; state: number } | null

const THEMES = ['', 'mosh', 'hokuchi', 'hokuchi-light']

export function App() {
  const [data, setData] = useState<Studio | null>(null)
  const [thumbs, setThumbs] = useState({ version: 0, errors: [] as string[] })
  const [chat, setChat] = useState<Chat[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<Pick>(null)
  const [theme, setTheme] = useState('')
  const [check, setCheck] = useState<{ running: boolean; report?: string }>({ running: false })

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((d: Studio) => {
        setData(d)
        setThumbs((t) => ({ ...t, version: d.thumbsVersion }))
      })
    const es = new EventSource('/api/events')
    es.addEventListener('board', (e) => setData(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('thumbs', (e) => setThumbs(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('check', (e) => setCheck(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('chat-history', (e) => setChat(JSON.parse((e as MessageEvent).data)))
    es.addEventListener('chat', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as Chat & { busy: boolean }
      setBusy(ev.busy)
      setChat((c) => {
        if ((ev.kind as string) === 'delta') {
          // 書きかけの文を、最後の吹き出しに足していく
          const last = c.at(-1)
          if (last && last.kind === 'text' && (last as Chat & { draft?: boolean }).draft) return [...c.slice(0, -1), { ...last, text: last.text + ev.text }]
          return [...c, { kind: 'text', text: ev.text, draft: true } as Chat]
        }
        if (ev.kind === 'text') {
          // 確定した文で、書きかけの吹き出しを置き換える
          const last = c.at(-1) as (Chat & { draft?: boolean }) | undefined
          if (last?.draft) return [...c.slice(0, -1), { kind: 'text', text: ev.text }]
        }
        return [...c, { kind: ev.kind, text: ev.text }]
      })
    })
    return () => es.close()
  }, [])

  const selected = useMemo(() => {
    if (!pick || !data) return null
    const sc = data.board.scenes.find((s) => s.id === pick.scene)
    return sc ? { scene: sc, state: sc.states[pick.state] } : null
  }, [pick, data])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    const prefix = selected ? `[選択: ${selected.scene.id} の状態 ${pick!.state + 1}「${selected.state?.screen ?? ''}」] ` : ''
    fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: prefix + text }) })
    setDraft('')
    setBusy(true)
  }

  if (!data) return <div className="loading">読み込み中…</div>
  const implemented = data.board.scenes.filter((b) => data.scenes.some((s) => s.id === b.id && s.steps === b.states.length)).length
  const states = data.board.scenes.reduce((n, s) => n + s.states.length, 0)
  const issues = check.report ? (check.report.match(/^- /gm) ?? []).length : null

  return (
    <div className="studio">
      <header>
        <div className="title">
          <strong>{data.board.title || data.talk.title}</strong>
          <span>
            {data.talk.date} {data.talk.tag && `#${data.talk.tag}`}
          </span>
        </div>
        <div className="progress">
          <span className="pill">
            絵コンテ {data.board.scenes.length} シーン・{states} 状態
          </span>
          <span className={`pill ${implemented === data.board.scenes.length ? 'ok' : ''}`}>
            実装 {implemented} / {data.board.scenes.length}
          </span>
          <button className="pill" onClick={() => fetch('/api/check', { method: 'POST' })} disabled={check.running}>
            {check.running ? '検査中…' : issues === null ? '検査する' : `検査 ${issues === 0 ? '指摘なし' : `${issues} 件`}`}
          </button>
        </div>
        <div className="actions">
          <label>
            テーマ
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t || 'トークの設定'}
                </option>
              ))}
            </select>
          </label>
          <a href={data.stageUrl} target="_blank" rel="noreferrer">
            別窓で再生
          </a>
          <a href={`${data.stageUrl}?presenter`} target="_blank" rel="noreferrer">
            発表者ビュー
          </a>
        </div>
      </header>

      <main>
        <ChatPanel chat={chat} busy={busy} draft={draft} setDraft={setDraft} send={send} selected={selected ? `${selected.scene.id} / 状態 ${pick!.state + 1}` : null} clear={() => setPick(null)} />
        <BoardView data={data} thumbs={thumbs} pick={pick} setPick={setPick} />
        <Preview stageUrl={data.stageUrl} theme={theme} pick={pick} errors={[...(data.loadError ? [data.loadError] : []), ...thumbs.errors]} check={check} />
      </main>
    </div>
  )
}

function ChatPanel({ chat, busy, draft, setDraft, send, selected, clear }: { chat: Chat[]; busy: boolean; draft: string; setDraft: (s: string) => void; send: () => void; selected: string | null; clear: () => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [chat])
  return (
    <section className="chat">
      <div className="messages">
        {chat.length === 0 && <p className="hint">絵コンテのカードを選んでから話しかけると、その状態についての相談になります。</p>}
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
        {selected && (
          <div className="context">
            {selected}
            <button onClick={clear} aria-label="選択を外す">
              ×
            </button>
          </div>
        )}
        <textarea
          value={draft}
          placeholder="Enter で送信、Shift+Enter で改行"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
      </div>
    </section>
  )
}

// 選んだ状態の文脈 ([選択: …]) は、吹き出しの上に小さく出す
function UserMessage({ text }: { text: string }) {
  const m = text.match(/^\[選択: (\S+) の状態 (\d+)「[\s\S]*?」\] ([\s\S]*)$/)
  return (
    <div className="msg user">
      {m && (
        <div className="msg-context">
          {m[1]} / 状態 {m[2]}
        </div>
      )}
      {m ? m[3] : text}
    </div>
  )
}

function BoardView({ data, thumbs, pick, setPick }: { data: Studio; thumbs: { version: number }; pick: Pick; setPick: (p: Pick) => void }) {
  const chapters = [...new Set(data.board.scenes.map((s) => s.chapter ?? ''))]
  return (
    <section className="board">
      {chapters.map((ch) => (
        <div key={ch} className="chapter">
          <h2>{ch}</h2>
          <ChapterMeta board={data.board} name={ch} />
          {data.board.scenes
            .filter((s) => (s.chapter ?? '') === ch)
            .map((s) => {
              const impl = data.scenes.find((x) => x.id === s.id)
              const status = !impl ? '未実装' : impl.steps !== s.states.length ? `状態の数が違う (実装 ${impl.steps})` : null
              return (
                <div key={s.id} className="scene">
                  <div className="scene-head">
                    <strong>{s.title}</strong>
                    <code>{s.id}</code>
                    {s.meta['粗密'] && <span className="pill">{s.meta['粗密']}</span>}
                    {status && <span className="pill warn">{status}</span>}
                  </div>
                  {s.meta['伝えること'] && <p className="tell">{s.meta['伝えること']}</p>}
                  {s.states.map((st, i) => (
                    <StateRow key={i} scene={s} index={i} state={st} thumb={impl ? `/api/thumb/${s.id}-${i}?v=${thumbs.version}` : null} active={pick?.scene === s.id && pick.state === i} onPick={() => setPick({ scene: s.id, state: i })} />
                  ))}
                </div>
              )
            })}
        </div>
      ))}
    </section>
  )
}

function ChapterMeta({ board, name }: { board: Board; name: string }) {
  const meta = board.chapters.find((c) => c.name === name)?.meta ?? {}
  return meta['この章で理解すること'] ? <p className="chapter-goal">{meta['この章で理解すること']}</p> : null
}

function StateRow({ scene, index, state, thumb, active, onPick }: { scene: Scene; index: number; state: State; thumb: string | null; active: boolean; onPick: () => void }) {
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
    <div className={`state ${active ? 'active' : ''}`} onClick={onPick}>
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
        <textarea className="notes" value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} onBlur={save} onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  )
}

function Preview({ stageUrl, theme, pick, errors, check }: { stageUrl: string; theme: string; pick: Pick; errors: string[]; check: { running: boolean; report?: string } }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const src = `${stageUrl}${theme ? `?theme=${theme}` : ''}`
  const go = (play: boolean) => pick && frame.current?.contentWindow?.postMessage({ type: 'stage:goto', scene: pick.scene, step: pick.state, play }, '*')
  useEffect(() => {
    go(true)
  }, [pick?.scene, pick?.state])
  return (
    <section className="preview">
      <div className="frame">
        <iframe ref={frame} src={src} title="プレビュー" />
      </div>
      <div className="preview-actions">
        <button onClick={() => go(true)} disabled={!pick}>
          ▶ この状態への遷移を再生
        </button>
      </div>
      {errors.length > 0 && (
        <div className="errors">
          <strong>実行時のエラー</strong>
          {errors.map((e, i) => (
            <pre key={i}>{e}</pre>
          ))}
        </div>
      )}
      {check.report && <pre className="report">{check.report}</pre>}
    </section>
  )
}
