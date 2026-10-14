// KomeKaigi 2026 (2026-10-31)。いまは絵コンテを固めている段階で、表紙と自己紹介のほかは
// スケッチの画面 (scenes/_draft.tsx と _sketch.tsx)。仕上げるときに、scenes の並びを 1 つずつ実装へ置き換える。
// 公開は、実装が済んでから true にする
import { defineTalk, type SceneDef } from '@hokuchi/stage'
import { mosh } from '@hokuchi/stage/themes/mosh'
// @ts-expect-error 構成を固めているあいだだけ、絵コンテを直接読む (型の宣言は virtual:talk にしか無い)
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
  roles: ['7 年ぶりに将棋 AI の開発を再開した人'],
  hobbies: 'コンピュータ将棋（世界コンピュータ将棋選手権に 2010〜2019 年参加）\n今年の 7 月に、AI と一緒に開発を再開しました',
})

const done: Record<string, SceneDef> = { title, profile }

export default defineTalk({
  title: 'AIに任せられるのは、磨いてきたものだけ',
  description: '将棋 AI の開発を AI に任せきって分かったことと、AI に任せる時代に経験をどう積み直すかを話します。',
  event: { name: 'KomeKaigi 2026', url: 'https://komekaigi.dev/' },
  speaker: '山本 一将',
  affiliation: 'MOSH株式会社',
  public: false,
  theme: mosh,
  scenes: (board.scenes as Parameters<typeof draftScene>[0][]).map((s) => done[s.id] ?? draftScene(s)),
})
