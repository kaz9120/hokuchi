// ディレクトリの監視。変わったファイルの名前をまとめて、少し待ってから知らせる
import { existsSync, watch, type FSWatcher } from 'node:fs'

export type Watch = { close: () => void }

export function watchDir(dir: string, onChange: (files: string[]) => void, { wait = 150, recursive = true } = {}): Watch {
  if (!existsSync(dir)) return { close: () => {} }
  let timer: NodeJS.Timeout | undefined
  const files = new Set<string>()
  let w: FSWatcher | null = null
  try {
    w = watch(dir, { recursive }, (_, file) => {
      files.add(String(file ?? ''))
      clearTimeout(timer)
      timer = setTimeout(() => {
        const list = [...files]
        files.clear()
        onChange(list)
      }, wait)
    })
    // 監視しているディレクトリが消えた (ごみ箱に移したなど) ときは、黙って止める
    w.on('error', () => w?.close())
  } catch {}
  return {
    close: () => {
      clearTimeout(timer)
      w?.close()
    },
  }
}
