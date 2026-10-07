// トーク 1 本を、tools/stage/app の殻に差し込んで動かす Vite 設定
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export const stageDir = import.meta.dirname
export const repoRoot = resolve(stageDir, '../..')

/** 'virtual:talk' をトークの talk.tsx に向ける。meta はビルド時に <head> へ差し込む */
function talkPlugin(talkFile, meta) {
  return {
    name: 'hokuchi-stage-talk',
    resolveId: (id) => (id === 'virtual:talk' ? '\0virtual:talk' : null),
    load: (id) => (id === '\0virtual:talk' ? `export { default } from ${JSON.stringify(talkFile)}` : null),
    transformIndexHtml: (html) => html.replace('<!--stage:meta-->', meta ?? ''),
  }
}

export function stageConfig(talkDir, { outDir, meta, port } = {}) {
  return {
    configFile: false,
    root: resolve(stageDir, 'app'),
    base: './',
    logLevel: 'warn',
    plugins: [react(), talkPlugin(resolve(talkDir, 'talk.tsx'), meta)],
    resolve: {
      alias: [{ find: /^@hokuchi\/stage/, replacement: resolve(stageDir, 'src') }],
      // トークは tools/stage の外にあるので、依存はすべて tools/stage の node_modules から解決する
      dedupe: ['react', 'react-dom', 'motion'],
    },
    server: { port: port ?? 5280, strictPort: false, fs: { allow: [repoRoot] } },
    build: { outDir, emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 2000 },
  }
}
