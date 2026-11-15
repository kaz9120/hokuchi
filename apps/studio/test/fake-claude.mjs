#!/usr/bin/env node
// 偽物の claude。stream-json の形で返し、作品の候補のファイルに決まったものを書く。
// 振る舞いは頼みの文の印で変える: 「#壊す」は候補を YAML として壊す、「#失敗」は途中で終わる、「#待つ」はしばらく黙る
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const prompt = args[args.indexOf('-p') + 1] ?? ''
const system = args[args.indexOf('--append-system-prompt') + 1] ?? ''
const session = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : args[args.indexOf('--session-id') + 1]
const proposals = system.match(/候補を書くファイル: (.+)/)?.[1]
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, prompt, cwd: process.cwd() }) + '\n')
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
out({ type: 'system', subtype: 'init', session_id: session })
if (prompt.includes('#失敗')) process.exit(3)
if (prompt.includes('#待つ')) await new Promise((r) => setTimeout(r, 10_000))
out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '候補を書きました。' } } })
out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: proposals } }] } })
if (proposals) {
  const cur = readFileSync(proposals, 'utf8')
  if (prompt.includes('#壊す')) writeFileSync(proposals, cur + '\ncore: [ {text: 壊れ\n')
  else writeFileSync(proposals, cur + '\ncore:\n  - text: 道具が合うかは、仕事のやり方で変わる\n    note: 案 1\nask: {kind: choose, text: 伝えたいことを選ぶ}\n')
}
out({ type: 'result', subtype: 'success', is_error: false, result: '候補を書きました。', total_cost_usd: 0.01, session_id: session })
