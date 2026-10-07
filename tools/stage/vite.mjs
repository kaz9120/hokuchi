// トーク 1 本を、tools/stage/app の殻に差し込んで動かす Vite 設定
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { parseStoryboard } from './storyboard.mjs'

// 開発中は Google Fonts を読む。公開用のビルドでは、使った文字だけを切り出したフォントに差し替える (fonts.mjs)
const GOOGLE_FONTS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=LINE+Seed+JP:wght@400;700;800&family=Noto+Sans+JP:wght@400;600;700;800&family=Nunito:wght@400;600;700;800&display=block" rel="stylesheet" />',
].join('\n    ')

export const stageDir = import.meta.dirname
export const repoRoot = resolve(stageDir, '../..')

/**
 * 'virtual:talk' をトークの talk.tsx に向け、絵コンテ (storyboard.md) のノートを流し込む。
 * meta はビルド時に <head> へ差し込む
 */
function talkPlugin(talkDir, meta, fonts) {
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
    transformIndexHtml: (html) => html.replace('<!--stage:meta-->', meta ?? '').replace('<!--stage:fonts-->', fonts ?? GOOGLE_FONTS),
  }
}

export function stageConfig(talkDir, { outDir, meta, fonts, port } = {}) {
  return {
    configFile: false,
    root: resolve(stageDir, 'app'),
    base: './',
    logLevel: 'warn',
    plugins: [react(), talkPlugin(talkDir, meta, fonts)],
    resolve: {
      alias: [{ find: /^@hokuchi\/stage/, replacement: resolve(stageDir, 'src') }],
      // トークは tools/stage の外にあるので、依存はすべて tools/stage の node_modules から解決する
      dedupe: ['react', 'react-dom', 'motion'],
    },
    server: { port: port ?? 5280, strictPort: false, fs: { allow: [repoRoot] } },
    build: { outDir, emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 2000 },
  }
}
