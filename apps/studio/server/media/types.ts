// 媒体の部品 (rebuild.md 4.3)。発表と記事は同じ流れを通り、違うところだけをこの部品に寄せる。
// 部品が持つのは、中身の読み書き・単位と位置・聴衆役に渡す文とアンケート・公開の依頼文・縮小画像だけ。
// kind の分岐は media/index.ts の選び分けの 1 か所だけにする
import type { Anchor, DraftSummary, Kind, MetaEdit, NoteBody, OutlineOp, PasteText, SurveyItem, TalkBody, TalkSummary, Thread, TitleEdit, UnitEdit } from '../../shared/api.ts'
import type { AnchorFields } from '../domain/threads.ts'
import type { ReadPlan } from '../domain/reads.ts'
import type { TrashItem } from '../domain/trash.ts'
import type { WorkRef } from '../domain/work.ts'

export type Media = {
  kind: Kind
  /** 依頼文と AI への説明で使う言葉 */
  words: { work: string; oneLiner: string; audience: string }
  /** feedback.yaml・readers.yaml を新しく作るときの頭書き */
  threadsHeader: string
  readersHeader: string
  survey: SurveyItem[]

  /** 指摘・読み手・読みを置くディレクトリ。中身が無ければ null */
  home: (ref: WorkRef) => string | null
  /** 作品を開いているあいだ監視するディレクトリ */
  watchDirs: (ref: WorkRef) => string[]
  /** 画面に渡す中身 */
  body: (ref: WorkRef, ctx: { thumbsVersion: number }) => Promise<TalkBody | NoteBody | null>
  /** 中身のタイトル (rebuild.md 4.2 の正)。中身が無ければ null */
  bodyTitle: (ref: WorkRef) => string | null
  /** 伝えたいことが企画に無いとき、中身から読む値 */
  oneLinerFromBody: (ref: WorkRef) => string
  /** 中身のタイトルを直す。中身が無ければ false (企画シートの title を直す) */
  setTitle: (ref: WorkRef, edit: TitleEdit) => Promise<boolean>
  /** 単位 (コマの話すこと・段落) を直す */
  editUnit: (ref: WorkRef, unit: string, edit: UnitEdit) => void
  appendUnit: (ref: WorkRef, text: string) => void
  /** 下書きの全体 (流れ・構成) を直す */
  editOutline: (ref: WorkRef, op: OutlineOp) => void
  editMeta: (ref: WorkRef, edit: MetaEdit) => void
  /** 画面が送った位置を、feedback.yaml の位置の欄にする */
  anchor: (ref: WorkRef, at: Anchor) => AnchorFields
  /** 聴衆役の感想から、feedback.yaml の位置の欄を取り出す */
  anchorOfNote: (note: any) => AnchorFields
  /** 中身を見せる前の後始末 (記事は、ずれた指摘を書き出しで付け直す) */
  beforeView: (ref: WorkRef) => void
  readPlan: (ref: WorkRef) => ReadPlan
  /** Claude に頼むときに渡す原稿 (記事のタイトルの案) */
  draftForAsk: (ref: WorkRef) => string | null
  /** Claude に渡す指摘の依頼文 */
  handoff: (ref: WorkRef, threads: Thread[]) => string
  /** 削除のときにごみ箱へ移すもの (リポジトリの外のものだけ)。移す前の後始末も */
  trashItems: (ref: WorkRef) => TrashItem[]
  beforeTrash: (ref: WorkRef) => Promise<void>
  /** 削除しても残る、リポジトリの中のファイル */
  repoFiles: (ref: WorkRef) => string[]
  paste: (ref: WorkRef) => PasteText
  openAssets: (ref: WorkRef) => void
  assetFile: (ref: WorkRef, rel: string) => string | null
  /** ホームのカードに出す、中身の様子 */
  summary: (ref: WorkRef) => { talk: TalkSummary | null; draft: DraftSummary | null; cover: string | null; date: string | null; event: string | null; tags: string[] }
}
