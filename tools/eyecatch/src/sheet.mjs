// sheet.mjs — 見出し画像を note のプロフィール画面のように 3 列で並べる
//
// 1 枚ずつ見ても、並べたときの動きは分からない。置き場所を決めるときに見る。

import sharp from 'sharp';
import { WIDTH, HEIGHT } from './paper.mjs';

const CELL_W = WIDTH / 2;
const CELL_H = HEIGHT / 2;
const GAP = 24;
const COLS = 3;

export async function sheet(files, output) {
  const rows = Math.ceil(files.length / COLS);
  const tiles = await Promise.all(
    files.map(async (f, i) => ({
      // 1280×670 と違う比率の画像は、中央を切り抜いて揃える
      input: await sharp(f).resize(CELL_W, CELL_H, { fit: 'cover' }).toBuffer(),
      left: GAP + (i % COLS) * (CELL_W + GAP),
      top: GAP + Math.floor(i / COLS) * (CELL_H + GAP),
    })),
  );
  await sharp({
    create: {
      width: COLS * CELL_W + (COLS + 1) * GAP,
      height: rows * CELL_H + (rows + 1) * GAP,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(tiles)
    .png()
    .toFile(output);
}
