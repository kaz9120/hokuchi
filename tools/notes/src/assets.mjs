// assets.mjs — 記事の画像をローカルに落とす。
//
// note の画像 URL (assets.st-note.com) は記事を消せば消える。アーカイブとして
// 成立させるには実体を持つ必要があるので、見出し画像も本文画像もすべて
// <記事>/assets/ に落として相対パスで参照する。

import fs from 'node:fs';
import path from 'node:path';

const UA = 'hokuchi-note/0.1 (+https://github.com/; personal archive)';

const EXT_BY_TYPE = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
};

/**
 * 画像バイト列から形式と寸法を読む。ヘッダだけ見れば足りるので依存は足さない。
 * 画像として読めなければ null を返す (壊れたファイルの検出に使う)。
 */
export function imageInfo(buf) {
  if (buf.length > 24 && buf.toString('binary', 0, 4) === '\x89PNG') {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      // SOF0-SOF15 のうち DHT / JPG / DAC を除いたものがフレームヘッダ
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { format: 'jpg', width: null, height: null };
  }
  if (buf.length > 6 && buf.toString('binary', 0, 4) === 'GIF8') {
    return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length > 12 && buf.toString('binary', 0, 4) === 'RIFF' && buf.toString('binary', 8, 12) === 'WEBP') {
    return { format: 'webp', width: null, height: null };
  }
  return null;
}

/** URL からクエリを外し、拡張子付きのファイル名を作る。 */
function fileNameOf(url) {
  const { pathname } = new URL(url);
  const base = path.basename(pathname) || 'image';
  return base.replace(/[^\w.-]/g, '_');
}

/**
 * 見出し画像を保存する。
 *
 * note の eyecatch URL は配信用に縮小・再圧縮された版 (?fit=bounds&quality=85
 * &width=1280) を指す。アーカイブにはオリジナルを残したいので、クエリを外した
 * URL を先に試し、駄目なら元の URL に戻る。
 */
export async function downloadEyecatch(url, assetsDir) {
  const bare = url.split('?')[0];
  try {
    return await downloadImage(bare, assetsDir);
  } catch {
    return downloadImage(url, assetsDir);
  }
}

/**
 * 画像を assets ディレクトリへ保存し、記事から見た相対パスを返す。
 * 既に同名で存在すれば取得しない (再実行が安いこと優先)。
 */
export async function downloadImage(url, assetsDir, { rename = null } = {}) {
  let name = rename ?? fileNameOf(url);
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(name);

  if (hasExt) {
    const dest = path.join(assetsDir, name);
    if (fs.existsSync(dest)) return `assets/${name}`;
  }

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());

  if (!hasExt) {
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    name += EXT_BY_TYPE[type] ?? '.bin';
  }

  fs.mkdirSync(assetsDir, { recursive: true });
  const dest = path.join(assetsDir, name);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
  return `assets/${name}`;
}
