// フレームワークの動作確認用のデモ。2026-09 Dev's Garden の 5 シーンを部品で書き直したもの
import { defineTalk } from '@hokuchi/stage'
import { mosh } from '@hokuchi/stage/themes/mosh'
import title from './scenes/title'
import oldProblems from './scenes/old-problems'
import productivity from './scenes/productivity'
import cycle from './scenes/cycle'
import deploys from './scenes/deploys'

export default defineTalk({
  title: '強いチームの作り方は AI で変わるのか',
  description: 'AI で新しい課題が生まれたのではなく、前からある課題が放置できなくなった。MOSH が組織的生産性をどう回しているかを話しました。',
  date: '2026-09-29',
  event: { name: "Dev's Garden" },
  speaker: '山本 一将',
  theme: mosh,
  scenes: [title, oldProblems, productivity, cycle, deploys],
})
