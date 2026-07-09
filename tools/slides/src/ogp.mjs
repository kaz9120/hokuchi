// ogp.mjs — resolve OGP metadata for `link` elements at render time (ADR-0017).
//
// A link element may omit title / description / image and let the renderer
// derive them from the target page's OGP tags. Resolution runs once at
// render time (not in the SPA, not in a separate CLI step) and caches its
// result under the deck's assets/ogp/ so re-renders — including final/
// freezes — never need the network again. Hand-written fields always win;
// this module only fills what is missing.
//
// Network failures (timeout, non-2xx, unparsable HTML, missing og:*) are not
// errors: they are logged to stderr and the element is left exactly as it
// was, which renderLink already handles by falling back to a text-only card.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FETCH_TIMEOUT_MS = 5000;

/** First 12 hex chars of the sha1 of the link URL — the cache key (ADR-0017). */
function urlHash(url) {
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Pull one og:<prop> meta tag's content out of raw HTML. Attribute order
 * varies across sites, so both `property before content` and the reverse
 * are matched. */
function extractOgTag(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

function extFromContentType(ct) {
  if (!ct) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('svg')) return '.svg';
  return '.jpg';
}

async function fetchWithTimeout(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Read cached metadata JSON, or null if absent/unreadable. */
function readCachedMeta(cacheDir, hash) {
  const p = path.join(cacheDir, `${hash}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Find an already-cached image file for this hash, any extension. */
function findCachedImage(cacheDir, hash) {
  if (!fs.existsSync(cacheDir)) return null;
  const hit = fs.readdirSync(cacheDir).find((f) => f.startsWith(`${hash}.`) && !f.endsWith('.json'));
  return hit ? path.join(cacheDir, hit) : null;
}

/** Fetch and cache OGP metadata (title/description/image URL) for one link URL. */
async function fetchAndCacheMeta(url, cacheDir, hash, fetchImpl) {
  const res = await fetchWithTimeout(fetchImpl, url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const meta = {
    title: extractOgTag(html, 'og:title'),
    description: extractOgTag(html, 'og:description'),
    image: extractOgTag(html, 'og:image'),
  };
  if (meta.image) {
    try { meta.image = new URL(meta.image, url).href; } catch { /* keep as-is */ }
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, `${hash}.json`), JSON.stringify(meta, null, 2));
  return meta;
}

/** Fetch and cache the og:image binary itself. Returns the deck-relative path. */
async function fetchAndCacheImage(imageUrl, cacheDir, hash, fetchImpl) {
  const res = await fetchWithTimeout(fetchImpl, imageUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = extFromContentType(res.headers?.get?.('content-type'));
  const name = `${hash}${ext}`;
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, name), buf);
  return name;
}

/** Resolve title/description/image for one link element, mutating it in place. */
async function resolveOne(el, cacheDir, fetchImpl) {
  const hash = urlHash(el.url);
  let meta = readCachedMeta(cacheDir, hash);

  if (!meta) {
    try {
      meta = await fetchAndCacheMeta(el.url, cacheDir, hash, fetchImpl);
    } catch (err) {
      process.stderr.write(`warning: OGP 取得に失敗しました (${el.url}): ${err.message}\n`);
      return;
    }
  }

  if (!el.title && meta.title) el.title = meta.title;
  if (!el.description && meta.description) el.description = meta.description;

  if (!el.image && meta.image) {
    const cached = findCachedImage(cacheDir, hash);
    if (cached) {
      el.image = `assets/ogp/${path.basename(cached)}`;
    } else {
      try {
        const name = await fetchAndCacheImage(meta.image, cacheDir, hash, fetchImpl);
        el.image = `assets/ogp/${name}`;
      } catch (err) {
        process.stderr.write(`warning: OGP 画像の取得に失敗しました (${meta.image}): ${err.message}\n`);
      }
    }
  }
}

/**
 * Fill missing title/description/image on every `link` element in the deck
 * from the target URL's OGP metadata, caching under `<deckDir>/assets/ogp/`.
 * Mutates deckRoot in place. Never throws — network/parsing failures are
 * logged to stderr and leave the element as-is (render falls back to a
 * text-only card, SPEC §6.9).
 *
 * @param {object} deckRoot - the loaded deck root ({ deck, slides })
 * @param {string} deckDir - absolute directory the deck.yaml lives in
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function resolveLinkOgp(deckRoot, deckDir, { fetchImpl = fetch } = {}) {
  const cacheDir = path.join(deckDir, 'assets', 'ogp');
  for (const slide of deckRoot.slides || []) {
    for (const el of slide.elements || []) {
      if (el.kind !== 'link') continue;
      if (el.title && el.description && el.image) continue;
      await resolveOne(el, cacheDir, fetchImpl);
    }
  }
}
