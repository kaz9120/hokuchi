// 他チームが追えずサイロ化が進む。Excellence がチームをつなぎ、1on1 で生の声を聞き、個人の大変さに寄り添う
// 動きの役割: オブジェクトの変化 (他チームが霞む) → 関係性の変化 (Excellence がつながる先が移る)
import { Connect, Headline, Morph, Reveal, defineScene } from '@hokuchi/stage'
import { Person } from './_common'

const TEAMS = ['自チーム', 'チーム B', 'チーム C', 'チーム D', 'チーム E']
const TEAM = { top: 220, width: 180, height: 90, gap: 22 }
const TEAM_LEFT = (1280 - TEAM.width * TEAMS.length - TEAM.gap * (TEAMS.length - 1)) / 2

// 上の段 (状態 3・4) の 2 枚
const UPPER = { top: 210, width: 470, height: 140 }
const UPPER_LEFT = [146, 664]

const upperCard = {
  position: 'absolute',
  top: UPPER.top,
  width: UPPER.width,
  height: UPPER.height,
  display: 'grid',
  placeContent: 'center',
  textAlign: 'center',
  padding: '0 28px',
} as const

function Next() {
  return (
    <>
      <Headline>
        {['他のチームで起きていることが追えなくなっている', 'Excellence がチームをつなぐ', '数字に出ない声を 1on1 で聞く', '個人の努力だけに任せず、Excellence が寄り添う']}
      </Headline>

      {/* 状態 1・2: チームの並び */}
      <Reveal at={0} until={2}>
        {TEAMS.map((name, i) => (
          <Morph
            key={name}
            node={`team-${i}`}
            box={[{ left: TEAM_LEFT + i * (TEAM.width + TEAM.gap), top: TEAM.top, width: TEAM.width, height: TEAM.height }]}
            tone={i === 0 ? ['accent'] : ['dim', '']}
            inner={{ textAlign: 'center' }}
            style={{ justifyContent: 'center', padding: 0, fontSize: 24, fontWeight: 700 }}
          >
            {name}
          </Morph>
        ))}
      </Reveal>
      <Reveal at={0} until={1} delay={0.3} style={{ position: 'absolute', left: 0, right: 0, top: 360, textAlign: 'center', fontSize: 28, fontWeight: 700, color: 'var(--accent-strong)' }}>
        サイロ化が進んでいる
      </Reveal>
      {TEAMS.map((_, i) => (
        <Connect key={i} from="exc" to={`team-${i}`} at={1} until={2} fromSide="top" toSide="bottom" fromShift={(i - 2) * 60} curve={0.4} arrow={false} delay={0.3 + i * 0.05} />
      ))}

      {/* 状態 3: データと生の声 */}
      <Reveal
        at={2}
        until={3}
        delay={0.2}
        className="card"
        style={{ ...upperCard, left: UPPER_LEFT[0], boxSizing: 'border-box' }}
      >
        {/* 脇役なので控えめにする (Reveal が不透明度を上書きするので、中身で下げる) */}
        <div style={{ opacity: 0.55 }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>サーベイと開発のデータ</div>
          <div style={{ fontSize: 20, color: 'var(--fg-sub)', marginTop: 6 }}>定量・定性</div>
        </div>
      </Reveal>
      <Reveal at={2} until={3} delay={0.2} style={{ position: 'absolute', left: UPPER_LEFT[0], width: UPPER.width, top: UPPER.top + UPPER.height + 14, textAlign: 'center', fontSize: 20, fontWeight: 600, color: 'var(--fg-sub)' }}>
        これだけでは分からないこともある
      </Reveal>
      <Reveal
        at={2}
        until={3}
        delay={0.3}
        node="voices"
        style={{ position: 'absolute', left: UPPER_LEFT[1], top: UPPER.top, width: UPPER.width, height: UPPER.height, borderRadius: 16, border: '2px dashed var(--line)', boxSizing: 'border-box' }}
      >
        {[115, 235, 355].map((x) => (
          <Person key={x} x={x} y={UPPER.height / 2} size={84} tone="accent" />
        ))}
      </Reveal>
      <Connect from="exc" to="voices" at={2} until={3} fromSide="top" toSide="bottom" curve={0.4} delay={0.4} label="1on1" />

      {/* 状態 4: 個人の努力だけでは大変な 2 つ */}
      {['あふれる情報のキャッチアップ', '変化の速さの中での\n不安や悩みの整理'].map((text, i) => (
        <Reveal
          key={text}
          at={3}
          delay={0.2 + i * 0.15}
          node={`burden-${i}`}
          className="card"
          style={{ ...upperCard, left: UPPER_LEFT[i], boxSizing: 'border-box', fontSize: 28, fontWeight: 800, lineHeight: 1.4, whiteSpace: 'pre-line' }}
        >
          {text}
        </Reveal>
      ))}
      {[0, 1].map((i) => (
        <Connect key={i} from="exc" to={`burden-${i}`} at={3} fromSide="top" toSide="bottom" fromShift={(i - 0.5) * 120} curve={0.4} delay={0.5 + i * 0.1} />
      ))}

      {/* 状態 2〜4: Excellence */}
      <Reveal
        at={1}
        delay={0.1}
        node="exc"
        className="card tone-hot"
        style={{ position: 'absolute', left: 450, top: 500, width: 380, height: 96, justifyContent: 'center', fontSize: 26, fontWeight: 800 }}
      >
        Engineer Excellence 会議
      </Reveal>
    </>
  )
}

export default defineScene({ id: 'next', steps: 4, Component: Next })
