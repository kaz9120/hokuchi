// フォルダを Finder で開く (macOS だけ)。HOKUCHI_NO_OPEN があれば開かない (テストで Finder を開かないため)
import { spawn } from 'node:child_process'

export function reveal(dir: string) {
  if (process.platform !== 'darwin' || process.env.HOKUCHI_NO_OPEN) return
  spawn('open', [dir], { stdio: 'ignore' }).on('error', () => {})
}
