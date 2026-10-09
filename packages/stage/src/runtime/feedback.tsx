// 開発中だけ出す、画面の要素にメモを付ける道具 (agentation, ADR-0032)。開発サーバが HTML に差し込み、公開用のビルドには入らない
// コピーした Markdown の見出しに URL のハッシュ (#/<scene-id>/<step>) が載るので、どの状態へのメモかが分かる
import talk from 'virtual:talk'
import { MODE } from './config'
import { mountFeedback } from './feedback-toolbar'

// ライブ再生だけに出す。静止画の撮影と、studio のプレビュー (iframe) には出さない
if (MODE === 'live' && window.parent === window) mountFeedback(talk.title)
