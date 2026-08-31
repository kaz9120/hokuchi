// build.mjs — source.json から index.md を組み立てる。ネットワークは使わない。

import fs from 'node:fs';
import path from 'node:path';
import { parseNote } from './parse.mjs';
import { toMarkdown } from './markdown.mjs';

export const SOURCE = 'source.json';
export const INDEX = 'index.md';

export const readSource = (dir) => JSON.parse(fs.readFileSync(path.join(dir, SOURCE), 'utf8'));

/** アーカイブ配下の記事ディレクトリを公開日順に返す。 */
export function listArticleDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, SOURCE)))
    .map((d) => path.join(root, d.name))
    .sort();
}

/** key → { title, dir } の索引。note 埋め込みのタイトル解決に使う。 */
export function articleIndex(root) {
  const index = new Map();
  for (const dir of listArticleDirs(root)) {
    const src = readSource(dir);
    index.set(src.key, { title: src.name, dir: path.basename(dir) });
  }
  return index;
}

const assetNameOf = (url) => {
  try {
    return path.basename(new URL(url).pathname).replace(/[^\w.-]/g, '_');
  } catch {
    return null;
  }
};

/**
 * 記事 1 本分の index.md を生成して書き出す。
 * @param {string} dir - 記事ディレクトリ
 * @param {Map} index - articleIndex の結果 (note 埋め込みのタイトル解決に使う)
 */
export function buildArticle(dir, index = new Map()) {
  const src = readSource(dir);
  const { blocks } = parseNote(src);
  const assetsDir = path.join(dir, 'assets');
  const have = fs.existsSync(assetsDir) ? new Set(fs.readdirSync(assetsDir)) : new Set();

  for (const block of blocks) {
    if (block.kind === 'image') {
      const name = assetNameOf(block.src);
      if (name && have.has(name)) block.localPath = `assets/${name}`;
    }
    // 自分の他記事への note 埋め込みは、アーカイブ内のタイトルで補える
    if (block.kind === 'embed' && block.service === 'note' && block.identifier) {
      const hit = index.get(block.identifier);
      if (hit) block.title = hit.title;
    }
  }

  const eyecatchName = src.eyecatch ? assetNameOf(src.eyecatch) : null;
  const meta = {
    title: src.name,
    note_key: src.key,
    note_url: src.note_url,
    published_at: src.publish_at,
    eyecatch: eyecatchName && have.has(eyecatchName) ? `assets/${eyecatchName}` : null,
    eyecatch_alt: src.eyecatch_alt || null,
    hashtags: (src.hashtags ?? []).map((h) => h.replace(/^#/, '')),
  };

  const md = toMarkdown(meta, blocks);
  fs.writeFileSync(path.join(dir, INDEX), md);
  return { blocks, md };
}
