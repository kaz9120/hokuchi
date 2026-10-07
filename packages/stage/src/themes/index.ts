// テーマの一覧。開発サーバで ?theme=<名前> を付けると、トークのテーマを差し替えて見比べられる
import type { Theme } from '../runtime/types'

export const themes: Record<string, () => Promise<Theme>> = {
  mosh: () => import('./mosh').then((m) => m.mosh),
  hokuchi: () => import('./hokuchi').then((m) => m.hokuchi),
  'hokuchi-light': () => import('./hokuchi-light').then((m) => m.hokuchiLight),
}
