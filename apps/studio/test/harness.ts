// studio をテストのために立てる。置き場 (HOKUCHI_PRIVATE) は一時ディレクトリにし、本物の hokuchi-private には触らない。
// 発表は fixtures/talks/ を置き場の talks/ に写して使う (リポジトリの外のトークとして扱われる)。
// claude は fixtures/fake-claude.cjs を PATH の先頭に置いて差し替える。
// サーバは、作り直しの後 (server/main.ts) があればそれを、無ければ作り直す前 (server.mjs) を立てる
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'

export const studioDir = resolve(import.meta.dirname, '..')
export const repoRoot = resolve(studioDir, '../..')
const fixtures = join(import.meta.dirname, 'fixtures')

export type Studio = {
  url: string
  root: string
  priv: string
  log: string
  claudeLog: string
  talkDirs: { a: string; b: string }
  stop: () => Promise<void>
  serverLog: () => string
}

const freePort = () =>
  new Promise<number>((ok, ng) => {
    const s = createServer()
    s.once('error', ng)
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port
      s.close(() => ok(p))
    })
  })

export async function startStudio(): Promise<Studio> {
  const root = mkdtempSync(join(tmpdir(), 'studio-test-'))
  const priv = join(root, 'private')
  for (const d of ['works', 'seeds', 'notes', 'talks', 'trash']) mkdirSync(join(priv, d), { recursive: true })
  for (const name of readdirSync(join(fixtures, 'talks'))) cpSync(join(fixtures, 'talks', name), join(priv, 'talks', name), { recursive: true })
  const talkNames = readdirSync(join(priv, 'talks')).sort()
  const bin = join(root, 'bin')
  mkdirSync(bin)
  copyFileSync(join(fixtures, 'fake-claude.cjs'), join(bin, 'claude'))
  chmodSync(join(bin, 'claude'), 0o755)
  const [port, sitePort] = [await freePort(), await freePort()]
  const log = join(root, 'server.log')
  const claudeLog = join(root, 'claude.log')

  const rebuilt = existsSync(join(studioDir, 'server/main.ts'))
  const args = rebuilt ? ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', join(studioDir, 'server/main.ts')] : [join(studioDir, 'server.mjs')]
  let out = ''
  const child: ChildProcess = spawn(process.execPath, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOKUCHI_PRIVATE: priv,
      HOKUCHI_STUDIO_PORT: String(port),
      HOKUCHI_SITE_PORT: String(sitePort),
      FAKE_CLAUDE_LOG: claudeLog,
      PATH: `${bin}:${process.env.PATH}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout!.on('data', (d) => (out += d))
  child.stderr!.on('data', (d) => (out += d))
  const url = `http://localhost:${port}`
  const deadline = Date.now() + 120_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`studio が立ち上がりませんでした:\n${out}`)
    try {
      const r = await fetch(`${url}/api/home`)
      if (r.ok) break
    } catch {}
    if (Date.now() > deadline) throw new Error(`studio が 120 秒で立ち上がりませんでした:\n${out}`)
    await sleep(300)
  }
  return {
    url,
    root,
    priv,
    log,
    claudeLog,
    talkDirs: { a: join(priv, 'talks', talkNames[0]), b: join(priv, 'talks', talkNames[1]) },
    serverLog: () => out,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        const until = Date.now() + 15_000
        while (child.exitCode === null && Date.now() < until) await sleep(100)
        if (child.exitCode === null) child.kill('SIGKILL')
      }
      rmSync(root, { recursive: true, force: true })
    },
  }
}

export const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

/** 条件が満たされるまで待つ */
export async function until<T>(fn: () => Promise<T | null | undefined | false> | T | null | undefined | false, ms = 30_000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error('待ちきれませんでした')
    await sleep(200)
  }
}

/** ディレクトリの中身のハッシュ。書き換えていないことを確かめる */
export function treeHash(dir: string): string {
  const h = createHash('sha1')
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else h.update(relative(dir, p)).update(readFileSync(p))
    }
  }
  walk(dir)
  return h.digest('hex')
}
