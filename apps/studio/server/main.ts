#!/usr/bin/env node
// hokuchi studio。発表と記事を、ネタから出すまで Claude と作るローカルの制作アプリ。
//
//   bun run studio    http://localhost:5300/
//
// 同じプロセスの中で、サイト全体の開発サーバ (http://localhost:5280/) も立てる。発表の絵と再生はそこから描く。
// ログイン時に常駐させるときは scripts/install-launchd.sh を使う
import { createServer as createHttpServer } from 'node:http'
import { join } from 'node:path'
import { createServer as createViteServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { PORT, places, studioDir } from './infra/config.ts'
import { closeAll, publish } from './infra/events.ts'
import { startInfra, stopInfra } from './infra/site.ts'
import { watchDir } from './infra/watch.ts'
import { Studio } from './flow/service.ts'
import { routes } from './http/routes.ts'
import { Sessions } from './http/sessions.ts'
import { migrate } from './store/migrate.ts'

let site
try {
  site = await startInfra()
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}

const migrated = migrate()
if (migrated.length) console.log(`  企画シートから移した作品: ${migrated.join(', ')}`)

let sessions: Sessions
const studio = new Studio((id) => {
  if (id === 'home') publish('home', 'home', {})
  else sessions?.push(id)
})
sessions = new Sessions(studio)
studio.recover()

const server = createHttpServer()
const ui = await createViteServer({
  configFile: false,
  root: join(studioDir, 'ui'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': join(studioDir, 'ui') } },
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: { server }, fs: { allow: [studioDir, join(studioDir, '../../node_modules')] } },
  appType: 'spa',
})
const api = routes(studio, sessions)

// ホームは、作品とネタの置き場が変わったら知らせる
let homeTimer: NodeJS.Timeout | undefined
const homeWatches = [places.works, places.neta, places.archive].map((dir) =>
  watchDir(
    dir,
    () => {
      clearTimeout(homeTimer)
      homeTimer = setTimeout(() => publish('home', 'home', {}), 300)
    },
    { wait: 300 },
  ),
)

server.on('request', async (req, res) => {
  if (await api.handle(req, res)) return
  ui.middlewares(req, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  hokuchi studio   http://localhost:${PORT}/`)
  console.log(`  サイト           ${site.url}/  (studio の中で立てています)\n`)
})

const shutdown = async () => {
  for (const w of homeWatches) w.close()
  await studio.conductor.stopAll()
  closeAll()
  sessions.closeAll()
  await ui.close()
  await stopInfra()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
