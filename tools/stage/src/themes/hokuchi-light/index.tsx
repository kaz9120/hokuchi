// hokuchi テーマのライト版 (夜明け)。明るい会場やスクリーンが暗いときに使う
import type { Theme } from '../../runtime/types'
import { hokuchi } from '../hokuchi'
import './hokuchi-light.css'

export const hokuchiLight: Theme = {
  ...hokuchi,
  name: 'hokuchi-light',
  className: 'theme-hokuchi-light',
}
