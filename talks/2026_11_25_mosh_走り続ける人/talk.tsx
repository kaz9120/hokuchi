/// <reference types="vite/client" />
// MOSH Tech Meetup #6 (2026-11-25) の 5 分の発表。
// 背景の盤と熾火、決勝の 8 枠の列 (24 大会の並びに育つ) が全体を通して残るので、1 シーンに全状態を置いている。
// stage はシーンが変わるたびに横へパンするため、シーンを分けるとこの連続性が切れる
import { defineTalk } from '@hokuchi/stage'
import { hokuchi } from '@hokuchi/stage/themes/hokuchi'
import shogi from './scenes/shogi'

export default defineTalk({
  title: '将棋 × エンジニアリング = 世界コンピュータ将棋選手権',
  description: '世界コンピュータ将棋選手権では、決勝の 8 枠に 1 年届かせるだけで精一杯です。0.5 差で決勝を逃した私の 2015 年と、24 大会連続で決勝に残った YSS の話をします。',
  event: { name: 'MOSH Tech Meetup #6', title: 'あなたが好きなこと × エンジニアリング', url: 'https://mosh.connpass.com/event/406478/' },
  speaker: '山本 一将',
  affiliation: 'MOSH株式会社',
  public: true,
  // 画面の右下に状態の番号を置くので、テーマの枠 (右下の話者名) は外す
  theme: { ...hokuchi, Frame: () => null },
  scenes: [shogi],
})
