// studio のホーム。発信の準備をしているものを並べ、選ぶと編集画面に移る (ADR-0035)
import { useEffect, useState } from 'react'

type TalkItem = {
  slug: string
  name: string
  title: string
  date: string | null
  tag: string | null
  event: string | null
  public: boolean
  scenes: number
  states: number
  open: boolean
  siteUrl: string
}
type DraftItem = { slug: string; title: string; chars: number }
type HomeData = { talks: TalkItem[]; drafts: DraftItem[]; siteUrl: string }

export function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  useEffect(() => {
    fetch('/api/home')
      .then((r) => r.json())
      .then(setData)
  }, [])
  if (!data) return <div className="loading">読み込み中…</div>
  return (
    <div className="home">
      <header>
        <div className="title">
          <strong>hokuchi studio</strong>
          <span>発信の準備</span>
        </div>
        <div className="actions">
          <a href={data.siteUrl} target="_blank" rel="noreferrer">
            サイトを見る
          </a>
        </div>
      </header>

      <main className="home-main">
        <section>
          <h2>発表資料</h2>
          <div className="items">
            {data.talks.map((t) => (
              <a key={t.slug} className="item" href={`/talks/${encodeURIComponent(t.slug)}`}>
                <img src={`${t.siteUrl}og.png`} alt="" loading="lazy" />
                <div className="item-meta">
                  <span>{t.date}</span>
                  {t.tag && <span className="pill">#{t.tag}</span>}
                  {!t.public && <span className="pill warn">非公開</span>}
                  {t.open && <span className="pill ok">開いている</span>}
                </div>
                <strong>{t.title}</strong>
                <span className="item-sub">
                  {t.event ? `${t.event} ・ ` : ''}
                  {t.scenes} シーン・{t.states} 状態
                </span>
              </a>
            ))}
          </div>
          <p className="hint">新しいトークは talks/ にディレクトリを作ってから、studio を立て直すと並びます。</p>
        </section>

        <section>
          <h2>note の原稿</h2>
          {data.drafts.length === 0 ? (
            <p className="hint">執筆中の原稿 (articles/note/drafts/) はありません。</p>
          ) : (
            <ul className="drafts">
              {data.drafts.map((d) => (
                <li key={d.slug}>
                  <strong>{d.title}</strong>
                  <span className="item-sub">
                    {d.slug} ・ {d.chars} 字
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">原稿の編集画面は、次の段で作ります。いまは hokuchi-note serve で開いてください。</p>
        </section>
      </main>
    </div>
  )
}
