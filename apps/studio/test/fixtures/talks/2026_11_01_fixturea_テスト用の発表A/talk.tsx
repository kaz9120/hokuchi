// studio のテスト用の発表。テストが一時ディレクトリの置き場 (HOKUCHI_PRIVATE/talks/) に写して使う
import { Headline, defineScene, defineTalk } from '@hokuchi/stage'
import { hokuchi } from '@hokuchi/stage/themes/hokuchi'

const intro = defineScene({ id: 'intro', steps: 2, Component: () => <Headline>{['はじめに', 'はじめに 2']}</Headline> })
const body = defineScene({ id: 'body', steps: 1, Component: () => <Headline>本題</Headline> })

export default defineTalk({
  title: 'テスト用の発表A',
  description: 'studio のテストのための発表です。',
  event: { name: 'テスト会' },
  speaker: 'テスト',
  affiliation: 'テスト',
  // リポジトリの外に置くので、public: true でも非公開として扱われる (ADR-0041)
  public: true,
  theme: hokuchi,
  scenes: [intro, body],
})
