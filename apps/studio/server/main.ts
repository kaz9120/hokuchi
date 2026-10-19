#!/usr/bin/env node
// hokuchi studio。発表と記事を、企画から公開まで作るローカルの制作アプリ (ADR-0035・ADR-0049)。
//
//   bun run studio           ホーム (http://localhost:5300/)
//   bun run studio <talk>    同じものを立て、そのトークの作品の画面の URL を出す
//
// 同じプロセスの中で、サイト全体の開発サーバ (http://localhost:5280/) も立てる。プレビューはそこから描く。
// 長く動くので、別ターミナルで立てる。構造は apps/studio/docs/rebuild.md 5 章
import { createServer as createHttpServer } from 'node:http'
import { join, resolve as resolvePath } from 'node:path'
import { createServer as createViteServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PORT, studioDir } from './infra/config.ts'
import { closeAll } from './infra/events.ts'
import { startInfra, stopInfra } from './infra/site.ts'
import { closeAllSessions, watchHome } from './domain/sessions.ts'
import { routes } from './http/routes.ts'

let site
try {
  site = await startInfra()
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}

const server = createHttpServer()
// 画面の HMR は、studio の http サーバに相乗りする
const ui = await createViteServer({
  configFile: false,
  root: join(studioDir, 'ui'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': join(studioDir, 'ui') } },
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: { server }, fs: { allow: [studioDir] } },
  appType: 'spa',
})
const api = routes()
const home = watchHome()

server.on('request', async (req, res) => {
  if (await api.handle(req, res)) return
  ui.middlewares(req, res)
})

// 引数でトークを指定したら、その作品の画面の URL を出す
const arg = process.argv[2]
const picked = arg ? [...site.talks.entries()].find(([slug, t]) => slug === arg || t.info.name.startsWith(arg) || t.dir === resolvePath(process.cwd(), arg)) : null
if (arg && !picked) console.warn(`「${arg}」に当たるトークがありません。ホームから選んでください`)

server.listen(PORT, () => {
  console.log(`\n  hokuchi studio   http://localhost:${PORT}/`)
  if (picked) console.log(`  作品の画面       http://localhost:${PORT}/talks/${picked[0]}`)
  console.log(`  サイト           ${site.url}/  (studio の中で立てています)\n`)
})

const shutdown = async () => {
  home.close()
  closeAll()
  await closeAllSessions()
  await ui.close()
  await stopInfra()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
