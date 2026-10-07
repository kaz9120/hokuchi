// studio のチャットの相手。ローカルの Claude Code を非対話モードで常駐させ、ストリームで会話する。
// 話者がログインしている Claude Code をそのまま使う。会話は session id で続きから再開できる。
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// studio の中で、確認なしに許可する操作。ファイルの編集と、検査・型検査・粗密の確認
const ALLOWED = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(bun run check:*)', 'Bash(bun run typecheck)', 'Bash(node .claude/skills/crafting-presentation/scripts/wave.mjs:*)']

function systemPrompt(repoRoot, talkDir) {
  const rel = relative(repoRoot, talkDir)
  return [
    'あなたは hokuchi の制作アプリ (studio) の中で、話者と一緒に発表資料を作っています。',
    `対象のトークは ${rel} です。crafting-presentation スキルの進め方と references に従ってください。`,
    '話者は studio の画面で、絵コンテのボード (章・シーン・状態のカード)、各状態の描画、プレビューを見ています。',
    'メッセージの先頭に [選択: <scene-id> の状態 <n>「<画面の説明>」] が付いていたら、その状態についての発言です。',
    '構成や言葉の変更は storyboard.md を先に直し、実装 (scenes/*.tsx) を追従させてください。',
    '直したら bun run check <トークのディレクトリ> で確かめてください。studio はファイルの変更を監視して、描画を自動で撮り直します。',
    '返答は話者の会話の文体で、短く書いてください。',
  ].join('\n')
}

export class ClaudeSession {
  constructor({ repoRoot, talkDir, onEvent }) {
    this.repoRoot = repoRoot
    this.talkDir = talkDir
    this.onEvent = onEvent
    this.sessionFile = join(talkDir, 'out', 'studio-session.txt')
    this.transcript = []
    this.busy = false
    this.proc = null
  }

  start() {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    args.push('--permission-mode', 'acceptEdits', '--allowedTools', ...ALLOWED)
    args.push('--append-system-prompt', systemPrompt(this.repoRoot, this.talkDir))
    if (existsSync(this.sessionFile)) args.push('--resume', readFileSync(this.sessionFile, 'utf8').trim())
    this.proc = spawn('claude', args, { cwd: this.repoRoot, stdio: ['pipe', 'pipe', 'pipe'] })
    let buf = ''
    this.proc.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (line.trim()) this.handle(JSON.parse(line))
      }
    })
    this.proc.stderr.on('data', (d) => {
      const text = String(d).trim()
      // 権限モードについての注意は、許可するツールを明示しているので表示しない
      if (!text || text.includes('Permission mode forced')) return
      this.emit({ kind: 'error', text })
    })
    this.proc.on('close', (code) => {
      this.proc = null
      this.busy = false
      this.emit({ kind: 'closed', text: `Claude Code が終了しました (${code})。次のメッセージで起動し直します` })
    })
  }

  handle(e) {
    if (e.type === 'system' && e.subtype === 'init') {
      writeFileSync(this.sessionFile, e.session_id)
    } else if (e.type === 'stream_event' && e.event?.type === 'content_block_delta' && e.event.delta?.type === 'text_delta') {
      this.emit({ kind: 'delta', text: e.event.delta.text })
    } else if (e.type === 'assistant') {
      for (const block of e.message.content ?? []) {
        if (block.type === 'text') this.emit({ kind: 'text', text: block.text })
        if (block.type === 'tool_use') this.emit({ kind: 'tool', text: describeTool(block, this.repoRoot) })
      }
    } else if (e.type === 'result') {
      this.busy = false
      this.emit({ kind: 'done', text: e.subtype === 'success' ? '' : `終了: ${e.subtype}` })
    }
  }

  emit(ev) {
    // 文字の差分は記録に残さず、確定した文 (text) だけを残す
    if (ev.kind !== 'delta') this.transcript.push(ev)
    this.onEvent({ ...ev, busy: this.busy })
  }

  send(text) {
    if (!this.proc) this.start()
    this.busy = true
    this.emit({ kind: 'user', text })
    this.proc.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n')
  }

  stop() {
    this.proc?.kill()
  }
}

function describeTool(block, repoRoot) {
  const i = block.input ?? {}
  const file = i.file_path ? relative(repoRoot, i.file_path) : ''
  switch (block.name) {
    case 'Read':
      return `読む ${file}`
    case 'Edit':
    case 'Write':
      return `直す ${file}`
    case 'Bash':
      return `実行 ${i.command}`
    case 'Glob':
    case 'Grep':
      return `探す ${i.pattern ?? ''}`
    default:
      return block.name
  }
}
