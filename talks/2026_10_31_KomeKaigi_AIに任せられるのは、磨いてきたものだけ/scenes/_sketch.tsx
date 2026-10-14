// スケッチの絵。構成を固めている段階で、絵コンテの各シーンに「何が見えるか」のラフを付ける。
// 見出しは絵コンテから読むので、ここには絵だけを書く。仕上げるときに、1 シーン 1 ファイルへ分けて作り込む
import { Reveal, useStep } from '@hokuchi/stage'
import type { CSSProperties, ReactNode } from 'react'
import adrExample from '../assets/adr-example.png'
import firstGame from '../assets/first-game.png'

const box: CSSProperties = {
  background: 'var(--surface)',
  border: '2px solid var(--line)',
  borderRadius: 14,
  boxSizing: 'border-box',
  display: 'grid',
  placeContent: 'center',
  textAlign: 'center',
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.45,
  padding: '0 16px',
  transition: 'background 0.4s, border-color 0.4s, opacity 0.4s, color 0.4s',
}
const accent: CSSProperties = { background: 'var(--accent-bg)', borderColor: 'var(--accent)', color: 'var(--accent-strong)' }
const dim: CSSProperties = { opacity: 0.35 }
const abs = (left: number, top: number, width: number, height: number): CSSProperties => ({ position: 'absolute', left, top, width, height })

// ---------------------------------------------------------------- 目盛り (レーティングのものさし)
const SCALE = { min: 3000, max: 4450, top: 200, bottom: 640, x: 300 }
const yOf = (v: number) => SCALE.bottom - ((v - SCALE.min) / (SCALE.max - SCALE.min)) * (SCALE.bottom - SCALE.top)

type Mark = { v: number; label: string; at: number; until?: number; tone?: 'accent' | 'dim' }

function Scale({ marks = [], line, top, fill, children }: { marks?: Mark[]; line?: { at: number; label: string }; top?: { at: number; label?: string }; fill?: { to: number; at: number; label?: string }; children?: ReactNode }) {
  return (
    <>
      <div style={{ position: 'absolute', left: SCALE.x, top: SCALE.top, width: 4, height: SCALE.bottom - SCALE.top, background: 'var(--fg-sub)', borderRadius: 2 }} />
      {[3000, 3200, 3400, 3600, 3800, 4000, 4200, 4400].map((v) => (
        <div key={v} style={{ position: 'absolute', left: SCALE.x - 110, top: yOf(v) - 14, width: 96, textAlign: 'right', fontSize: 20, color: 'var(--fg-sub)', fontWeight: 600 }}>
          {v}
        </div>
      ))}
      {[3000, 3200, 3400, 3600, 3800, 4000, 4200, 4400].map((v) => (
        <div key={v} style={{ position: 'absolute', left: SCALE.x - 8, top: yOf(v) - 1, width: 20, height: 2, background: 'var(--fg-sub)' }} />
      ))}
      {fill && (
        <Reveal at={fill.at} y={0} style={{ position: 'absolute', left: SCALE.x + 4, top: yOf(fill.to), width: 56, height: SCALE.bottom - yOf(fill.to), background: 'var(--accent-bg)', borderTop: '3px solid var(--accent)' }}>
          {''}
        </Reveal>
      )}
      {top && (
        <Reveal at={top.at} y={0} style={{ position: 'absolute', left: SCALE.x + 4, top: yOf(4400), width: 700, height: yOf(4300) - yOf(4400), background: 'var(--line)', borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 90, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>
          {top.label ?? 'いまのトップ 4300〜4400'}
        </Reveal>
      )}
      {line && (
        <Reveal at={line.at} y={0} style={{ position: 'absolute', left: SCALE.x - 20, top: yOf(4000) - 2, width: 860 }}>
          <div style={{ borderTop: '4px dashed var(--accent)' }} />
          <div style={{ position: 'absolute', right: 0, top: -40, fontSize: 24, fontWeight: 800, color: 'var(--accent-strong)' }}>{line.label}</div>
        </Reveal>
      )}
      {marks.map((m) => (
        <Reveal key={m.v + m.label} at={m.at} until={m.until} y={8} style={{ position: 'absolute', left: SCALE.x - 9, top: yOf(m.v) - 22, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: m.tone === 'accent' ? 'var(--accent)' : m.tone === 'dim' ? 'var(--muted)' : 'var(--fg-sub)', flex: 'none' }} />
          <div style={{ ...box, ...(m.tone === 'accent' ? accent : {}), ...(m.tone === 'dim' ? { color: 'var(--fg-sub)' } : {}), display: 'block', padding: '6px 18px', fontSize: 22, whiteSpace: 'nowrap', marginLeft: 60 }}>
            <span style={{ fontWeight: 800, marginRight: 12 }}>{m.v}</span>
            {m.label}
          </div>
        </Reveal>
      ))}
      {children}
    </>
  )
}

// ---------------------------------------------------------------- 流れの図 (任せ方)
const FLOW = [
  { label: '方針を決める', who: '私と AI', human: true },
  { label: '設計の記録を書く', who: 'AI' },
  { label: '実装する', who: 'AI' },
  { label: '対局させて判定する', who: '自動' },
  { label: 'マージする', who: 'AI' },
]

/** shown: いくつ目まで見せるか。hot: 強調する箱。judge: 判定の箱を「人が判定する」に替える。loop: 戻りの線 */
function Flow({ shown = 5, hot, judge = false, loop = false }: { shown?: number; hot?: number; judge?: boolean; loop?: boolean }) {
  const W = 196
  const GAP = 27
  return (
    <>
      {FLOW.map((f, i) => {
        const isJudge = judge && i === 3
        return (
          <Reveal key={i} at={0} y={0} style={{ ...abs(96 + i * (W + GAP), 300, W, 130), opacity: i < shown ? 1 : 0, transition: 'opacity 0.5s' }}>
            <div style={{ ...box, width: '100%', height: '100%', ...(hot === i || isJudge ? accent : {}), ...(hot !== undefined && hot !== i && !isJudge ? dim : {}), ...(judge && i !== 3 ? dim : {}) }}>
              <div>{isJudge ? '人が判定する' : f.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-sub)', marginTop: 6 }}>{isJudge ? '私' : f.who}</div>
            </div>
            {i < 4 && <div style={{ position: 'absolute', left: W + 3, top: 50, fontSize: 24, color: 'var(--fg-sub)', opacity: i + 1 < shown ? 1 : 0 }}>→</div>}
          </Reveal>
        )
      })}
      {loop && (
        <div style={{ position: 'absolute', left: 194, top: 446, width: 892, height: 60, border: '3px solid var(--accent)', borderTop: 'none', borderRadius: '0 0 30px 30px', boxSizing: 'border-box' }}>
          <div style={{ position: 'absolute', left: '50%', bottom: -20, transform: 'translateX(-50%)', background: 'var(--accent)', color: '#fff', fontSize: 22, fontWeight: 800, padding: '4px 20px', borderRadius: 999 }}>24 時間</div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- 棒グラフ (採用された割合)
const BARS = [
  { label: '1 週目', v: 67 },
  { label: '2 週目', v: 43 },
  { label: 'まとめて移した 3 日間', v: 91 },
  { label: '次の週', v: 27 },
]

/** shown: 何本目まで見せるか。hot: 強調する棒 */
function Bars({ shown, hot, reason = false }: { shown: number; hot?: number; reason?: boolean }) {
  const BASE = 560
  const H = 3.4
  return (
    <>
      <div style={{ position: 'absolute', left: 150, top: BASE, width: 980, height: 3, background: 'var(--fg-sub)' }} />
      {BARS.map((b, i) => (
        <div key={i} style={{ position: 'absolute', left: 190 + i * 200, top: BASE - b.v * H, width: 120, opacity: i < shown ? 1 : 0, transition: 'opacity 0.5s' }}>
          <div style={{ position: 'absolute', top: -44, width: '100%', textAlign: 'center', fontSize: 30, fontWeight: 800, color: hot === i ? 'var(--accent-strong)' : 'var(--fg)' }}>{b.v}%</div>
          <div style={{ height: b.v * H, background: hot === i ? 'var(--accent)' : 'var(--muted)', borderRadius: '8px 8px 0 0' }} />
          <div style={{ position: 'absolute', left: -40, right: -40, textAlign: 'center', fontSize: 20, fontWeight: 600, color: 'var(--fg-sub)', marginTop: 10, whiteSpace: 'nowrap' }}>{b.label}</div>
        </div>
      ))}
      {reason && <div style={{ ...box, ...accent, ...abs(900, 200, 300, 110) }}>よく知られた改善を<br />入れ終えた</div>}
    </>
  )
}

// ---------------------------------------------------------------- 入れ子の問い
function Nested({ inner = true, labels = false, answered = false }: { inner?: boolean; labels?: boolean; answered?: boolean }) {
  return (
    <>
      <div style={{ ...abs(96, 190, 1088, 440), border: `3px solid ${answered ? 'var(--accent)' : 'var(--fg-sub)'}`, borderRadius: 20, background: answered ? 'var(--accent-faint)' : 'var(--surface)', boxSizing: 'border-box', transition: 'all 0.5s' }}>
        <div style={{ position: 'absolute', left: 32, top: 22, fontSize: 20, fontWeight: 700, color: 'var(--fg-sub)' }}>今日の問い</div>
        <div style={{ position: 'absolute', left: 32, top: 52, fontSize: 32, fontWeight: 800, color: answered ? 'var(--accent-strong)' : 'var(--fg)' }}>経験の価値は下がったのか</div>
        {labels && <div style={{ position: 'absolute', right: 32, bottom: 26, fontSize: 22, fontWeight: 700, color: 'var(--fg-sub)' }}>後半　仕事で経験はどう効くのか</div>}
      </div>
      <div style={{ ...abs(150, 330, 640, 230), border: '3px solid var(--accent)', borderRadius: 16, background: 'var(--accent-bg)', boxSizing: 'border-box', opacity: inner ? (answered ? 0.5 : 1) : 0, transition: 'opacity 0.5s' }}>
        <div style={{ position: 'absolute', left: 28, top: 20, fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)' }}>実験の問い</div>
        <div style={{ position: 'absolute', left: 28, top: 50, right: 20, fontSize: 28, fontWeight: 800, lineHeight: 1.4 }}>AI は自分で将棋 AI を<br />強くし続けられるか</div>
        {labels && !answered && <div style={{ position: 'absolute', left: 28, bottom: 20, fontSize: 22, fontWeight: 700, color: 'var(--accent-strong)' }}>前半　実験の記録</div>}
        {answered && <div style={{ position: 'absolute', left: 28, bottom: 20, fontSize: 24, fontWeight: 800 }}>→ 人が入って 3800 点。4000 点はまだ</div>}
      </div>
      {labels && <div style={{ position: 'absolute', left: 810, top: 420, fontSize: 44, color: 'var(--accent)', fontWeight: 800 }}>→</div>}
    </>
  )
}

// ---------------------------------------------------------------- 個別の絵
function Chain({ items, hot }: { items: string[]; hot?: number }) {
  const step = useStep()
  return (
    <>
      {items.map((t, i) => (
        <div key={i} style={{ position: 'absolute', left: 240, top: 185 + i * 116, width: 800, opacity: i <= step ? 1 : 0, transition: 'opacity 0.5s' }}>
          <div style={{ ...box, height: 80, ...(hot === i && step >= i ? accent : {}), fontSize: 26 }}>{t}</div>
          {i < items.length - 1 && <div style={{ textAlign: 'center', fontSize: 24, color: 'var(--fg-sub)', lineHeight: '36px', opacity: i < step ? 1 : 0 }}>↓</div>}
        </div>
      ))}
    </>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  const step = useStep()
  return (
    <>
      {rows.map(([a, b], i) => (
        <div key={i} style={{ position: 'absolute', left: 96, right: 96, top: 230 + i * 170, height: 130, display: 'grid', gridTemplateColumns: '460px 60px 1fr', alignItems: 'center', opacity: i <= step ? 1 : 0, transition: 'opacity 0.5s' }}>
          <div style={{ ...box, ...accent, height: '100%', fontSize: 28 }}>{a}</div>
          <div style={{ textAlign: 'center', fontSize: 28, color: 'var(--fg-sub)' }}>→</div>
          <div style={{ ...box, height: '100%', fontSize: 26 }}>{b}</div>
        </div>
      ))}
    </>
  )
}

function LineChart() {
  const step = useStep()
  // 形だけのラフ。実データ (2 週間レーティングの推移) に差し替える
  const pts: [number, number][] = [[0, 3180], [6, 3380], [12, 3450], [22, 3520], [34, 3600], [48, 3680], [62, 3740], [76, 3800]]
  const X = (d: number) => 220 + d * 11.5
  const Y = (v: number) => 610 - ((v - 3100) / 1000) * 400
  const path = pts.map(([d, v], i) => `${i ? 'L' : 'M'}${X(d)},${Y(v)}`).join(' ')
  if (step === 0) return <img src={firstGame} alt="" style={{ position: 'absolute', left: 340, top: 180, height: 450, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} />
  return (
    <>
      <svg width={1280} height={720} style={{ position: 'absolute', inset: 0 }}>
        <line x1={200} y1={610} x2={1140} y2={610} stroke="var(--fg-sub)" strokeWidth={3} />
        <line x1={200} y1={190} x2={200} y2={610} stroke="var(--fg-sub)" strokeWidth={3} />
        <line x1={200} y1={Y(4000)} x2={1140} y2={Y(4000)} stroke="var(--accent)" strokeWidth={4} strokeDasharray="12 8" />
        {step >= 2 && <path d={path} fill="none" stroke="var(--fg)" strokeWidth={5} strokeLinejoin="round" />}
        <circle cx={X(0)} cy={Y(3180)} r={9} fill="var(--fg)" />
        {step >= 2 && <circle cx={X(76)} cy={Y(3800)} r={11} fill="var(--accent)" />}
        {step >= 3 && <line x1={X(76)} y1={Y(3800) - 14} x2={X(76)} y2={Y(4000) + 4} stroke="var(--accent)" strokeWidth={4} />}
      </svg>
      <div style={{ position: 'absolute', left: 900, top: Y(4000) - 44, fontSize: 24, fontWeight: 800, color: 'var(--accent-strong)' }}>成功の線 4000</div>
      <div style={{ position: 'absolute', left: X(0) + 18, top: Y(3180) - 8, fontSize: 22, fontWeight: 700 }}>7/24　3186</div>
      {step >= 2 && <div style={{ position: 'absolute', left: X(76) + 20, top: Y(3800) - 16, fontSize: 28, fontWeight: 800 }}>約 3800</div>}
      <div style={{ position: 'absolute', left: 205, top: 618, fontSize: 20, color: 'var(--fg-sub)' }}>7 月</div>
      <div style={{ position: 'absolute', left: 1080, top: 618, fontSize: 20, color: 'var(--fg-sub)' }}>10 月</div>
    </>
  )
}

function Cards({ items, dimFrom }: { items: string[]; dimFrom: number }) {
  const step = useStep()
  return (
    <>
      {items.map((t, i) => (
        <div key={i} style={{ ...box, ...abs(200 + i * 460, 300, 420, 150), fontSize: 28, ...(step >= dimFrom ? dim : {}) }}>{t}</div>
      ))}
    </>
  )
}

function Calls() {
  const step = useStep()
  const items: [string, string, boolean][] = [
    ['桂馬が絡む詰みを\n見落としていないか', '+11 点', true],
    ['学習データの採点を\nもっと強い将棋ソフトにやり直してもらう', '+75 点', true],
    ['どの盤面を多く学ばせるかの\n割合を変える', '−58 点', false],
  ]
  return (
    <>
      {items.map(([t, r, ok], i) => (
        <div key={i} style={{ position: 'absolute', left: 96, right: 96, top: 200 + i * 148, height: 124, display: 'grid', gridTemplateColumns: '1fr 60px 260px', alignItems: 'center', opacity: i <= step ? (i === step ? 1 : 0.5) : 0, transition: 'opacity 0.5s' }}>
          <div style={{ ...box, height: '100%', fontSize: 26, whiteSpace: 'pre-line' }}>{t}</div>
          <div style={{ textAlign: 'center', fontSize: 28, color: 'var(--fg-sub)' }}>→</div>
          <div style={{ ...box, ...(ok ? accent : { color: 'var(--fg-sub)' }), height: '100%', fontSize: 34, fontWeight: 800 }}>{r}</div>
        </div>
      ))}
    </>
  )
}

function Rejected() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ ...box, ...abs(150 + (i % 3) * 340, 220 + Math.floor(i / 3) * 190, 300, 150), fontSize: 22, color: 'var(--fg-sub)' }}>
          <div>時間の使い方の改善案 {i + 1}</div>
          <div style={{ color: 'var(--accent-strong)', fontSize: 26, fontWeight: 800, marginTop: 8 }}>不採用</div>
        </div>
      ))}
    </>
  )
}

function Photo({ src, zoom = false }: { src: string; zoom?: boolean }) {
  return <img src={src} alt="" style={{ position: 'absolute', left: 250, top: 180, width: 780, height: 450, objectFit: 'cover', objectPosition: 'top', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', transform: zoom ? 'scale(1.25)' : 'none', transformOrigin: 'top center', transition: 'transform 0.8s' }} />
}

function TwoSides({ left, right, bottom }: { left: [string, string]; right: [string, string]; bottom?: string }) {
  const step = useStep()
  return (
    <>
      <div style={{ ...box, ...abs(96, 210, 520, 250), fontSize: 30 }}>
        <div style={{ fontSize: 20, color: 'var(--fg-sub)', marginBottom: 10 }}>{left[0]}</div>
        {left[1]}
      </div>
      <div style={{ ...box, ...abs(664, 210, 520, 250), fontSize: 30, opacity: step >= 1 ? 1 : 0 }}>
        <div style={{ fontSize: 20, color: 'var(--fg-sub)', marginBottom: 10 }}>{right[0]}</div>
        {right[1]}
      </div>
      {bottom && <div style={{ ...box, ...accent, ...abs(290, 510, 700, 90), fontSize: 28, opacity: step >= 2 ? 1 : 0 }}>{bottom}</div>}
    </>
  )
}

function Circles() {
  const step = useStep()
  return (
    <>
      <div style={{ ...abs(330, 175, 620, 470), borderRadius: '50%', border: '3px solid var(--fg-sub)', background: 'var(--surface)', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', top: 44, width: '100%', textAlign: 'center', fontSize: 26, fontWeight: 700, color: 'var(--fg-sub)' }}>AI が作れる範囲</div>
      </div>
      <div style={{ ...abs(500, 350, 280, 240), transform: step >= 3 ? 'scale(1.25)' : 'none', borderRadius: '50%', border: '4px solid var(--accent)', background: 'var(--accent-bg)', boxSizing: 'border-box', display: 'grid', placeContent: 'center', textAlign: 'center', fontSize: 24, fontWeight: 800, color: 'var(--accent-strong)', lineHeight: 1.4, opacity: step >= 1 ? 1 : 0, transition: 'opacity 0.5s' }}>
        自分が良し悪しを<br />見分けられる範囲
      </div>
    </>
  )
}

function Loops({ many }: { many: boolean }) {
  const step = useStep()
  const items = ['市場を調べる', '競合を調べる', '1 つ作る', '使ってもらう', '反応を見る']
  if (many && step >= 1)
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...abs(150 + i * 340, 200, 300, 400), border: '3px dashed var(--muted)', borderRadius: 14, display: 'grid', placeContent: 'center', textAlign: 'center', fontSize: 22, color: 'var(--fg-sub)', background: 'var(--surface)', boxSizing: 'border-box', ...(step >= 2 && i === 1 ? { borderColor: 'var(--accent)', transform: 'scale(1.08)' } : {}), transition: 'all 0.6s' }}>
            試作の画面 {i + 1}
            <br />
            （写真待ち）
          </div>
        ))}
      </>
    )
  const rows = many ? 5 : 1
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ position: 'absolute', left: many ? 300 : 96, top: many ? 200 + r * 84 : 300, display: 'flex', gap: many ? 10 : 22, alignItems: 'center' }}>
          {items.map((t, i) => (
            <div key={i} style={{ ...box, width: many ? 124 : 200, height: many ? 60 : 120, fontSize: many ? 18 : 24, opacity: many || i <= 4 ? 1 : 0 }}>{many ? ['調べる', '作る', '使う', '直す', '比べる'][i] : t}</div>
          ))}
        </div>
      ))}
      {!many && step >= 1 && (
        <div style={{ position: 'absolute', left: 96, top: 470, width: 1088 }}>
          <div style={{ borderTop: '4px solid var(--accent)' }} />
          <div style={{ textAlign: 'center', fontSize: 30, fontWeight: 800, color: 'var(--accent-strong)', marginTop: 14 }}>1 周に数か月</div>
        </div>
      )}
    </>
  )
}

function Improvements() {
  const rows = ['8/16 +13', '8/17 +65', '8/26 +29', '8/29 +14', '9/2 +43', '9/10 +20', '10/4 +75', '10/5 +26', '10/7 +23']
  return (
    <div style={{ position: 'absolute', left: 190, top: 200, width: 900, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
      {rows.map((r) => (
        <div key={r} style={{ ...box, height: 110, fontSize: 28 }}>
          <span style={{ fontSize: 20, color: 'var(--fg-sub)', fontWeight: 600 }}>{r.split(' ')[0]}</span>
          <span style={{ color: 'var(--accent-strong)' }}>{r.split(' ')[1]} 点</span>
        </div>
      ))}
    </div>
  )
}

function Bullets({ items, all = false }: { items: string[]; all?: boolean }) {
  const step = all ? items.length - 1 : useStep()
  return (
    <div style={{ position: 'absolute', left: 96, right: 96, top: 200, display: 'grid', gap: 26 }}>
      {items.map((t, i) => (
        <div key={i} style={{ fontSize: 32, fontWeight: 700, opacity: all ? 1 : i <= step ? (i === step ? 1 : 0.45) : 0, transition: 'opacity 0.5s', display: 'flex', gap: 18 }}>
          <span style={{ color: 'var(--accent)' }}>●</span>
          {t}
        </div>
      ))}
    </div>
  )
}

/** シーンの id → その状態で見せる絵。無い id は、大きな文 (見出しだけ) で見せる */
export const PICTURES: Record<string, (step: number) => ReactNode> = {
  agenda: (s) => <Nested inner={s >= 1} labels={s >= 2} />,
  'ch-work': () => <Nested labels answered />,
  'method-names': () => <Cards items={['ハーネスエンジニアリング', 'ループエンジニアリング']} dimFrom={1} />,
  'cant-verify': () => <Chain hot={2} items={['製品の価値は 数字で測りにくい', '手法を入れても 価値が上がったかを確かめられない', '価値を数字で測れる分野で 先に確かめる', '将棋 AI']} />,
  'why-shogi': () => <Rows rows={[['価値を数字で測れる', '対局させれば 数時間で強くなったかが分かる'], ['良し悪しを自分で判断できる', '10 年作ってきた']]} />,
  setup: (s) => <Flow shown={s === 0 ? 2 : 5} loop={s >= 2} />,
  goal: () => <Scale marks={[{ v: 3300, label: '基準のソフト（人間はもう勝てない）', at: 1, tone: 'dim' }]} top={{ at: 2 }} line={{ at: 3, label: 'この実験の成功の線 4000' }} />,
  result: () => <LineChart />,
  'six-losses': (s) => (s < 2 ? <Scale line={{ at: 0, label: '成功の線 4000' }} marks={[{ v: 3200, label: 'AI が改善を 1 つずつ積んで届いた所', at: 0, tone: 'accent' }]} /> : <Rejected />),
  'reading-adr': (s) => (s < 3 ? <Photo src={adrExample} zoom={s >= 1} /> : s === 3 ? <Bars shown={3} hot={2} /> : <Scale line={{ at: 0, label: '成功の線 4000' }} marks={[{ v: 3200, label: 'AI が改善を 1 つずつ積んで届いた所', at: 0, tone: 'dim' }, { v: 3400, label: '強いソフトの考え方を まとめて移して届いた所', at: 0, tone: 'accent' }]} />),
  batting: (s) => <Bars shown={s === 0 ? 3 : 4} hot={s >= 1 ? 3 : undefined} reason={s >= 2} />,
  'ai-profile': () => <TwoSides left={['得意', '実装する力は高い']} right={['不得意', '何を調べ 何をするかを\n決める力は弱い']} bottom="人が支えれば もっと強くできる" />,
  'my-calls': () => <Calls />,
  ladder: () => (
    <Scale
      line={{ at: 0, label: '成功の線 4000' }}
      marks={[
        { v: 3200, label: 'AI が 1 つずつ積んだ', at: 0 },
        { v: 3400, label: '強いソフトの考え方を まとめて移した', at: 0 },
        { v: 3600, label: 'AI の案に 私が口を出すことが増えた', at: 1 },
        { v: 3800, label: '何に力を入れるかを 私が決めている（いま）', at: 2, tone: 'accent' },
      ]}
    />
  ),
  'still-deciding': () => <Flow hot={0} />,
  enough: (s) => <Scale fill={{ to: 3400, at: 0 }} line={{ at: 0, label: '成功の線 4000' }} marks={[{ v: 3400, label: '公開されている知識で届く所', at: 0 }, { v: 3800, label: '何をするかを決める人の勝負', at: 2, tone: 'accent' }]} />,
  'release-judge': (s) => <Flow hot={s === 0 ? 3 : s === 1 ? 0 : undefined} judge={s >= 2} />,
  delegable: () => <Circles />,
  'new-method': (s) => (s === 3 ? <Improvements /> : null),
  'old-way': () => <Loops many={false} />,
  'build-many': () => <Loops many />,
  'hands-on': (s) => (s === 2 ? <Bullets all items={['AI に 2 案作らせて どちらが良いかを自分で決める', '決めた理由を 1 行で残す', 'あとで結果と見比べる']} /> : null),
  summary: () => <Bullets items={['コードを書かずに 3 か月で 3800 点まで来た', '知識の使い方と 知識が尽きた先を 人が決めた', '任せられるのは 良し悪しを見分けられる範囲', '見分ける力は 何度も作って比べることで積める']} />,
}
