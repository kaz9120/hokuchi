// 原稿の置き場の名前 (slug) を決める (rebuild.md 6 章。話者に slug を聞かない)。
// まず Claude に、企画のタイトルと伝えたいことから短い英語の名前を 1 つ出してもらう (話者の決定 2026-10-20)。
// Claude が失敗・時間切れ・決まりに合わない名前を返したときは、タイトルのかなをローマ字にした名前に落とす
import { tmpdir } from 'node:os'
import { askClaude } from '../infra/claude.ts'

/** 原稿の名前の決まり (半角の英小文字・数字・ハイフン) */
const SLUG = /^[a-z0-9][a-z0-9-]*$/

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
}
const SMALL: Record<string, string> = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' }

/** かなをローマ字にする。カタカナはひらがなに寄せて読む。かな以外は、そのまま返す */
export function romaji(text: string): string {
  const s = [...text.normalize('NFKC')].map((c) => (c >= 'ァ' && c <= 'ヶ' ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const next = s[i + 1]
    if (c === 'っ') {
      const r = BASE[next ?? '']
      if (r) out += r.startsWith('ch') ? 't' : r[0]
      continue
    }
    if (c === 'ー') continue
    const r = BASE[c]
    if (r === undefined) {
      out += c
      continue
    }
    if (next && SMALL[next] && r.endsWith('i')) {
      const stem = r.slice(0, -1)
      out += stem === 'sh' || stem === 'ch' || stem === 'j' ? stem + SMALL[next].slice(1) : stem + SMALL[next]
      i++
      continue
    }
    out += r
  }
  return out
}

/** タイトルから slug を作る。taken は使えない名前 (原稿・アーカイブにあるもの) */
export function slugFromTitle(title: string, taken: (s: string) => boolean, now = new Date()): string {
  let base = romaji(String(title ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-')
    .slice(0, 48)
    .replace(/-+$/, '')
  if (base.length < 3) base = `note-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  let slug = base
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`
  return slug
}

/** Claude に名前を 1 つ出してもらう。使えない名前なら null */
async function slugByClaude(title: string, oneLiner: string, taken: (s: string) => boolean, timeoutMs: number): Promise<string | null> {
  if (!title.trim() && !oneLiner.trim()) return null
  const prompt = [
    'note の記事の原稿の置き場の名前 (slug) を 1 つ決めてください。公開したあとの URL とフォルダの名前になります。',
    '決まり: 半角の英小文字・数字・ハイフンだけ。英単語 2〜5 語をハイフンでつなぐ。30 字以内。記事の中身が分かる短い英語にする。',
    `タイトル: ${title.trim() || '(未定)'}`,
    `伝えたいこと: ${oneLiner.trim() || '(未定)'}`,
    '答えは JSON だけで {"slug": "..."} の形にしてください。',
  ].join('\n')
  try {
    const raw = await askClaude(prompt, { cwd: tmpdir(), label: '原稿の名前', timeoutMs })
    const s = String(raw?.slug ?? '').trim().toLowerCase()
    if (!SLUG.test(s) || s.length > 48) return null
    let slug = s
    for (let n = 2; taken(slug); n++) slug = `${s}-${n}`
    return slug
  } catch {
    return null
  }
}

/** 原稿の名前を決める。Claude に頼み、だめならローマ字に落とす */
export async function decideSlug(title: string, oneLiner: string, taken: (s: string) => boolean, { timeoutMs = 45_000 } = {}): Promise<string> {
  return (await slugByClaude(title, oneLiner, taken, timeoutMs)) ?? slugFromTitle(title, taken)
}
