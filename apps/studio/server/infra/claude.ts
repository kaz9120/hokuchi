// 聴衆役のように、道具を使わずに答えだけを返してほしいときに Claude を 1 回呼ぶ (claude -p)。
// 答えの中の JSON を取り出して返す。会話の実行と同じく、話者の設定は読ませず、道具は許さず、認証情報を外した環境で起こす
import { spawn } from 'node:child_process'
import { CLAUDE_BIN } from './config.ts'
import { runEnv } from '../claude/runner.ts'

export function askClaude(prompt: string, { cwd, label = 'Claude', timeoutMs = 10 * 60_000, onCost }: { cwd: string; label?: string; timeoutMs?: number; onCost?: (usd: number) => void }): Promise<any> {
  return new Promise((ok, ng) => {
    const args = ['-p', '--output-format', 'json', '--setting-sources', 'project', '--permission-mode', 'dontAsk']
    const p = spawn(CLAUDE_BIN, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: runEnv() })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      p.kill('SIGTERM')
      ng(new Error(`${label}: ${Math.round(timeoutMs / 60_000)} 分たっても答えが返りませんでした`))
    }, timeoutMs)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => {
      clearTimeout(timer)
      ng(new Error(`${label}: claude を起動できませんでした (${e.message})`))
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      try {
        const res = JSON.parse(out)
        onCost?.(Number(res.total_cost_usd ?? 0))
        const result: string = res.result ?? ''
        ok(JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)))
      } catch (e) {
        ng(new Error(`${label}: Claude の答えを読めませんでした (${code}): ${err || out.slice(0, 300) || (e as Error).message}`))
      }
    })
    p.stdin.end(prompt)
  })
}
