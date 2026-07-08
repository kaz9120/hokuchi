// load.mjs — read deck/theme YAML, normalize sugar, validate against the schemas.
//
// The loader is the single boundary between the user's hand-written YAML and the
// rest of the tool. Downstream code (lint, render) receives a normalized deck in
// which every sugar form has already been expanded to its canonical shape, so it
// never has to branch on "string edge vs object edge" again.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(here, '..', 'schema');

const ajv = new Ajv2020({
  strictRequired: false,
  allowUnionTypes: true,
  allErrors: true,
});

const deckSchema = readJson(path.join(schemaDir, 'deck.schema.json'));
const themeSchema = readJson(path.join(schemaDir, 'theme.schema.json'));
const validateDeck = ajv.compile(deckSchema);
const validateTheme = ajv.compile(themeSchema);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readYaml(p) {
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

/** Format ajv errors into a readable multi-line string. */
function formatErrors(errors, label) {
  const lines = (errors || []).map((e) => {
    const where = e.instancePath || '(root)';
    return `  ${where} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`;
  });
  return `${label} failed schema validation:\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Sugar normalization
// ---------------------------------------------------------------------------

/** "a -> b" → { from: "a", to: "b" }. Object edges pass through unchanged. */
export function normalizeEdge(edge) {
  if (typeof edge === 'string') {
    const [from, to] = edge.split('->').map((s) => s.trim());
    return { from, to };
  }
  return edge;
}

function normalizeDiagram(el) {
  if (Array.isArray(el.edges)) {
    el.edges = el.edges.map(normalizeEdge);
  }
  return el;
}

function normalizeChart(el) {
  // The external-source form {source, x, y} is declared in the schema but its
  // resolution to the canonical {x, series} shape is not implemented yet. Fail
  // loudly with guidance rather than rendering an empty chart.
  if (el.data && Object.prototype.hasOwnProperty.call(el.data, 'source')) {
    throw new Error(
      `chart data.source ("${el.data.source}") is not implemented yet. ` +
        'Inline the data as { x: [...], series: [{ label, values }] } for now.'
    );
  }
  return el;
}

// code.src → code.code (ADR-0016). Mirrors the chart source-sugar resolution
// site, but resolves eagerly instead of deferring: unlike a chart with no
// data, a code element with an unread src still has a well-formed empty
// render, and downstream consumers (code-budget lint) need the text now.
// A missing file is not an error here — same tolerance as image's src
// fallback to its prompt placeholder — it just leaves el.code unset, and
// code-budget skips elements it cannot measure.
function normalizeCode(el, deckDir) {
  if (el.src && !el.code) {
    const abs = path.resolve(deckDir, el.src);
    if (fs.existsSync(abs)) {
      el.code = fs.readFileSync(abs, 'utf8');
    }
  }
  return el;
}

function normalizeElement(el, deckDir) {
  if (el.kind === 'diagram') return normalizeDiagram(el);
  if (el.kind === 'chart') return normalizeChart(el);
  if (el.kind === 'code') return normalizeCode(el, deckDir);
  return el;
}

function normalizeDeck(root, deckDir) {
  for (const slide of root.slides || []) {
    for (const el of slide.elements || []) normalizeElement(el, deckDir);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and normalize a deck plus its referenced theme.
 * @returns {{ deck, theme, deckPath, themePath }}
 *   deck  — the full normalized deck root ({ schema_version, deck, slides })
 *   theme — the full theme root ({ schema_version, theme })
 */
export function loadDeck(deckPath) {
  const absDeck = path.resolve(deckPath);
  const rawDeck = readYaml(absDeck);

  if (!validateDeck(rawDeck)) {
    throw new Error(formatErrors(validateDeck.errors, `deck ${deckPath}`));
  }

  const themeRel = rawDeck.deck.theme;
  const absTheme = path.resolve(path.dirname(absDeck), themeRel);
  const theme = loadTheme(absTheme);

  const deck = normalizeDeck(rawDeck, path.dirname(absDeck));
  return { deck, theme, deckPath: absDeck, themePath: absTheme };
}

/** Load and validate a theme file on its own. */
export function loadTheme(themePath) {
  const absTheme = path.resolve(themePath);
  const raw = readYaml(absTheme);
  if (!validateTheme(raw)) {
    throw new Error(formatErrors(validateTheme.errors, `theme ${themePath}`));
  }
  return raw;
}
