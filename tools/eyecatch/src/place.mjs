// place.mjs — 生成画像からモチーフを切り出し、作り直した台紙の指定位置に載せる
//
// 1. 画像の縁の帯から、紙の色とムラを測る
// 2. 紙の色からの差で、モチーフの不透明度を作る。画面を横切る直線は枠線とみなして消す
// 3. モチーフの色を紙の色の差だけずらし、台紙の色に揃える (明暗の関係は保つ)
// 4. インクの量で大きさを揃え、指定の位置に置く
// 5. 新しく作った紙に重ねる。紙ごと作り直すので境目が出ない

import sharp from 'sharp';
import { WIDTH, HEIGHT, PAPER, GRAIN, MARGIN, INK } from './paper.mjs';

async function readRGB(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function median(values) {
  const s = Float64Array.from(values).sort();
  return s[s.length >> 1];
}

/** 縁の帯から紙の色 (中央値) とムラ (差の 90 パーセンタイル) を測る */
export function measurePaper({ data, w, h }) {
  const k = Math.max(8, Math.floor(h / 20));
  const idx = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < k || y >= h - k || x < k || x >= w - k) idx.push((y * w + x) * 3);
    }
  }
  const color = [0, 1, 2].map((c) => median(idx.map((i) => data[i + c])));
  const dev = idx.map((i) => Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - color[c]))));
  const sorted = Float64Array.from(dev).sort();
  return { color, noise: sorted[Math.floor(sorted.length * 0.9)] };
}

function dilate(m, w, h, r) {
  const tmp = new Float32Array(m.length);
  const out = new Float32Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w && m[y * w + xx] > v) v = m[y * w + xx];
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h && tmp[yy * w + x] > v) v = tmp[yy * w + x];
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// sharp は 1 チャンネルの raw を処理すると 3 チャンネルで返すので、先頭だけを取り出す
const gray = (s) => s.extractChannel(0).raw().toBuffer();

async function blurGray(m, w, h, sigma) {
  const buf = Buffer.from(Uint8Array.from(m, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255)));
  const out = await gray(sharp(buf, { raw: { width: w, height: h, channels: 1 } }).blur(sigma));
  return Float32Array.from(out, (v) => v / 255);
}

/**
 * 紙の色からの差で、モチーフの不透明度 (0〜1) を作る。
 * core は紙との差がはっきり大きい画素 (線と色面) で、モチーフの範囲を決めるのに使う。
 * 紙のムラは不透明度には薄く残るが、core には入らない。
 */
export async function motifMask(img, paper) {
  const { data, w, h } = img;
  const lo = paper.noise * 1.6 + 3;
  const hi = lo + 19;
  const m = new Float32Array(w * h);
  const core = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(data[i * 3 + c] - paper.color[c]));
    m[i] = Math.min(1, Math.max(0, (d - lo) / (hi - lo)));
    if (d >= lo + 30) core[i] = 1;
  }
  // 縁の近くは捨てる。生成画像は頼んでいない枠線を描くことがある
  const e = Math.floor(Math.min(w, h) * 0.035);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < e || y >= h - e || x < e || x >= w - e) m[y * w + x] = 0;
    }
  }
  // 画面を横切る縦横の直線も枠線とみなして消す
  const wipeRows = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (m[y * w + x] > 0.15) n++;
    if (n / w > 0.5) wipeRows.push(y);
  }
  const wipeCols = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (m[y * w + x] > 0.15) n++;
    if (n / h > 0.5) wipeCols.push(x);
  }
  for (const r of wipeRows) for (let y = Math.max(0, r - 3); y <= Math.min(h - 1, r + 3); y++) m.fill(0, y * w, (y + 1) * w);
  for (const c of wipeCols) for (let y = 0; y < h; y++) for (let x = Math.max(0, c - 3); x <= Math.min(w - 1, c + 3); x++) m[y * w + x] = 0;
  for (let i = 0; i < w * h; i++) if (m[i] === 0) core[i] = 0;
  // 筆のかすれを拾うため少し広げ、境目をぼかす
  return { alpha: await blurGray(dilate(m, w, h, 2), w, h, 3), core };
}

/**
 * モチーフの範囲。インクの量の分布の両端 0.5% ずつを捨てる。
 * 紙のムラの小さな点が離れた場所に拾われても、範囲が画面いっぱいに広がらないように。
 */
export function bbox(m, w, h, tail = 0.005) {
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = m[y * w + x];
      cols[x] += v;
      rows[y] += v;
      total += v;
    }
  }
  if (total < 1) throw new Error('モチーフが見つからない (紙だけの画像に見える)');
  const range = (sums) => {
    let acc = 0, lo = 0, hi = sums.length - 1;
    for (let i = 0; i < sums.length; i++) { acc += sums[i]; if (acc >= total * tail) { lo = i; break; } }
    acc = 0;
    for (let i = sums.length - 1; i >= 0; i--) { acc += sums[i]; if (acc >= total * tail) { hi = i; break; } }
    return [lo, hi + 1];
  };
  const [x0, x1] = range(cols);
  const [y0, y1] = range(rows);
  return [x0, y0, x1, y1];
}

/** 再現できる乱数 (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 台紙を作る。紙の色に、少しぼかした粒を足す */
export async function paperCanvas(seed = 7) {
  const rand = rng(seed);
  const n = new Float32Array(WIDTH * HEIGHT);
  for (let i = 0; i < n.length; i++) {
    const u = rand() || 1e-9;
    n[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }
  const buf = Buffer.from(Uint8Array.from(n, (v) => Math.round(Math.min(255, Math.max(0, v * 40 + 128)))));
  const blurred = await gray(sharp(buf, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).blur(0.8));
  let mean = 0;
  for (const v of blurred) mean += v;
  mean /= blurred.length;
  let sd = 0;
  for (const v of blurred) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / blurred.length) || 1;
  const canvas = new Float32Array(WIDTH * HEIGHT * 3);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const g = ((blurred[i] - mean) / sd) * GRAIN;
    for (let c = 0; c < 3; c++) canvas[i * 3 + c] = PAPER[c] + g;
  }
  return canvas;
}

async function resizeRaw(data, w, h, channels, nw, nh) {
  const s = sharp(Buffer.from(data), { raw: { width: w, height: h, channels } }).resize(nw, nh, { kernel: 'lanczos3', fit: 'fill' });
  return channels === 1 ? gray(s) : s.raw().toBuffer();
}

/**
 * input の生成画像からモチーフを切り出し、1280×670 の台紙の at に置いて output に書く。
 * at はモチーフの中心 [x, y] (割合)。ink はインクの量 (画面の面積に対する割合)。
 */
export async function place(input, output, { at, ink = INK } = {}) {
  const img = await readRGB(input);
  const paper = measurePaper(img);
  const { alpha: mask, core } = await motifMask(img, paper);
  const pad = 24;
  let [x0, y0, x1, y1] = bbox(core, img.w, img.h);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(img.w, x1 + pad);
  y1 = Math.min(img.h, y1 + pad);
  const cw = x1 - x0;
  const ch = y1 - y0;

  const motif = new Uint8Array(cw * ch * 3);
  const alpha = new Uint8Array(cw * ch);
  let mass = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (y + y0) * img.w + (x + x0);
      const di = y * cw + x;
      for (let c = 0; c < 3; c++) {
        const v = img.data[si * 3 + c] - paper.color[c] + PAPER[c];
        motif[di * 3 + c] = Math.min(255, Math.max(0, Math.round(v)));
      }
      alpha[di] = Math.round(mask[si] * 255);
      mass += mask[si];
    }
  }

  // 大きさはインクの量で揃える。はぐれた細い線があっても主役の大きさがぶれない
  let scale = Math.sqrt((ink * WIDTH * HEIGHT) / mass);
  const maxW = WIDTH * (1 - 2 * MARGIN);
  const maxH = HEIGHT * (1 - 2 * MARGIN);
  scale = Math.min(scale, maxW / cw, maxH / ch);
  const mw = Math.max(1, Math.round(cw * scale));
  const mh = Math.max(1, Math.round(ch * scale));
  const m3 = await resizeRaw(motif, cw, ch, 3, mw, mh);
  const a1 = await resizeRaw(alpha, cw, ch, 1, mw, mh);

  const [fx, fy] = at;
  const cx = Math.min(Math.max(fx * WIDTH, MARGIN * WIDTH + mw / 2), (1 - MARGIN) * WIDTH - mw / 2);
  const cy = Math.min(Math.max(fy * HEIGHT, MARGIN * HEIGHT + mh / 2), (1 - MARGIN) * HEIGHT - mh / 2);
  const px = Math.round(cx - mw / 2);
  const py = Math.round(cy - mh / 2);

  const canvas = await paperCanvas();
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const a = a1[y * mw + x] / 255;
      if (a === 0) continue;
      const di = ((py + y) * WIDTH + (px + x)) * 3;
      for (let c = 0; c < 3; c++) canvas[di + c] = canvas[di + c] * (1 - a) + m3[(y * mw + x) * 3 + c] * a;
    }
  }
  const out = Buffer.from(Uint8Array.from(canvas, (v) => Math.min(255, Math.max(0, Math.round(v)))));
  const s = sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } });
  await (output.toLowerCase().endsWith('.png') ? s.png() : s.jpeg({ quality: 92 })).toFile(output);
  return { center: [cx / WIDTH, cy / HEIGHT], size: [mw, mh], paper: paper.color };
}
