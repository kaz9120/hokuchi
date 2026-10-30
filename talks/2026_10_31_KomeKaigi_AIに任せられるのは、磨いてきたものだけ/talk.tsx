/// <reference types="vite/client" />
// KomeKaigi 2026 (2026-10-31)。シーンの並びは絵コンテ (storyboard.md) から読む。
// scenes/<id>.tsx を置いたシーンはその実装を、まだ無いシーンはスケッチの画面 (scenes/_draft.tsx) を出す。
// 公開は、実装が済んでから true にする
import { defineTalk, type FrameProps, type SceneDef } from '@hokuchi/stage'
import { mosh } from '@hokuchi/stage/themes/mosh'
// @ts-expect-error 絵コンテを直接読む (型の宣言は virtual:talk にしか無い)
import board from 'virtual:storyboard'
import { coverScene } from '../../parts/cover'
import { profileScene } from '../../parts/profile'
import { coverBackground, draftScene } from './scenes/_draft'

const title = coverScene({
  background: coverBackground,
  title: (
    <>
      AIに任せられるのは、
      <br />
      <span style={{ color: 'var(--accent)' }}>磨いてきたものだけ</span>
    </>
  ),
})

const profile = profileScene({
  roles: ['7 年ぶりに将棋 AI の開発を再開した', '元世界 9 位の人'],
  hobbies: 'コンピュータ将棋（選手権に 2010〜2019 年参加）\n今年の 7 月に AI と一緒に開発を再開しました',
})

// 章の案内。いまどこの話かを見失わないよう、画面の左下に章の名前を並べ、いまの章を強調色にする。
// 章の名前は絵コンテの ## から取る。map のシーン (今日の流れ) から出し、はじめにと終わりの章では出さない
type Board = { chapters: { name: string }[]; scenes: { id: string; chapter: string | null }[] }
const strip = (name: string | null) => (name ?? '').replace(/^\d+\.\s*/, '')
const CHAPTERS = (board as Board).chapters.map((c) => strip(c.name)).filter((n) => n !== 'はじめに')
const chapterOf = Object.fromEntries((board as Board).scenes.map((s) => [s.id, strip(s.chapter)]))
const NAV_FROM = 'map'
const NAV_HIDE = new Set(['closing'])
const navIndex = (board as Board).scenes.findIndex((s) => s.id === NAV_FROM)

function ChapterNav({ id }: { id: string }) {
  const i = (board as Board).scenes.findIndex((s) => s.id === id)
  if (i < navIndex || NAV_HIDE.has(id)) return null
  const current = chapterOf[id]
  return (
    // ブランド枠と同じく .frame の中に置く (検査は枠の文字を本文の小さい文字として数えない)
    <div className="frame" style={{ position: 'absolute', inset: 'auto auto 14px 28px', display: 'flex', gap: 6, fontSize: 16, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
      {CHAPTERS.map((name, k) => (
        <span key={name} style={{ display: 'flex', gap: 6 }}>
          {k > 0 && <span aria-hidden>›</span>}
          <span style={{ color: name === current ? 'var(--accent-strong)' : undefined, fontWeight: name === current ? 800 : 500, transition: 'color 0.4s' }}>{name}</span>
        </span>
      ))}
    </div>
  )
}

const theme = {
  ...mosh,
  Frame: (props: FrameProps) => (
    <>
      <mosh.Frame {...props} />
      <ChapterNav id={props.scene.id} />
    </>
  ),
}

// 先頭が _ のファイルは、シーンではなくシーンどうしで使い回す部品
const modules = import.meta.glob<{ default: SceneDef }>(['./scenes/*.tsx', '!./scenes/_*.tsx'], { eager: true })
const built = Object.fromEntries(Object.values(modules).map((m) => [m.default.id, m.default]))
const done: Record<string, SceneDef> = { title, profile, ...built }

export default defineTalk({
  title: 'AIに任せられるのは、磨いてきたものだけ',
  description: '将棋 AI の開発を AI に任せきって分かったのは、AI に任せるほど差は人の経験で付くということでした。その経験の元になる専門性と個性を、いまどう磨くかを話します。',
  event: { name: 'KomeKaigi 2026', url: 'https://komekaigi.dev/' },
  speaker: '山本 一将',
  affiliation: 'MOSH株式会社',
  public: true,
  theme,
  // 話者のリハーサルで、めくりが遅いと言われた (2026-10-24)。動きの時間を 3 割縮める
  tempo: 0.7,
  scenes: (board.scenes as Parameters<typeof draftScene>[0][]).map((s) => done[s.id] ?? draftScene(s)),
})
