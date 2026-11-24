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

const N = 25

// 状態ごとに舞台の根に付けるクラス。枠の列は 0〜16 のあいだ拡大位置で待ち、17 で 24 大会の並びに縮む
const FLAGS: Record<string, (s: number) => boolean> = {
  boardon: (s) => [0, 2, 3].includes(s),
  warm: (s) => s >= 22,
  bigpos: (s) => s <= 16,
  col8: (s) => s === 5 || s === 6,
  col8lit: (s) => s === 6,
  tl: (s) => s >= 17 && s <= 19,
  res: (s) => s >= 17 && s <= 19,
  y06: (s) => s === 18,
  y09: (s) => s === 19,
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

// 第 2 回 (1991) から第 25 回 (2015) の 24 大会。CSA 会誌 27 号の「24 回連続 8 位以内」に合わせた。
// 1995 年は開催が無い (第 5 回が 1994 年 12 月、第 6 回が 1996 年 1 月)。決勝リーグができたのは第 6 回からだが、
// 話者の判断で 8 位以内の 24 大会を「決勝」として数える
const YEARS = [1991, 1992, 1993, 1994, ...Array.from({ length: 20 }, (_, i) => 1996 + i)]
// 各大会の YSS の最終順位。出典は選手権の全成績の表 (http://www.yss-aya.com/csa_all.html)
const RANK = [5, 4, 4, 3, 4, 1, 5, 2, 2, 5, 8, 2, 1, 4, 2, 1, 4, 7, 8, 8, 7, 8, 3, 6]
// 並びに縮んだあとの列の間隔とマスの高さ (shogi.css の .tl .col と .cell)。順位の線はこの座標で引く
const PITCH = 44.83
const COLW = 34.83
const ROWH = 26

/** 24 大会の 8 枠。各列にその年の YSS の順位のマスを灯し、線でつなぐ。優勝と準優勝のマスは色を変える */
function Grid() {
  return (
    <div className="abs grid">
      {YEARS.map((y, i) => {
        const yc = WIN.includes(y) ? ' w' : SECOND.includes(y) ? ' r' : ''
        const full = i === 0 || i === YEARS.length - 1
        return (
          <div key={y} className={`col y${y}`} style={{ '--cd': `${(i * 0.06).toFixed(2)}s` } as CSSProperties}>
            {Array.from({ length: 8 }, (_, k) => {
              const r = k + 1
              const cls = r === 1 && WIN.includes(y) ? ' win' : r === 2 && SECOND.includes(y) ? ' second' : r === RANK[i] ? ' yss' : ''
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
      <svg className="rankline" width={1066} height={204} aria-hidden="true">
        <polyline points={RANK.map((r, i) => `${(i * PITCH + COLW / 2).toFixed(1)},${(r - 1) * ROWH + 11}`).join(' ')} />
      </svg>
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
        <div className="kicker">24 years</div>
        <div className="big">
          この <em>8 枠</em>に<br />
          <em>24 年</em>残り続けた
          <br />
          ソフトがある
        </div>
        <div className="sub">
          私がエンジニアになった
          <br />
          きっかけのソフト
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
          {/* 拡大したときに見える行の全幅 (順位の数字から右端の列まで) を囲む */}
          <div className="box rows" style={{ left: 42, top: 199, width: 748, height: 46 }} />
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

      {/* ===== 13-15 9 位の翌年 / 走れたのは 1 年 ===== */}
      <Show {...p} show="13" className="quote">
        <div className="kicker jp">前年 9 位から 翌年優勝</div>
        <div className="nine">
          <div className="row">
            <span className="y">2012</span>9 位<span className="ar">→</span>
            <span className="y">2013</span>
            <em>優勝</em>
            <b>Bonanza</b>
          </div>
          <div className="row">
            <span className="y">2013</span>9 位<span className="ar">→</span>
            <span className="y">2014</span>
            <em>優勝</em>
            <b>Apery</b>
          </div>
        </div>
        <div className="sub" style={{ marginTop: 30 }}>
          2 年続けて 前年 9 位のソフトが優勝していた
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
          <em>2015 年までの 1 年</em>だけ
        </div>
      </Show>
      {/* ひまわりの順位 (出典は選手権の全成績の表)。縦は順位で、1 位が上。1 順位 = 5.3px */}
      <Show {...p} show="15" anim="fade" d={0.2} className="hchart">
        <svg width={1000} height={190} aria-hidden="true">
          <rect className="band" x={0} y={10} width={1000} height={42.4} />
          <line className="cut" x1={0} y1={52.4} x2={1000} y2={52.4} />
          <line className="s1" x1={150} y1={171.7} x2={500} y2={55} pathLength={1} />
          <line className="s2" x1={500} y1={55} x2={850} y2={108} />
          <circle cx={150} cy={171.7} r={8} />
          <circle cx={500} cy={55} r={10} className="hot" />
          <circle cx={850} cy={108} r={8} className="dim" />
        </svg>
        <div className="bandlb">決勝の 8 枠</div>
        <div className="over">本当に頑張った 1 年</div>
        <div className="lb" style={{ left: 150 }}>
          <small>2014</small>31 位
        </div>
        <div className="lb hot" style={{ left: 500 }}>
          <small>2015</small>9 位
        </div>
        <div className="lb" style={{ left: 850, color: 'var(--mute)' }}>
          <small>2016</small>19 位
        </div>
      </Show>

      {/* ===== 16 5 年限界説 (YSS とは別の話として 1 枚で) ===== */}
      <Show {...p} show="16" d={0.15} className="quote">
        <div className="kicker jp">コンピュータ将棋の 5 年限界説</div>
        <div className="q">
          開発 <em>5 年</em>で
          <br />
          改良のネタが尽きる
        </div>
        <div className="sub" style={{ marginTop: 28 }}>
          強くならなくなり 開発者は去っていく という経験則
        </div>
      </Show>

      {/* ===== 17-19 YSS の 24 大会 ===== */}
      <Grid />
      <div className="abs track" />
      <Show {...p} show="17-19" anim="fade" d={0.6} className="tracklabel">
        各列 ＝ その年の決勝の 8 枠
      </Show>
      <Show {...p} show="17-19" anim="left" className="hd">
        <div className="kicker jp">世界コンピュータ将棋選手権</div>
        <div className="name grad" style={{ marginTop: 22 }}>
          YSS
        </div>
        <div className="who">
          作者 <b>山下さん</b>
        </div>
      </Show>
      <Show {...p} show="17" anim="right" d={0.2} className="zone">
        <div className="ztext">
          <div className="kicker">1991 ─ 2015</div>
          <div className="lead" style={{ marginTop: 14, fontSize: 40 }}>
            <em>24 大会</em>連続 決勝進出
          </div>
        </div>
        <div className="legend" style={{ position: 'absolute', top: 104, margin: 0 }}>
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
            <span className="sw yss" />
            灯ったマスが その年の YSS の順位
          </div>
        </div>
      </Show>
      <Show {...p} show="18" anim="zoom" d={0.1} className="zone">
        <div className="ztext">
          <div className="kicker">技術の入れ替わり 1</div>
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
      <Show {...p} show="19" anim="zoom" d={0.1} className="zone">
        <div className="ztext">
          <div className="kicker">技術の入れ替わり 2</div>
          <div className="big2006" style={{ marginTop: 16 }}>
            2009
          </div>
          <div className="lead" style={{ marginTop: 12 }}>
            <em>Bonanza</em> のソースが公開される
          </div>
          <p style={{ fontSize: 19, marginTop: 8 }}>
            誰でも Bonanza の上から始められるようになった
            <br />
            この年 YSS は 7 位
          </p>
        </div>
      </Show>
      <Show {...p} show="19" d={0.45} className="connector c09" />

      {/* ===== 20-21 山下さん ===== */}
      <Show {...p} show="20-21" anim="zoom" className="ph">
        <img src={yamashitaHoki} alt="保木さんと山下さん" />
        <div className="shade" />
        <span className="tag">山下さん</span>
      </Show>
      <Show {...p} show="20-21" anim="fade" d={0.3} className="phcap cap">
        右 山下さん（YSS）　左 保木さん（Bonanza）
      </Show>
      {/* 話者の印象。山下さんの言葉と取られないよう、本文でも印象だと分かる形にする */}
      <Show {...p} show="20" anim="right" d={0.2} className="yt">
        <div className="kicker jp">私の印象</div>
        <div className="mid">
          流行りの技術も
          <br />
          いいと言われたものも
          <br />
          <em>とらわれずに</em>取り入れる
          <br />
          人に見える
        </div>
      </Show>
      <Show {...p} show="21" anim="right" d={0.2} className="yt">
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

      {/* ===== 22-24 締め ===== */}
      <Show {...p} show="22" className="end">
        <div className="l">走ることは難しくない</div>
        <div className="l" style={{ '--d': '.6s' } as CSSProperties}>
          <em>走り続けること</em>が難しい
        </div>
      </Show>
      <Show {...p} show="22" d={0.4} className="run" />
      <Show {...p} show="23" d={0.15} className="restart">
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
      <Show {...p} show="23" className="newrun" />
      <Show {...p} show="23" anim="fade" d={1.6} className="newrunlb">
        → 2027.05
      </Show>
      <Show {...p} show="24" d={0.15} className="goal">
        <div className="l1">世界コンピュータ将棋選手権には</div>
        <div className="l2">
          <em>山下さん</em>のような
          <br />
          人がいる
        </div>
      </Show>
      <Show {...p} show="24" d={0.5} className="run" />

      <Show {...p} show="1,4-24" anim="fade" className="foot">
        <b>WCSC</b>　World Computer Shogi Championship
      </Show>
      <div className="abs pager">
        {String(s + 1).padStart(2, '0')} / {N}
      </div>
    </div>
  )
}

export default defineScene({ id: 'shogi', steps: N, Component: Bare })
