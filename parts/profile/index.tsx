// 自己紹介のシーン。トークをまたいで使い回す (ADR-0029)。
// 凍結しないので、肩書きや実績が変わったら HISTORY に新しい版を足す。古い版は消さない。
// シーンはトークの発表日の時点で有効な版を出すので、過去のトークの自己紹介は当時のまま残る。
import { defineScene, useTalk } from '@hokuchi/stage'
import photo from './photo.jpg'

type Profile = {
  /** この版が有効になった日 (YYYY-MM-DD) */
  since: string
  name: string
  catchcopy: string
  company: string
  /** 対外的な肩書き。チーム内のロール (ユニットリードなど) は登壇ごとに roles で出す */
  title: string
  x: string
  career: string
  achievements: string[]
}

const HISTORY: Profile[] = [
  {
    // MOSH への参画は 2025 年 6 月 (note の自己紹介記事 2025-11-30 より)。日は未確認のため 1 日にしている
    since: '2025-06-01',
    name: '山本 一将',
    catchcopy: '焚き火を愛するエンジニア',
    company: 'MOSH株式会社',
    title: 'Engineering Manager',
    x: '@kyamamoto9120',
    career: '鉄道システム開発、SNS マーケティングツール開発を経て、2025 年より MOSH に参画',
    achievements: ['2015 年 世界コンピュータ将棋選手権 9 位', '2024 年 LINE API Expert 認定'],
  },
]

/** 発表日の時点で有効な版 */
export function profileAt(date: string | undefined): Profile {
  const sorted = [...HISTORY].sort((a, b) => (a.since < b.since ? -1 : 1))
  const valid = sorted.filter((p) => !date || p.since <= date)
  return valid.at(-1) ?? sorted[0]
}

const row = { display: 'grid', gridTemplateColumns: '72px 1fr', gap: 12, fontSize: 20, lineHeight: 1.6 } as const
const label = { color: 'var(--accent-strong)', fontWeight: 700 }

/** X のロゴ (Simple Icons, CC0) */
function XLogo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  )
}

/**
 * 自己紹介のシーンを作る。左が名刺、右が今日の立場と bio。
 * roles (今日の立場) と趣味の欄は登壇ごとに入れ替える。趣味は本編への伏線を置く場所 (style-defaults.md)
 */
export function profileScene({ id = 'profile', roles = [], hobbies }: { id?: string; roles?: string[]; hobbies: string }) {
  function Profile() {
    const p = profileAt(useTalk().date)
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', left: 96, top: 120, width: 320, textAlign: 'center' }}>
          <img
            src={photo}
            alt=""
            style={{ width: 240, height: 240, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 12px 40px rgb(0 0 0 / 0.12)' }}
          />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-strong)', letterSpacing: '0.06em', marginTop: 24 }}>{p.catchcopy}</div>
          <div style={{ fontSize: 44, fontWeight: 800, marginTop: 4 }}>{p.name}</div>
          <div style={{ fontSize: 20, color: 'var(--fg-sub)', fontWeight: 600, marginTop: 8, lineHeight: 1.5 }}>
            <div>{p.company}</div>
            <div>{p.title}</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 600, marginTop: 16 }}>
            <XLogo size={18} />
            {p.x}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 500, top: 150, right: 96 }}>
          {roles.length > 0 && (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)', letterSpacing: '0.06em' }}>今日の立場</div>
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {roles.map((r) => (
                  <div key={r} style={{ fontSize: 34, fontWeight: 800 }}>
                    {r}
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: 'var(--fg-sub)', opacity: 0.25, margin: '36px 0' }} />
            </>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={row}>
              <span style={label}>略歴</span>
              <span>{p.career}</span>
            </div>
            <div style={row}>
              <span style={label}>実績</span>
              <span>
                {p.achievements.map((a) => (
                  <div key={a}>{a}</div>
                ))}
              </span>
            </div>
            <div style={row}>
              <span style={label}>趣味</span>
              <span style={{ whiteSpace: 'pre-line' }}>{hobbies}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }
  return defineScene({ id, steps: 1, Component: Profile })
}
