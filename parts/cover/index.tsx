// 表紙のシーン。トークをまたいで使い回す。中身は talk.tsx の情報 (演題以外) から組み立てる
// 情報の強さの順に置く: 演題 (主役) → 登壇者 (名前・所属) → イベント (コミュニティ名・イベントタイトル・日付)
// イベントは文脈なので、演題と競わないよう下の帯に置く。視線が「演題 → 誰が → どこで・いつ」の順に流れる
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { defineScene, t, useActive, useTalk } from '@hokuchi/stage'

/** 演題の位置と大きさ。締めのシーンで問いを同じ位置に戻すときにも使う */
export const COVER_TITLE: CSSProperties = {
  position: 'absolute',
  left: 120,
  right: 120,
  top: 230,
  fontSize: 76,
  fontWeight: 800,
  lineHeight: 1.3,
  letterSpacing: '0.02em',
}

function Cover({ title, background }: { title: ReactNode; background?: string }) {
  const talk = useTalk()
  const active = useActive()
  // 演題 → 登壇者 → イベントの順に、少しずつ遅らせて出す
  const enter = (delay: number) => ({
    initial: false as const,
    animate: { opacity: active ? 1 : 0, y: active ? 0 : 16 },
    transition: t({ duration: 0.9, delay }),
  })
  const event = talk.event
  return (
    <div style={{ position: 'absolute', inset: 0, background }}>
      <motion.div style={COVER_TITLE} {...enter(0.2)}>
        {title}
      </motion.div>

      <motion.div style={{ position: 'absolute', left: 120, top: 488 }} {...enter(0.45)}>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{talk.speaker}</div>
        {talk.affiliation && <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg-sub)', marginTop: 4 }}>{talk.affiliation}</div>}
      </motion.div>

      {(event || talk.date) && (
        <motion.div
          style={{
            position: 'absolute',
            left: 120,
            right: 120,
            top: 600,
            paddingTop: 16,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            color: 'var(--fg-sub)',
            fontWeight: 600,
          }}
          {...enter(0.6)}
        >
          <div>
            {/* イベントタイトルがあるときは、コミュニティ名をその上の小さなラベルにする (シリーズ名と巻のタイトルの関係) */}
            {event?.title && <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.06em' }}>{event.name}</div>}
            {event && <div style={{ fontSize: 22, marginTop: 2 }}>{event.title ?? event.name}</div>}
          </div>
          {talk.date && <div style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{talk.date.replaceAll('-', '.')}</div>}
        </motion.div>
      )}
    </div>
  )
}

/**
 * 表紙のシーンを作る。演題は強調や改行を入れたいので、ReactNode で渡す。
 * 背景はテーマごとに違うので、CSS の background の値で渡す
 */
export function coverScene({ id = 'title', title, background }: { id?: string; title: ReactNode; background?: string }) {
  return defineScene({ id, steps: 1, Component: () => <Cover title={title} background={background} /> })
}
