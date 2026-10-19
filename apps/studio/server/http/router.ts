// 小さなルータ。メソッドとパスの型 (":name" と末尾の "*rest") で振り分け、ハンドラの戻り値を JSON で返す。
// 失敗は StudioError の status をそのまま返す。それ以外の例外は 500
import type { IncomingMessage, ServerResponse } from 'node:http'
import { StudioError } from '../infra/errors.ts'

export type Ctx = {
  req: IncomingMessage
  res: ServerResponse
  params: Record<string, string>
  query: URLSearchParams
  body: <T = any>() => Promise<T>
}
/** ハンドラが自分で応答を書いたとき (画像・SSE) に返す印 */
export const HANDLED = Symbol('handled')
type Handler = (c: Ctx) => unknown | Promise<unknown>
type Route = { method: string; re: RegExp; names: string[]; handler: Handler }

export function createRouter() {
  const routes: Route[] = []
  const add = (method: string, pattern: string, handler: Handler) => {
    const names: string[] = []
    const re = new RegExp(
      '^' +
        pattern
          .split('/')
          .map((part) => {
            if (part.startsWith(':')) return names.push(part.slice(1)), '([^/]+)'
            if (part.startsWith('*')) return names.push(part.slice(1)), '(.+)'
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          })
          .join('/') +
        '$',
    )
    routes.push({ method, re, names, handler })
  }
  const r = {
    get: (p: string, h: Handler) => (add('GET', p, h), r),
    post: (p: string, h: Handler) => (add('POST', p, h), r),
    put: (p: string, h: Handler) => (add('PUT', p, h), r),
    patch: (p: string, h: Handler) => (add('PATCH', p, h), r),
    delete: (p: string, h: Handler) => (add('DELETE', p, h), r),
    /** 当たるルートがあれば処理して true を返す */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname
      const hit = routes.find((x) => x.method === req.method && x.re.test(path))
      if (!hit) {
        if (path.startsWith('/api/')) json(res, { error: routes.some((x) => x.re.test(path)) ? `${req.method} はできません` : 'not found' }, routes.some((x) => x.re.test(path)) ? 405 : 404)
        return path.startsWith('/api/')
      }
      const m = path.match(hit.re)!
      const params = Object.fromEntries(hit.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]))
      try {
        const out = await hit.handler({ req, res, params, query: url.searchParams, body: () => readBody(req) })
        if (out !== HANDLED) json(res, out ?? { ok: true })
      } catch (e) {
        if (res.headersSent) return true
        if (e instanceof StudioError) json(res, { error: e.message, ...(e.current !== undefined && { current: e.current }) }, e.status)
        else json(res, { error: String((e as Error).message ?? e) }, 500)
      }
      return true
    },
  }
  return r
}

export function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((ok, ng) => {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => {
      try {
        ok(s ? JSON.parse(s) : {})
      } catch {
        ng(new StudioError(400, '送られた JSON を読めませんでした'))
      }
    })
    req.on('error', ng)
  })
}

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
export function sendFile(res: ServerResponse, body: Buffer, name: string, cache = true) {
  res.writeHead(200, { 'content-type': TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', ...(!cache && { 'cache-control': 'no-store' }) })
  res.end(body)
}
