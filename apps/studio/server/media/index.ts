// 媒体の部品の選び分け。kind の分岐は、ここの 1 か所だけにする
import type { Kind } from '../../shared/api.ts'
import { note } from './note.ts'
import { talk } from './talk.ts'
import type { Media } from './types.ts'

export const mediaOf = (kind: Kind): Media => (kind === 'talk' ? talk : note)
export type { Media }
