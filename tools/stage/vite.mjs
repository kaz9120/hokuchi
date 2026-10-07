// トーク 1 本を、tools/stage/app の殻に差し込んで動かす Vite 設定
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { parseStoryboard } from './storyboard.mjs'

export const stageDir = import.meta.dirname
export const repoRoot = resolve(stageDir, '../..')

/**
 * 'virtual:talk' をトークの talk.tsx に向け、絵コンテ (storyboard.md) のノートを流し込む。
 * meta はビルド時に <head> へ差し込む
 */
function talkPlugin(talkDir, meta) {
  const talkFile = resolve(talkDir, 'talk.tsx')
  const boardFile = resolve(talkDir, 'storyboard.md')
  return {
    name: 'hokuchi-stage-talk',
    resolveId: (id) => (id === 'virtual:talk' || id === 'virtual:storyboard' ? `\0${id}` : null),
    load(id) {
      if (id === '\0virtual:talk')
        return [
          `import talk from ${JSON.stringify(talkFile)}`,
          `import board from 'virtual:storyboard'`,
          `import { withStoryboard } from ${JSON.stringify(resolve(stageDir, 'src/runtime/storyboard.ts'))}`,
          `export default withStoryboard(talk, board)`,
        ].join('\n')
      if (id === '\0virtual:storyboard') {
        if (!existsSync(boardFile)) return 'export default null'
        this.addWatchFile(boardFile)
        return `export default ${JSON.stringify(parseStoryboard(readFileSync(boardFile, 'utf8')))}`
      }
      return null
    },
    handleHotUpdate({ file, server }) {
      if (file !== boardFile) return
      const mod = server.moduleGraph.getModuleById('\0virtual:storyboard')
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
      return []
    },
    transformIndexHtml: (html) => html.replace('<!--stage:meta-->', meta ?? ''),
  }
}

export function stageConfig(talkDir, { outDir, meta, port } = {}) {
  return {
    configFile: false,
    root: resolve(stageDir, 'app'),
    base: './',
    logLevel: 'warn',
    plugins: [react(), talkPlugin(talkDir, meta)],
    resolve: {
      alias: [{ find: /^@hokuchi\/stage/, replacement: resolve(stageDir, 'src') }],
      // トークは tools/stage の外にあるので、依存はすべて tools/stage の node_modules から解決する
      dedupe: ['react', 'react-dom', 'motion'],
    },
    server: { port: port ?? 5280, strictPort: false, fs: { allow: [repoRoot] } },
    build: { outDir, emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 2000 },
  }
}
