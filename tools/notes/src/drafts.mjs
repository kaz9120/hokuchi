// drafts.mjs — 原稿の置き場。
//
// 公開前の原稿は、公開リポジトリの外の <HOKUCHI_PRIVATE>/notes/<slug>/ に置く。
// 誤って追跡して GitHub に出る道を、置き場の段階で断つため。HOKUCHI_PRIVATE の既定は
// studio (apps/studio/store.mjs) と同じ ~/Hobby/hokuchi-private。
//
//   <slug>/index.md       原稿 (front matter と本文)
//   <slug>/assets/        画像
//   <slug>/feedback.yaml  指摘のスレッド (studio が読み書きする)
//   <slug>/readers.yaml   聴衆役の読み手。<slug>/reads/ が読みの結果

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PRIVATE = process.env.HOKUCHI_PRIVATE ?? path.join(os.homedir(), 'Hobby', 'hokuchi-private');
export const NOTES_DIR = path.join(PRIVATE, 'notes');

/**
 * 原稿の index.md の場所を決める。引数は、index.md・原稿のディレクトリ・slug のどれでもよい。
 * パスとして見つからず、置き場に同じ名前の原稿があれば slug として読む。
 */
export function resolveDraft(target) {
  const abs = path.resolve(target);
  if (fs.existsSync(abs)) return fs.statSync(abs).isDirectory() ? path.join(abs, 'index.md') : abs;
  const bySlug = path.join(NOTES_DIR, target, 'index.md');
  if (/^[a-z0-9][a-z0-9-]*$/.test(target) && fs.existsSync(bySlug)) return bySlug;
  return abs;
}
