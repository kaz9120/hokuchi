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

/** URL からクエリを外し、拡張子付きのファイル名を作る。 */
function fileNameOf(url) {
  const { pathname } = new URL(url);
  const base = path.basename(pathname) || 'image';
  return base.replace(/[^\w.-]/g, '_');
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
