// 作品の状態の表。進み具合・公開範囲・改稿中から、画面の 1 語と押せる操作を導く。
// 判定はここだけに置き、画面は結果を表示するだけにする。サーバも、ここで押せない操作は断る。
//
//   状態     条件                                  押せる操作
//   下書き   公開でない・finishedAt が無い          完成にする・削除 (企画シートがあるとき)
//   完成     公開でない・finishedAt がある          下書きに戻す・公開の手順
//   公開     サイトに載る・アーカイブにある          改稿する (記事)
//   改稿中   公開で、改稿の原稿がある                改稿をやめる
//
// データは 2 つの軸 (進み具合・公開範囲) のまま。公開範囲は実物から決め、企画シートには書かない
import type { Action, Kind, StateWord, WorkState } from '../../shared/api.ts'

export type StateFacts = {
  kind: Kind
  hasBrief: boolean
  /** サイトに載る発表 (talks/ の public: true)、アーカイブにある記事 */
  published: boolean
  /** 企画シートに finishedAt がある */
  finished: boolean
  /** 公開済みの記事に、改稿の原稿がある */
  revising: boolean
  /** 中身 (発表のトーク・記事の原稿かアーカイブ) がある */
  hasBody: boolean
  /** リポジトリの外 (非公開の置き場) のトーク */
  outside: boolean
  /** 企画の「資料を公開しますか」(発表の段階 1) */
  publishIntent?: string
}

export function deriveState(f: StateFacts): WorkState {
  const word: StateWord = f.published ? (f.revising ? '改稿中' : '公開') : f.finished ? '完成' : '下書き'
  const actions: Action[] =
    word === '下書き' ? (f.hasBrief ? ['finish', 'delete'] : [])
    : word === '完成' ? ['unfinish', 'publish-howto']
    : word === '公開' ? (f.kind === 'note' ? ['revise'] : [])
    : ['cancel-revision']
  const notices: string[] = []
  if (f.kind === 'talk' && f.hasBody) {
    if (f.publishIntent === '公開する' && f.outside && word === '完成') notices.push('企画では「公開する」ですが、発表は公開リポジトリの外に置いてあります。公開するときは talks/ に移します')
    // 社内向けの資料が公開リポジトリに入っているのは、下書きのうちから知らせる
    if (f.publishIntent === '社内向け' && !f.outside) notices.push('企画では「社内向け」ですが、発表は公開リポジトリの talks/ にあります')
  }
  return {
    word,
    label: word === '完成' && f.kind === 'talk' && f.outside ? '完成（社内）' : word,
    progress: word === '下書き' || word === '改稿中' ? 'draft' : 'finished',
    visibility: f.published ? 'public' : 'private',
    revising: word === '改稿中',
    actions,
    notices,
  }
}
