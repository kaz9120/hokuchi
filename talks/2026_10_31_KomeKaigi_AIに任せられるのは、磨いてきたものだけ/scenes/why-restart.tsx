// 再開したわけ。大きな文を差し替えたあと、仕事と将棋 AI を上下 2 段の流れで並べる。
// 各段は「作ったもの (価値・強さ) → 手法の良し悪し」。仕事は作ったものの価値が測れないので手法も測れない。
// 将棋 AI は対局で強さが測れるので手法も測れる。そこから仕事の段へ「手法を持ち帰る」の矢印が戻る (この発表のロジックの要)
// 動きの役割: 強調 (文の差し替え) → 連続性 (段の流れが順につながる) → 関係性の変化 (将棋の段が測れる・手法を持ち帰る)
import { Connect, Reveal, Swap, defineScene, pick, t, useStep } from '@hokuchi/stage'
import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'

const TEXTS = ['AI に開発を任せきる手法が\n次々に出ています', 'その手法の効果は\n仕事では確かめにくい', 'その手法の効果は\n仕事では確かめにくい', 'その手法の効果は\n仕事では確かめにくい', '将棋で通じた手法なら\n仕事にも持ち帰れます']

type Verdict = 'no' | 'yes' | 'hot'
type Row = { id: string; name: string; top: number; at: number; wait: number; a: { label: string; mark: string; verdict: Verdict }; b: { label: string; mark: string; verdict: Verdict } }

const ROWS: Row[] = [
  // 仕事の段は、大きな文が見出しの位置へ上がり終えてから出す (上がる途中の文と重ねない)
  { id: 'w', name: '仕事', top: 236, at: 2, wait: 0.5, a: { label: '作ったものの価値', mark: '測れない', verdict: 'no' }, b: { label: '手法の良し悪し', mark: '測れない', verdict: 'no' } },
  { id: 's', name: '将棋 AI', top: 446, at: 3, wait: 0, a: { label: '作ったものの強さ', mark: '対局で測れる', verdict: 'yes' }, b: { label: '手法の良し悪し', mark: '測れる', verdict: 'hot' } },
]
const BOX = { a: 220, b: 650, width: 320, height: 120 }
/** 段の中で順に出る間隔 (秒): 箱 A → 印 → 矢印 → 箱 B → 印 */
const SEQ = { markA: 0.5, arrow: 0.7, boxB: 1.0, markB: 1.5 }

const pill: CSSProperties = { display: 'inline-block', padding: '2px 14px', borderRadius: 999, fontSize: 20, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap', boxSizing: 'border-box', transition: 'background 0.5s, border-color 0.5s, color 0.5s' }
const VERDICT: Record<Verdict, CSSProperties> = {
  // 測れない: 中身の無い点線の札
  no: { border: '2px dashed var(--muted)', color: 'var(--fg-sub)' },
  // 測れる: 墨で塗った札
  yes: { border: '2px solid var(--fg)', background: 'var(--fg)', color: 'var(--surface)' },
  // 測れる (手法そのもの): 強調色で塗った札
  hot: { border: '2px solid var(--accent)', background: 'var(--accent)', color: '#fff' },
}

/** 箱に付く印。箱が出たあとに遅れて付く。場所は先に取っておき、箱の中身が動かないようにする */
function Mark({ verdict, delay, children }: { verdict: Verdict; delay: number; children: ReactNode }) {
  return (
    <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={t({ delay })} style={{ ...pill, ...VERDICT[verdict] }}>
      {children}
    </motion.span>
  )
}

function Box({ node, left, top, at, delay, hot, label, mark, verdict, markDelay }: { node: string; left: number; top: number; at: number; delay: number; hot: boolean; label: string; mark: string; verdict: Verdict; markDelay: number }) {
  return (
    <Reveal at={at} delay={delay} node={node} style={{ position: 'absolute', left, top, width: BOX.width, height: BOX.height }}>
      <div className={`card ${hot ? 'tone-hot' : ''}`} style={{ width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 16px', textAlign: 'center', fontSize: 26, fontWeight: 800, lineHeight: 1.3 }}>
        {label}
        <Mark verdict={verdict} delay={markDelay}>
          {mark}
        </Mark>
      </div>
    </Reveal>
  )
}

function WhyRestart() {
  const step = useStep()
  const up = step >= 2
  return (
    <>
      {/* 大きな文。段の図が出るときに見出しの位置へ上がる */}
      <motion.div
        initial={false}
        animate={{ top: up ? 60 : 260, fontSize: up ? 44 : 54 }}
        transition={t()}
        style={{ position: 'absolute', left: 96, right: 200, fontWeight: 700, lineHeight: 1.4, letterSpacing: '0.02em', whiteSpace: 'pre-line' }}
      >
        <Swap>{pick(step, TEXTS)}</Swap>
      </motion.div>

      {ROWS.map((r) => (
        <div key={r.id}>
          <Reveal at={r.at} delay={r.wait} y={8} style={{ position: 'absolute', left: 96, top: r.top + BOX.height / 2 - 18, fontSize: 26, fontWeight: 800, color: 'var(--fg-sub)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {r.name}
          </Reveal>
          <Box node={`${r.id}-a`} left={BOX.a} top={r.top} at={r.at} delay={r.wait} hot={false} markDelay={SEQ.markA} {...r.a} />
          <Box node={`${r.id}-b`} left={BOX.b} top={r.top} at={r.at} delay={r.wait + SEQ.boxB} hot={r.b.verdict === 'hot'} markDelay={SEQ.markB - SEQ.boxB} {...r.b} />
          {/* 作ったものが測れるかが、手法が測れるかを決める */}
          <Connect from={`${r.id}-a`} to={`${r.id}-b`} at={r.at} curve={0} color={r.id === 's' ? 'var(--fg)' : 'var(--fg-sub)'} delay={r.wait + SEQ.arrow} flow />
        </div>
      ))}

      {/* 将棋で手法の良し悪しが分かれば、その手法を仕事に持ち帰れる */}
      <Connect from="s-b" to="w-b" at={4} fromSide="right" toSide="right" curve={0.5} width={4} flow label="手法を持ち帰る" />
    </>
  )
}

export default defineScene({ id: 'why-restart', steps: 5, Component: WhyRestart })
