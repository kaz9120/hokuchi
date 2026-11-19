// 元の index.html の 27 状態を、1 シーンに写す。
// 要素はすべて置いたままにし、状態ごとに .on と舞台の根のクラスだけを替えて、CSS の transition で動かす (元と同じ仕組み)。
// 静止画モードでは base.css が transition を切るので、各状態の最終の姿が撮れる
import type { CSSProperties, ReactNode } from 'react'
import { defineScene, useStep } from '@hokuchi/stage'
import profile from '../assets/profile.jpg'
import aiShogi from '../assets/ai-shogi.png'
import result2015 from '../assets/result2015.png'
import yamashitaHoki from '../assets/yamashita-hoki.png'
import './shogi.css'

const N = 27

// 状態ごとに舞台の根に付けるクラス。枠の列は 0〜15 のあいだ拡大位置で待ち、16 で 20 年の並びに縮む
const FLAGS: Record<string, (s: number) => boolean> = {
  boardon: (s) => [0, 2, 3].includes(s),
  warm: (s) => s >= 24,
  bigpos: (s) => s <= 15,
  col8: (s) => s === 5 || s === 6,
  col8lit: (s) => s === 6,
  tl: (s) => s >= 16 && s <= 21,
  res: (s) => s >= 17 && s <= 21,
  y06: (s) => s === 18,
  dimall: (s) => s === 19,
  five: (s) => s === 20,
  fin: (s) => s === 21,
  zoom: (s) => s === 11 || s === 12,
  mean: (s) => s === 12,
}

/** "1,4-26" のような範囲に、いまの状態が入るか */
function inRange(spec: string, s: number) {
  return spec.split(',').some((r) => {
    const [a, b = a] = r.split('-').map(Number)
    return s >= a && s <= b
  })
}

type ShowProps = {
  show: string
  anim?: 'fade' | 'left' | 'right' | 'zoom'
  /** 登場の遅れ (秒) */
  d?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
  s: number
}

/** 元の data-show。範囲の状態で .on が付く */
function Show({ show, anim, d, className = '', style, children, s }: ShowProps) {
  return (
    <div
      data-show={show}
      data-anim={anim}
      className={`abs ${className}${inRange(show, s) ? ' on' : ''}`}
      style={{ ...(d !== undefined ? { '--d': `${d}s` } : {}), ...style } as CSSProperties}
    >
      {children}
    </div>
  )
}

const WIN = [1997, 2004, 2007]
const SECOND = [1999, 2000, 2003, 2006]

/** 1996〜2015 の 20 大会。順位が分かっている年だけ色を付ける (ほかの年は「決勝に残った」だけを示す) */
function Grid() {
  return (
    <div className="abs grid">
      {Array.from({ length: 20 }, (_, i) => {
        const y = 1996 + i
        const yc = WIN.includes(y) ? ' w' : SECOND.includes(y) ? ' r' : ''
        const full = i === 0 || i === 19
        return (
          <div key={y} className={`col y${y}`} style={{ '--cd': `${(i * 0.06).toFixed(2)}s` } as CSSProperties}>
            {Array.from({ length: 8 }, (_, k) => {
              const r = k + 1
              const cls = r === 1 && WIN.includes(y) ? ' win' : r === 2 && SECOND.includes(y) ? ' second' : ''
              return (
                <div key={r} className={`cell${cls}`}>
                  <span className="n">{r}</span>
                </div>
              )
            })}
            <div className={`yr${yc}${full ? ' full' : ''} y${y}`}>{full ? y : String(y).slice(2)}</div>
          </div>
        )
      })}
    </div>
  )
}

/** 盤の線 (9×9 のマス = 10 本ずつ) */
function Board() {
  return (
    <svg className="board" viewBox="0 0 900 900" aria-hidden="true">
      <g>
        {Array.from({ length: 10 }, (_, i) => (
          <g key={i}>
            <line x1={i * 100} y1={0} x2={i * 100} y2={900} />
            <line x1={0} y1={i * 100} x2={900} y2={i * 100} />
          </g>
        ))}
      </g>
      <circle cx="300" cy="300" r="5" />
      <circle cx="600" cy="300" r="5" />
      <circle cx="300" cy="600" r="5" />
      <circle cx="600" cy="600" r="5" />
    </svg>
  )
}

const k = (n: number) => ({ '--k': n }) as CSSProperties

function Bare() {
  const s = useStep()
  const flags = Object.keys(FLAGS).filter((f) => FLAGS[f](s))
  const p = { s }
  return (
    <div className={`bx s${s} ${flags.join(' ')}`}>
      <div className="bg">
        <div className="glow" />
        <Board />
        <div className="vignette" />
        <div className="grain" />
      </div>

      {/* ===== 0 表紙 ===== */}
      <Show {...p} show="0" anim="fade" className="cover">
        <div className="catch">焚き火を愛するエンジニア</div>
        <div className="l1">
          将棋<span className="x">×</span>エンジニアリング
        </div>
        <div className="l2">
          <span className="is">=</span>
          <span className="grad">世界コンピュータ将棋選手権</span>
        </div>
        <div className="who">
          山本一将<span>MOSH株式会社</span>
        </div>
        <div className="ev">MOSH Tech Meetup #6「あなたが好きなこと × エンジニアリング」　2026.11.25</div>
      </Show>

      {/* ===== 1 自己紹介 ===== */}
      <Show {...p} show="1" anim="zoom" className="me">
        <img src={profile} alt="山本一将" />
      </Show>
      <Show {...p} show="1" anim="right" d={0.15} className="meText">
        <div className="kicker jp">焚き火を愛するエンジニア</div>
        <div className="name">山本一将</div>
        <div className="org">MOSH株式会社</div>
        <div className="facts">
          <div className="f">
            <i>SOFT</i>将棋ソフト「ひまわり」を作っている
          </div>
          <div className="f">
            <i>BEST</i>元 世界コンピュータ将棋選手権 9 位
          </div>
          <div className="f">
            <i>2026</i>今年 7 年ぶりに開発を再開
          </div>
        </div>
      </Show>

      {/* ===== 2-3 今日の話 ===== */}
      <Show {...p} show="2" anim="fade" className="t1k kicker jp">
        今日の話
      </Show>
      <Show {...p} show="2-3" className="t1">
        <div className="eq">
          <span>将棋</span>
          <span className="x">×</span>
          <span>エンジニアリング</span>
        </div>
      </Show>
      <Show {...p} show="3" d={0.35} className="t1b">
        <span className="is">=</span>
        <span className="wcsc grad">世界コンピュータ将棋選手権</span>
        <span className="rule" />
      </Show>

      {/* ===== 4-6 選手権と 8 枠 ===== */}
      <Show {...p} show="4" className="s2text">
        <div className="kicker">every may</div>
        <div className="big">
          毎年 5 月<br />
          <em>将棋ソフトどうし</em>が<br />
          対局する大会
        </div>
        <div className="sub">指し手を考えるのはプログラム</div>
      </Show>
      <Show {...p} show="4" anim="right" d={0.15} className="term a">
        <div className="bar">
          <i />
          <i />
          <i />
          <span>▲ sente — engine</span>
        </div>
        <pre>
          <span className="ln" style={k(0)}>
            <span className="c">&gt; position startpos</span>
          </span>
          <span className="ln" style={k(1)}>
            <span className="c">&gt; go</span>
          </span>
          <span className="ln" style={k(2)}>
            bestmove <span className="mv">▲7六歩</span>
          </span>
          <span className="ln" style={k(4)}>
            bestmove <span className="mv">▲2六歩</span>
          </span>
          <span className="ln" style={k(6)}>
            bestmove <span className="mv">▲2五歩</span>
          </span>
          <span className="ln" style={k(8)}>
            <span className="c">&gt; go</span> <span className="cursor" />
          </span>
        </pre>
      </Show>
      <Show {...p} show="4" anim="right" d={0.3} className="term b">
        <div className="bar">
          <i />
          <i />
          <i />
          <span>△ gote — engine</span>
        </div>
        <pre style={{ minHeight: 190 }}>
          <span className="ln" style={k(0)}>
            <span className="c">&gt; position startpos</span>
          </span>
          <span className="ln" style={k(3)}>
            bestmove <span className="mv">△3四歩</span>
          </span>
          <span className="ln" style={k(5)}>
            bestmove <span className="mv">△8四歩</span>
          </span>
          <span className="ln" style={k(7)}>
            bestmove <span className="mv">△8五歩</span>
          </span>
        </pre>
      </Show>
      <Show {...p} show="5" d={0.25} className="s2text">
        <div className="kicker">final — top 8</div>
        <div className="big">
          決勝に進めるのは
          <br />
          上位 <em>8 本</em>だけ
        </div>
        <div className="sub">
          2 日目の上位 8 本が
          <br />
          翌日の決勝で優勝を争う
        </div>
      </Show>
      <Show {...p} show="6" d={0.25} className="s2text">
        <div className="kicker">20 years</div>
        <div className="big">
          この <em>8 枠</em>に<br />
          <em>20 年</em>残り続けた
          <br />
          ソフトがある
        </div>
      </Show>

      {/* ===== 7-9 原点 ===== */}
      <Show {...p} show="7" className="orig">
        <div className="kicker jp">原点</div>
        <div className="big">
          小学生のとき
          <br />
          家に初めて来たパソコンに
          <br />
          <em>AI 将棋</em>が入っていた
        </div>
      </Show>
      <Show {...p} show="8" d={0.2} className="orig">
        <div className="kicker jp">原点</div>
        <div className="steps">
          <div className="st">
            <i>01</i>パッケージで選手権を知る
          </div>
          <div className="ar" />
          <div className="st">
            <i>02</i>プログラミングを始める
          </div>
          <div className="ar" />
          <div className="st">
            <i>03</i>
            <span>
              <em>エンジニア</em>になった
            </span>
          </div>
        </div>
      </Show>
      <Show {...p} show="9" d={0.2} className="orig">
        <div className="kicker jp">原点</div>
        <div className="big">
          その AI 将棋が
          <br />
          大会では <em>YSS</em>
        </div>
        <div className="sub" style={{ marginTop: 26 }}>
          作ったのは山下さん
        </div>
      </Show>
      <Show {...p} show="7-9" d={0.15} className="pkg">
        <img src={aiShogi} alt="AI将棋のパッケージ" />
      </Show>
      <Show {...p} show="7-9" anim="fade" d={0.3} className="pkgcap cap">
        AI 将棋のパッケージ（PS2 版）
      </Show>
      <Show {...p} show="9" d={0.45} className="yssTag">
        YSS
      </Show>

      {/* ===== 10-12 2015 年の結果表 ===== */}
      <Show {...p} show="10" anim="left" className="tleft">
        <div className="kicker">2015 · 第 25 回 · 2 日目</div>
        <div className="mid" style={{ marginTop: 24 }}>
          私の
          <br />
          いちばん
          <br />
          良かった年
        </div>
        <div className="sub" style={{ marginTop: 22, fontSize: 24 }}>
          YSS が最後に
          <br />
          決勝に残った年
        </div>
      </Show>
      <Show {...p} show="11" d={0.5} className="ttop">
        <div className="kicker">2015 · 第 25 回 · 2 日目</div>
        <div className="mid">
          <em>8 位</em> YSS　<em>9 位</em> ひまわり　どちらも 5 勝
        </div>
      </Show>
      <Show {...p} show="12" d={0.1} className="ttop">
        <div className="kicker">2015 · 第 25 回 · 2 日目</div>
        <div className="mid">
          直接対決は勝った
          <br />
          それでも決勝に進んだのは <em>YSS</em>
        </div>
      </Show>
      <Show {...p} show="10-12" anim="fade" className="tframe">
        <div className="tbl">
          <img src={result2015} alt="2015 年 第 25 回選手権 2 日目の結果表" />
          <div className="dimr" style={{ top: 0, height: 199 }} />
          <div className="dimr" style={{ top: 245, bottom: 0 }} />
          <div className="box rows" style={{ left: 66, top: 199, width: 700, height: 46 }} />
          <div className="box ring" style={{ left: 360, top: 221, width: 46, height: 24 }} />
          <div className="box ring" style={{ left: 636, top: 197, width: 68, height: 50, borderRadius: 14 }} />
        </div>
      </Show>
      <Show {...p} show="12" d={0.3} className="tick" style={{ left: 588 }} />
      <Show {...p} show="12" d={0.5} className="tick" style={{ left: 1049 }} />
      <Show {...p} show="12" d={0.4} className="call" style={{ left: 589 }}>
        <div className="k">ROUND 4 · 8+</div>
        <div className="v">ひまわりが YSS に勝った</div>
      </Show>
      <Show {...p} show="12" d={0.6} className="call" style={{ left: 1050, width: 400, marginLeft: -200 }}>
        <div className="k">SOS · 対戦相手の成績の合計</div>
        <div className="v">
          48.5 と 48.0　<b>0.5</b> 差
        </div>
      </Show>

      {/* ===== 13-15 走れたのは翌 1 年 ===== */}
      <Show {...p} show="13" className="quote">
        <div className="kicker jp">2015 · 懇親会で言われた</div>
        <div className="q">
          <span className="br">「</span>来年 決勝に残るか
          <br />
          残れないかが全て<span className="br">」</span>
        </div>
      </Show>
      <Show {...p} show="14" d={0.2} className="quote">
        <div className="kicker jp">9 位でやりきった感が出ていた</div>
        <div className="q">
          やばい
          <br />
          これを<em>もう 1 年</em>やるのか
        </div>
      </Show>
      <Show {...p} show="15" d={0.2} className="quote">
        <div className="kicker jp">ひまわり</div>
        <div className="q">
          走れたのは
          <br />
          <em>翌 1 年</em>
        </div>
      </Show>
      <Show {...p} show="15" anim="fade" d={0.2} className="mytrack">
        <div className="seg1" />
        <div className="seg2" />
        <div className="over">本当に頑張った 1 年</div>
        <div className="dot" style={{ left: 0 }} />
        <div className="dot dim" style={{ left: 400 }} />
        <div className="lb" style={{ left: 0 }}>
          <small>2015</small>9 位
        </div>
        <div className="lb" style={{ left: 400 }}>
          <small>2016</small>成績が落ちる
        </div>
        <div className="lb" style={{ left: 740, color: 'var(--mute)' }}>
          <small>その後</small>惰性
        </div>
      </Show>

      {/* ===== 16-21 YSS の 20 年 ===== */}
      <Grid />
      <div className="abs track" />
      <Show {...p} show="16-21" anim="fade" d={0.6} className="tracklabel">
        決勝進出 ─ 20 大会連続
      </Show>
      <Show {...p} show="16-21" anim="left" className="hd">
        <div className="kicker jp">世界コンピュータ将棋選手権</div>
        <div className="name grad" style={{ marginTop: 22 }}>
          YSS
        </div>
        <div className="who">
          作者 <b>山下さん</b>
        </div>
      </Show>
      <Show {...p} show="16" anim="right" d={0.2} className="zone">
        <div className="ztext">
          <div className="kicker">1996 ─ 2015</div>
          <div className="lead" style={{ marginTop: 18, fontSize: 40 }}>
            決勝の 8 枠を<br />
            <em>20 年</em>並べると
          </div>
        </div>
      </Show>
      <Show {...p} show="17" anim="right" d={0.15} className="zone">
        <div className="legend">
          <div className="row">
            <span className="sw w" />
            <span>優勝</span>
            <span className="cnt">3</span>
            <span className="yl">1997 · 2004 · 2007</span>
          </div>
          <div className="row">
            <span className="sw r" />
            <span>準優勝</span>
            <span className="cnt">4</span>
            <span className="yl">1999 · 2000 · 2003 · 2006</span>
          </div>
          <div className="row" style={{ fontWeight: 400, fontSize: 20, color: 'var(--mute)' }}>
            <span className="sw" style={{ border: '1.5px solid var(--e400)', boxShadow: '0 0 10px rgba(244,125,58,.5)' }} />
            決勝の 8 本に入った年
          </div>
        </div>
      </Show>
      <Show {...p} show="18" anim="zoom" d={0.1} className="zone">
        <div className="ztext">
          <div className="kicker">技術の入れ替わり</div>
          <div className="big2006" style={{ marginTop: 16 }}>
            2006
          </div>
          <div className="lead" style={{ marginTop: 12 }}>
            <em>Bonanza</em> が初出場・初優勝
          </div>
          <p style={{ fontSize: 19, marginTop: 8 }}>
            機械学習を取り入れ 選択的探索が主流の中で全幅探索
            <br />
            この年 YSS は準優勝
          </p>
        </div>
      </Show>
      <Show {...p} show="18" d={0.45} className="connector" />
      <Show {...p} show="19" anim="right" d={0.1} className="zone">
        <div className="ztext">
          <div className="kicker jp">
            もう一つの入れ替わり<span className="bxchip">時期は要確認</span>
          </div>
          <div className="lead" style={{ marginTop: 18 }}>
            強いソフトが<em>ソースごと</em>公開される
          </div>
          <p>
            優勝ラインに届きうるソースコードと評価関数が
            <br />
            そのまま使える形で出回る
            <br />
            誰でもその上から始められる
          </p>
        </div>
      </Show>
      <Show {...p} show="20" anim="right" d={0.1} className="zone">
        <div className="ztext">
          <div className="kicker jp">5 年限界説</div>
          <div className="lead" style={{ marginTop: 18 }}>
            開発 <em>5 年</em>で改良のネタが尽きる
          </div>
          <p>
            強くならなくなり
            <br />
            開発者は去っていく
            <br />
            そう言われてきた経験則
          </p>
        </div>
      </Show>
      {[100, 370, 640, 910].map((left, i) => (
        <Show key={left} {...p} show="20" d={0.3 + i * 0.25} className="brk" style={{ left, width: 270 }}>
          <span>5 年</span>
        </Show>
      ))}
      {[370, 640, 910].map((left, i) => (
        <Show key={left} {...p} show="20" anim="fade" d={0.55 + i * 0.25} className="wall" style={{ left }} />
      ))}
      <Show {...p} show="21" anim="zoom" d={0.15} className="zone">
        <div className="stat">
          <span className="num">20</span>
          <span className="lbl">
            大会連続
            <br />
            決勝進出
          </span>
        </div>
        <div className="stat2">
          <span>
            優勝<b>3</b>
          </span>
          <span>
            準優勝<b>4</b>
          </span>
        </div>
      </Show>

      {/* ===== 22-23 山下さん ===== */}
      <Show {...p} show="22-23" anim="zoom" className="ph">
        <img src={yamashitaHoki} alt="保木さんと山下さん" />
        <div className="shade" />
        <span className="tag">山下さん</span>
      </Show>
      <Show {...p} show="22-23" anim="fade" d={0.3} className="phcap cap">
        右 山下さん（YSS）　左 保木さん（Bonanza）
      </Show>
      <Show {...p} show="22" anim="right" d={0.2} className="yt">
        <div className="kicker jp">山下さん</div>
        <div className="mid">
          流行りの技術も
          <br />
          いいと言われたものも
          <br />
          <em>とらわれずに</em>取り入れる
        </div>
      </Show>
      <Show {...p} show="23" anim="right" d={0.2} className="yt">
        <div className="kicker jp">山下さん</div>
        <div className="mid">
          いまも
          <br />
          <em>形を変えて</em>
          <br />
          開発を続けている
        </div>
        <div className="sub">
          会場で会う山下さんは
          <br />
          いつも若々しく楽しそう
        </div>
      </Show>

      {/* ===== 24-26 締め ===== */}
      <Show {...p} show="24" className="end">
        <div className="l">走ることは難しくない</div>
        <div className="l" style={{ '--d': '.6s' } as CSSProperties}>
          <em>走り続けること</em>が難しい
        </div>
      </Show>
      <Show {...p} show="24" d={0.4} className="run" />
      <Show {...p} show="25" d={0.15} className="restart">
        <div className="kicker jp">2026</div>
        <div className="big">
          私も今年
          <br />
          <em>また走り始めた</em>
        </div>
        <div className="sub">
          来年 5 月の選手権に出られるところまで
          <br />
          このやる気が続くといい
        </div>
      </Show>
      <Show {...p} show="25" className="newrun" />
      <Show {...p} show="25" anim="fade" d={1.6} className="newrunlb">
        → 2027.05
      </Show>
      <Show {...p} show="26" d={0.15} className="goal">
        <div className="l1">世界コンピュータ将棋選手権には</div>
        <div className="l2">
          <em>山下さん</em>のような
          <br />
          人がいる
        </div>
      </Show>
      <Show {...p} show="26" d={0.5} className="run" />

      <Show {...p} show="1,4-26" anim="fade" className="foot">
        <b>WCSC</b>　World Computer Shogi Championship
      </Show>
      <div className="abs pager">
        {String(s + 1).padStart(2, '0')} / {N}
      </div>
    </div>
  )
}

export default defineScene({ id: 'shogi', steps: N, Component: Bare })
