// 原稿の置き場の名前 (slug) を、企画のタイトルから決める (rebuild.md 6 章。話者に slug を聞かない)。
// かなはヘボン式のローマ字に、英数字はそのまま小文字にし、漢字などは落とす。短すぎれば日付の名前にする
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
