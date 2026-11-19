// 作品の会話で Claude を動かす。claude -p をリポジトリで起こし (スキルと CLAUDE.md を読ませる)、
// stream-json を 1 行ずつ読んで、文字の差分・使った道具・終わりを知らせる。
// 作品ごとに Claude のセッションを 1 本持ち、2 回目からは --resume で続きから話す。
//
// 権限はプロンプトではなく引数で止める。話者のユーザー設定 (包括 allow) は読ませず (--setting-sources)、
// 許したもの以外は拒む (--permission-mode dontAsk)。書けるのは作品の置き場だけ、Bash は決まった形だけ。
// この組み合わせでも、話者の CLAUDE.md とリポジトリのスキルは読み込まれる (claude -p で試して確かめた)
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { CLAUDE_BIN, MODEL, PRIVATE, repoRoot } from '../infra/config.ts'

export type RunEvent =
  | { type: 'started'; sessionId: string }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; summary: string }
  | { type: 'done'; text: string; costUsd: number; sessionId: string }
  | { type: 'failed'; message: string; stopped: boolean }

export type RunOptions = {
  prompt: string
  /** 続きから話すセッション。無ければ新しく作る */
  sessionId?: string | null
  /** 作品のことを Claude に伝える文。--append-system-prompt に渡す */
  system: string
  /** 書いてよいディレクトリとファイル (絶対パス)。ディレクトリは末尾を / にする */
  writable: string[]
  /** writable の中でも書かせない場所 (確定した構成など)。拒否は許可より強い */
  denyWrite?: string[]
  /** 読ませない場所 (絶対パス。ディレクトリは末尾を / にする)。スライドを作る段で、他のトークの見た目に寄らないようにする */
  denyRead?: string[]
  onEvent: (e: RunEvent) => void
}

export type Run = { stop: () => void; done: Promise<void> }

export const RUN_LIMIT_MS = Number(process.env.HOKUCHI_RUN_LIMIT_MS ?? 60 * 60_000)
export const STALL_LIMIT_MS = Number(process.env.HOKUCHI_STALL_LIMIT_MS ?? 15 * 60_000)

/** 書き込み以外で Claude が使える道具。読む・探す・Web・サブエージェント・スキルと、決まった形のコマンド */
export const ALLOWED_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'Skill',
  'Bash(node tools/notes/cli.mjs lint:*)',
  'Bash(hokuchi-note lint:*)',
  'Bash(bun run check:*)',
  'Bash(node packages/stage/cli.mjs check:*)',
  'Bash(node .claude/skills/crafting-presentation/scripts/wave.mjs:*)',
  'Bash(node .claude/skills/crafting-presentation/scripts/rehearse.mjs:*)',
  'Bash(bun run typecheck)',
  'Bash(node apps/studio/scripts/check-yaml.mjs:*)',
  'Bash(bun run eyecatch:*)',
]

/** 許していないので使えないが、念のため名前でも拒む。外に出す操作は話者が画面で押したときだけサーバが行う */
export const DENIED_TOOLS = ['Bash(bun run deploy:*)', 'Bash(bun run look:*)', 'Bash(node packages/stage/cli.mjs look:*)', 'Bash(git push:*)', 'Bash(git commit:*)', 'Bash(git reset:*)', 'Bash(rm:*)', 'Bash(bunx wrangler:*)', 'Bash(npx wrangler:*)']

/** 書いてよい場所を、Edit の許可の形にする。絶対パスは // で始める。
 *  ファイルの権限は Edit の規則が書き込み全般 (Write も) を受け持つ。Write(...) の規則は照合されない (Claude Code がそう警告する) */
export function writeRules(writable: string[]): string[] {
  return writable.map((p) => `Edit(${p.endsWith('/') ? `/${p}**` : `/${p}`})`)
}

/** 読ませない場所を、Read の拒否の形にする。Read の規則は Grep と Glob にも効く */
export function readRules(paths: string[]): string[] {
  return paths.map((p) => `Read(${p.endsWith('/') ? `/${p}**` : `/${p}`})`)
}

/** claude -p に渡す引数。テストで固定する */
export function claudeArgs({ prompt, sessionId, system, writable, denyWrite = [], denyRead = [] }: Omit<RunOptions, 'onEvent'>, session: string): string[] {
  return [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    MODEL,
    '--setting-sources',
    'project',
    '--permission-mode',
    'dontAsk',
    '--add-dir',
    PRIVATE,
    '--allowedTools',
    ...ALLOWED_TOOLS,
    ...writeRules(writable),
    '--disallowedTools',
    ...DENIED_TOOLS,
    ...writeRules(denyWrite),
    ...readRules(denyRead),
    '--append-system-prompt',
    system,
    ...(sessionId ? ['--resume', sessionId] : ['--session-id', session]),
  ]
}

/** 道具の呼び出しを、会話に出す 1 行にする */
function summarize(name: string, input: any): string {
  const path = (p: string | undefined) => (p ? p.replace(repoRoot + '/', '').replace(PRIVATE + '/', '') : '')
  switch (name) {
    case 'Read':
      return `${path(input?.file_path)} を読んでいます`
    case 'Edit':
    case 'Write':
      return `${path(input?.file_path)} を書いています`
    case 'Glob':
    case 'Grep':
      return `${input?.pattern ?? ''} を探しています`
    case 'WebFetch':
      return `${input?.url ?? 'Web'} を読んでいます`
    case 'WebSearch':
      return `「${input?.query ?? ''}」を調べています`
    case 'Bash':
      return `${String(input?.command ?? '').slice(0, 80)} を動かしています`
    case 'Task':
      return `${input?.description ?? 'サブエージェント'} を頼んでいます`
    case 'Skill':
      return `スキル ${input?.skill ?? input?.command ?? ''} を読んでいます`
    default:
      return `${name} を使っています`
  }
}

/** Claude の実行に渡す環境変数。デプロイと GitHub の認証情報は外す (権限は隔離ではないため) */
export function runEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '0' }
  for (const k of Object.keys(env)) if (/^(CLOUDFLARE_|WRANGLER_|CF_)|^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|NPM_TOKEN)$|^CLAUDECODE$/.test(k)) delete env[k]
  return env
}

export function startRun(opts: RunOptions): Run {
  const { sessionId, onEvent } = opts
  const session = sessionId ?? randomUUID()
  const args = claudeArgs(opts, session)
  let child: ChildProcess
  let stopped = false
  let timedOut: string | null = null
  let finished = false
  let lastOutput = Date.now()
  const started = Date.now()
  let text = ''
  let buf = ''
  let err = ''
  const done = new Promise<void>((resolve) => {
    child = spawn(CLAUDE_BIN, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: runEnv() })
    onEvent({ type: 'started', sessionId: session })
    const finish = (e: RunEvent) => {
      if (finished) return
      finished = true
      onEvent(e)
    }
    // 1 回の実行は 60 分まで。出力が 15 分途切れたら止まったとみなす (RUN_LIMIT_MS・STALL_LIMIT_MS)
    const watchdog = setInterval(() => {
      const now = Date.now()
      if (now - started > RUN_LIMIT_MS) timedOut = `${RUN_LIMIT_MS / 60_000} 分たっても終わらなかったので止めました`
      else if (now - lastOutput > STALL_LIMIT_MS) timedOut = `${STALL_LIMIT_MS / 60_000} 分間なにも返ってこなかったので止めました`
      if (timedOut) {
        clearInterval(watchdog)
        child.kill('SIGINT')
        setTimeout(() => !finished && child.kill('SIGKILL'), 3000)
      }
    }, Math.min(5000, STALL_LIMIT_MS / 2))
    child.on('close', () => clearInterval(watchdog))
    child.stdout!.on('data', (d) => {
      lastOutput = Date.now()
      buf += d
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('{')) continue
        let m: any
        try {
          m = JSON.parse(line)
        } catch {
          continue
        }
        if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') {
          text += m.event.delta.text
          onEvent({ type: 'delta', text: m.event.delta.text })
        } else if (m.type === 'stream_event' && m.event?.type === 'message_start' && text && !text.endsWith('\n\n')) {
          // 道具を使ったあとの次の返事は、段落を分けて続ける
          text += '\n\n'
          onEvent({ type: 'delta', text: '\n\n' })
        } else if (m.type === 'assistant') {
          for (const c of m.message?.content ?? []) if (c.type === 'tool_use') onEvent({ type: 'tool', name: c.name, summary: summarize(c.name, c.input) })
        } else if (m.type === 'result') {
          if (m.is_error || m.subtype !== 'success') finish({ type: 'failed', message: String(m.result ?? m.subtype ?? 'Claude の実行が失敗しました'), stopped })
          else finish({ type: 'done', text: String(m.result ?? text).trim() || text.trim(), costUsd: Number(m.total_cost_usd ?? 0), sessionId: m.session_id ?? session })
        }
      }
    })
    child.stderr!.on('data', (d) => (err += d))
    child.on('error', (e) => {
      finish({ type: 'failed', message: `claude を起動できませんでした (${e.message})`, stopped })
      resolve()
    })
    child.on('close', (code) => {
      if (timedOut) finish({ type: 'failed', message: timedOut, stopped: true })
      else if (stopped) finish({ type: 'failed', message: '止めました', stopped: true })
      else finish({ type: 'failed', message: `Claude が途中で終わりました (終了コード ${code})${err ? `: ${err.trim().split('\n').slice(-3).join(' ')}` : ''}`, stopped: false })
      resolve()
    })
  })
  return {
    stop: () => {
      if (finished) return
      stopped = true
      child.kill('SIGINT')
      setTimeout(() => !finished && child.kill('SIGKILL'), 3000)
    },
    done,
  }
}
