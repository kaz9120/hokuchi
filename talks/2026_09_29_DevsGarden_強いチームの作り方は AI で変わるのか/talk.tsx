// Dev's Garden 2026-09-29 の作り直し (旧版は archive/talks/2026-09-ai-team-culture)
import { defineTalk } from '@hokuchi/stage'
import { mosh } from '@hokuchi/stage/themes/mosh'
import { profileScene } from '../../parts/profile'
import { title, closer } from './scenes/cover'
import { agenda, ch1, ch2, ch3, ch4, ch5 } from './scenes/chapters'
import oldProblems from './scenes/old-problems'
import productivity from './scenes/productivity'
import whyOrg from './scenes/why-org'
import cycle from './scenes/cycle'
import survey from './scenes/survey'
import newsletter from './scenes/newsletter'
import teamContext from './scenes/team-context'
import teamPractice from './scenes/team-practice'
import deploys from './scenes/deploys'
import next from './scenes/next'
import summary from './scenes/summary'

export default defineTalk({
  title: '強いチームの作り方は AI で変わるのか',
  description:
    'AI で新しい課題が生まれたのではなく、前からある課題が放置できなくなった。MOSH が組織的生産性をどう回しているかを、組織とチームの両方の立場から話しました。',
  event: { name: "Dev's Garden" },
  speaker: '山本 一将',
  public: true,
  theme: mosh,
  scenes: [
    title,
    profileScene({ hobbies: 'ヤクルトスワローズ、将棋、キャンプ、DQウォーク\n毎週 note を書いています' }),
    agenda,
    ch1,
    oldProblems,
    ch2,
    productivity,
    ch3,
    whyOrg,
    cycle,
    survey,
    newsletter,
    ch4,
    teamContext,
    teamPractice,
    ch5,
    deploys,
    next,
    summary,
    closer,
  ],
})
