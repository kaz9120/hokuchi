// text.mjs — テキストの計測と分割 (SPEC §8.5)。
//
// レンダラが React コンポーネントと文字列生成の両方からテキストを扱うため、
// 描画の手前までの処理をここに集約する (ADR-0018)。文節分割・強調範囲の算出・
// 幅の推定はいずれも描画方式に依存しない純関数で、InlineText コンポーネントと
// measure 系の双方が同じ実装を共有する。

import { loadDefaultJapaneseParser } from 'budoux';

export const parser = loadDefaultJapaneseParser();

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const cpLen = (s) => [...s].length;

/** Rough text width in px: CJK ≈ 1.04em, ASCII/half-width ≈ 0.56em. */
export const estW = (s, fs) => [...String(s)]
  .reduce((t, ch) => t + (ch.codePointAt(0) < 0x2000 ? 0.56 : 1.04), 0) * fs;

/**
 * Rough wrapped-line count for a text block at font size fs within a given
 * width, using estW's per-character width model. This is a measure-time
 * estimate only (no BudouX phrase awareness) — the actual render still goes
 * through InlineText for real wrapping, so a few px of drift between the
 * estimate and the browser's layout is expected and harmless (same
 * tolerance measureList already accepts).
 */
export function estimateWrappedLines(text, fs, width) {
  return String(text).split('\n').reduce((total, line) => {
    if (!line) return total + 1;
    return total + Math.max(1, Math.ceil(estW(line, fs) / Math.max(1, width)));
  }, 0);
}

/**
 * Merge single-code-point phrases into a neighbour so that no line break can
 * strand a lone character at a line edge. This is the structural orphan guard
 * that a layout-free (build-time) renderer can offer.
 */
export function mergeShortPhrases(phrases) {
  const out = [];
  for (const p of phrases) {
    if (out.length && cpLen(p) <= 1) out[out.length - 1] += p;
    else out.push(p);
  }
  if (out.length >= 2 && cpLen(out[0]) <= 1) {
    out[1] = out[0] + out[1];
    out.shift();
  }
  return out;
}

/**
 * Character ranges [start, end) covered by emphasis words in a line.
 * Longest word wins on overlap so nested matches do not double-mark.
 */
export function emphasisRanges(line, words) {
  const uniq = [...new Set((words || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  const ranges = [];
  const overlaps = (s, e) => ranges.some((r) => s < r.end && e > r.start);
  for (const w of uniq) {
    const re = new RegExp(escapeRegex(w), 'g');
    let m;
    while ((m = re.exec(line)) !== null) {
      const s = m.index, e = s + w.length;
      if (!overlaps(s, e)) ranges.push({ start: s, end: e });
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}
