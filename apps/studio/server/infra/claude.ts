// ローカルの Claude Code を、非対話で 1 回呼ぶ (claude -p)。答えの中の JSON を取り出して返す。
// 話者がログインしている Claude Code をそのまま使う
import { spawn } from 'node:child_process'

export function askClaude(prompt: string, { cwd, label = 'Claude', timeoutMs = 10 * 60_000 }: { cwd: string; label?: string; timeoutMs?: number }): Promise<any> {
  return new Promise((ok, ng) => {
    const p = spawn('claude', ['-p', '--output-format', 'json'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
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
        const result: string = JSON.parse(out).result ?? ''
        ok(JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)))
      } catch (e) {
        ng(new Error(`${label}: Claude の答えを読めませんでした (${code}): ${err || out.slice(0, 300) || (e as Error).message}`))
      }
    })
    p.stdin.end(prompt)
  })
}
