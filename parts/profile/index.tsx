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
  affiliation: string
  x: string
  career: string
  achievements: string[]
}

const HISTORY: Profile[] = [
  {
    // MOSH への参画は 2025 年。正確な日付は未確認のため、年の初めにしている
    since: '2025-01-01',
    name: '山本 一将',
    catchcopy: '焚き火を愛するエンジニア',
    affiliation: 'MOSH株式会社 Engineering Manager',
    x: '@kyamamoto9120',
    career: '鉄道システム開発、SNS マーケティングツール開発を経て、2025 年より MOSH に参画',
    achievements: ['2015 年 世界コンピュータ将棋選手権 9 位', '2024 年 LINE API Expert 認定'],
  },
]

/** 発表日の時点で有効な版 */
export function profileAt(date: string | undefined): Profile {
  const sorted = [...HISTORY].sort((a, b) => (a.since < b.since ? -1 : 1))
  const valid = sorted.filter((p) => !date || p.since <= date)
  return valid.at(-1) ?? sorted[0]
}

const row = { display: 'grid', gridTemplateColumns: '88px 1fr', gap: 16, fontSize: 22, lineHeight: 1.6 } as const
const label = { color: 'var(--accent-strong)', fontWeight: 700 }

/**
 * 自己紹介のシーンを作る。趣味の欄は登壇ごとに入れ替える (本編への伏線を置く場所。style-defaults.md)
 */
export function profileScene({ id = 'profile', hobbies }: { id?: string; hobbies: string }) {
  function Profile() {
    const p = profileAt(useTalk().date)
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <img
          src={photo}
          alt=""
          style={{ position: 'absolute', left: 120, top: 150, width: 300, height: 300, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 12px 40px rgb(0 0 0 / 0.12)' }}
        />
        <div style={{ position: 'absolute', left: 500, top: 150, right: 96 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-strong)', letterSpacing: '0.06em' }}>{p.catchcopy}</div>
          <div style={{ fontSize: 52, fontWeight: 800, marginTop: 6 }}>{p.name}</div>
          <div style={{ fontSize: 24, color: 'var(--fg-sub)', marginTop: 8, fontWeight: 600 }}>
            {p.affiliation} ・ X: {p.x}
          </div>
          <div style={{ display: 'grid', gap: 14, marginTop: 40 }}>
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
