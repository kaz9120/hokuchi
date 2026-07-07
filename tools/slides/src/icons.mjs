// icons.mjs — Phosphor icon resolution (ADR-0013).
//
// Decks reference icons by name only (`icon: "x-logo"`); the set and weight
// live in the theme (`icon_set` / `icon_weight`), and this module turns a
// name+weight into inline SVG at build time. No runtime dependency escapes
// into the rendered output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The package's `exports` exposes no resolvable subpath for require.resolve,
// so locate the assets directory on disk relative to this tool (we read SVGs
// with fs, not the module system).
const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(here, '..', 'node_modules', '@phosphor-icons', 'core', 'assets');

function root() {
  if (!fs.existsSync(assetRoot)) {
    throw new Error('@phosphor-icons/core が見つかりません。tools/slides で `npm install` を実行してください。');
  }
  return assetRoot;
}

export const ICON_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

/** Emphasis promotes the theme weight one step heavier (「強調は書く、見た目は導出」). */
export function promoteWeight(weight) {
  return { thin: 'regular', light: 'regular', regular: 'fill', bold: 'fill', fill: 'fill', duotone: 'fill' }[weight] || 'fill';
}

function iconFile(name, weight) {
  const file = weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`;
  return path.join(root(), weight, file);
}

/** Catalog membership. Every icon exists in every weight, so `regular` decides. */
export function iconExists(name) {
  if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) return false;
  return fs.existsSync(iconFile(name, 'regular'));
}

/**
 * Inner markup (paths) of an icon, stripped of its outer <svg> tag, so the
 * caller can wrap it in its own <svg viewBox="0 0 256 256"> with layout
 * attributes. Phosphor sources fill with currentColor.
 */
export function iconInner(name, weight = 'regular') {
  const svg = fs.readFileSync(iconFile(name, weight), 'utf8');
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
}
