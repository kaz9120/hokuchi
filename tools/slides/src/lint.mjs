// lint.mjs — SPEC §9 linter. Severity error / warn / info.
//
// The linter never mutates; it returns a flat list of findings
// { id, severity, slideId, message }. Errors are reserved for references that
// silently break (edge-ref, annotation-anchor). Everything else is warn/info:
// a deviation is logged, not forbidden (ADR-0002).
//
// Static-only stance: rules that would need image analysis (contrast grayscale,
// gaze) judge from declared values alone, as the SPEC allows. logo-bumper has
// no declarative signal in the current schema (no logo element exists yet) and
// stays a no-op; shrink-report's static estimate covers only the tractable
// list-stage case. pie-rules became fully declarative with chart intent
// composition (ADR-0016) and no longer needs this caveat.

import { iconExists } from './icons.mjs';
import { CANVAS, MARGIN } from './geometry.mjs';

const cpLen = (s) => [...String(s)].length;

// ---------------------------------------------------------------------------
// Color helpers (for contrast, static judgment only)
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Per-slide inspection helpers
// ---------------------------------------------------------------------------
const kinds = (slide, k) => slide.elements.filter((e) => e.kind === k);
// Structurally subordinate slots do not count as separate ideas (SPEC §9).
// The profile-stage slots (name / affiliation / handle) are reference labels,
// not statements competing for the slide's one idea.
const SUBORDINATE_SLOTS = new Set(['headline', 'subtitle', 'support', 'name', 'affiliation', 'handle']);
const isLeadSlot = (e) => !SUBORDINATE_SLOTS.has(e.slot);
// Lead-level kinds that always count toward one-idea regardless of slot
// (SPEC §9 one-idea; ADR-0016 extends this to the 8 new elements). code
// counts here even though its text is excluded from slideument — it is
// still a competing focal point on the slide, just not spoken-word text.
const LEAD_KINDS = new Set(['diagram', 'chart', 'code', 'post', 'link', 'stat', 'table', 'versus', 'agenda', 'video']);

/** Visible text total: text / items / label / annotate (SPEC §9 slideument).
 * code is deliberately excluded — it is reference material, not spoken-word
 * text (same exemption as profile-stage, SPEC §6.7). */
function visibleTextCount(slide) {
  let n = 0;
  for (const el of slide.elements) {
    if (el.text) n += cpLen(el.text);
    if (Array.isArray(el.items)) for (const it of el.items) n += cpLen(it);
    if (Array.isArray(el.nodes)) for (const nd of el.nodes) n += cpLen(nd.label);
    if (Array.isArray(el.edges)) for (const ed of el.edges) if (ed.label) n += cpLen(ed.label);
    if (el.shared && el.shared.label) n += cpLen(el.shared.label);
    if (el.data && Array.isArray(el.data.series)) for (const s of el.data.series) n += cpLen(s.label);
    if (Array.isArray(el.annotations)) for (const a of el.annotations) n += cpLen(a.annotate);
    if (el.kind === 'post' && el.author) n += cpLen(el.author);
    if (el.kind === 'link') {
      if (el.title) n += cpLen(el.title);
      if (el.description) n += cpLen(el.description);
    }
    if (el.kind === 'stat') {
      if (el.value) n += cpLen(el.value);
      if (el.label) n += cpLen(el.label);
      if (el.context) n += cpLen(el.context);
    }
    if (el.kind === 'table') {
      for (const c of el.columns || []) n += cpLen(c);
      for (const row of el.rows || []) for (const cell of row) n += cpLen(cell);
    }
    if (el.kind === 'versus') {
      for (const side of el.sides || []) {
        n += cpLen(side.label);
        for (const it of side.items || []) n += cpLen(it);
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// bullet-parallel helpers (ADR-0025, p.171)
// ---------------------------------------------------------------------------
const PERIOD_RE = /[。．.]$/;
const TRAILING_RE = /[\s。．.、,!！?？』）)]+$/u;
const QUOTED_RE = /^「[^」]*」$/u;
const HIRAGANA_RE = /\p{Script=Hiragana}$/u;
const JAPANESE_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]$/u;
// Kana that close a predicate: dictionary-form verbs (う-row: する・溜まる・
// 語ろう), past and copula (た・だ), adjectives and negation (い・ない),
// polite negation (ません), and sentence-final particles (か・ね・よ・な).
// Nouns derived from verbs end in the い/え-row instead (ずれ・づくり・強み・
// 曖昧さ), so they fall through to 'noun'.
const PREDICATE_KANA = new Set([...'うくぐすずつぬぶむるただいんかねよなぞわ']);
// A trailing case particle means a fragment, neither a noun nor a sentence.
const PARTICLE_KANA = new Set([...'にでをへがはもとや']);
// Hiragana nouns whose last kana would otherwise read as a predicate or
// particle.
const HIRAGANA_NOUNS = ['こと', 'もの', 'ところ', '違い', '問い', '扱い', '思い', '狙い', '迷い', '争い', '願い'];

/** 'noun' (体言止め) | 'predicate' (用言・助動詞で終わる文) | null (判定しない).
 * A heuristic on the last kana. Items that do not end in Japanese (English,
 * numbers, symbols) and items quoted verbatim in 「」 (another person's words,
 * which the author cannot rephrase) are left out of the comparison. */
function endingKind(item) {
  const raw = String(item).trim();
  if (QUOTED_RE.test(raw)) return null;
  const core = raw.replace(TRAILING_RE, '');
  if (!core || !JAPANESE_RE.test(core)) return null;
  if (PERIOD_RE.test(raw)) return 'predicate';
  if (!HIRAGANA_RE.test(core)) return 'noun';
  if (HIRAGANA_NOUNS.some((w) => core.endsWith(w))) return 'noun';
  const last = [...core].pop();
  if (PARTICLE_KANA.has(last)) return null;
  return PREDICATE_KANA.has(last) ? 'predicate' : 'noun';
}

/** Returns a short description of the mismatch, or null when items agree. */
function bulletParallelProblem(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  const problems = [];
  const withPeriod = items.filter((it) => PERIOD_RE.test(String(it).trim())).length;
  if (withPeriod > 0 && withPeriod < items.length) {
    problems.push(`句点あり ${withPeriod} / なし ${items.length - withPeriod}`);
  }
  const ends = items.map(endingKind).filter(Boolean);
  const nouns = ends.filter((k) => k === 'noun').length;
  const preds = ends.length - nouns;
  if (nouns > 0 && preds > 0) problems.push(`体言止め ${nouns} / 文 ${preds}`);
  return problems.length ? problems.join('、') : null;
}

// ---------------------------------------------------------------------------
// layers / glance / form-fallback helpers (ADR-0025)
// ---------------------------------------------------------------------------

/** Information layers present on a slide (p.117). headline, the lead, each
 * kind of secondary text inside the lead, and support are separate layers.
 * Each kind of secondary text counts on its own because each is read as a
 * separate pass (node labels, then their details, then the edge labels).
 * chapter is the deck's constant frame and is not counted. */
function slideLayers(slide) {
  const layers = [];
  const els = slide.elements;
  if (els.some((e) => e.slot === 'headline')) layers.push('headline');
  if (els.some((e) => isLeadSlot(e))) layers.push('主役');
  const sub = new Set();
  for (const e of els) {
    if (e.kind === 'diagram') {
      if ((e.nodes || []).some((n) => n.detail)) sub.add('ノードの detail');
      if ((e.edges || []).some((ed) => ed.label)) sub.add('edge の label');
    }
    if (e.kind === 'chart' && (e.annotations || []).length > 0) sub.add('chart の annotation');
    if (e.kind === 'versus' && (e.sides || []).some((sd) => sd.description)) sub.add('versus の description');
    if (e.kind === 'stat' && e.context) sub.add('stat の context');
  }
  layers.push(...sub);
  if (els.some((e) => e.slot === 'support' || e.slot === 'subtitle')) layers.push('support');
  return layers;
}

/** Rendered width in em: full-width glyphs are 1em, ASCII about 0.6em. */
function emWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === ' ') w += 0.3;
    else if (c <= 0x7e) w += 0.6;
    else if (c >= 0xff61 && c <= 0xff9f) w += 0.5; // half-width katakana
    else w += 1;
  }
  return w;
}

/** Characters a reader has to take in (whitespace and line breaks excluded). */
const readableLen = (s) => cpLen(String(s).replace(/\s+/g, ''));

// 3 秒で読める statement の字数の目安 (SPEC §11: 実測で調整が要る)。
const GLANCE_STATEMENT_MAX = 30;

// Forms with a dedicated renderer (render.mjs measureDiagram). flow.linear
// is drawn as the step row by design, so it is not a fallback. Keep this in
// step with measureDiagram's switch when a form gains its own drawing.
const DEDICATED_FORMS = new Set([
  'flow.linear', 'flow.cycle', 'flow.branch', 'flow.converge', 'flow.timeline',
  'structure.matrix', 'structure.tree', 'structure.layer',
  'cluster.overlap', 'cluster.closure', 'cluster.enclosed', 'cluster.linked',
  'radial.core',
]);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export function lint(deckRoot, themeRoot) {
  const findings = [];
  const add = (id, severity, slideId, message) => findings.push({ id, severity, slideId, message });
  const slides = deckRoot.slides;
  const theme = themeRoot.theme;

  // slideument — visible text budget (SPEC §9; 100/150 is a coarse JP conversion).
  // profile-stage is exempt: a self-introduction is reference material the
  // audience skims while the speaker talks over it, not spoken-word slides.
  for (const s of slides) {
    if (s.layout === 'profile-stage') continue;
    const n = visibleTextCount(s);
    if (n > 150) add('slideument', 'error', s.id, `可視テキスト ${n} 字が上限 150 字を超えている`);
    else if (n > 100) add('slideument', 'warn', s.id, `可視テキスト ${n} 字が目安 100 字を超えている`);
  }

  // one-idea — 2+ lead-level elements (diagram / chart / code / post / link /
  // stat / table / versus / agenda / video / lead statement) on one slide.
  // Headline and subtitle statements are structurally subordinate, so they are
  // not counted as separate ideas (see report note).
  for (const s of slides) {
    const lead = s.elements.filter(
      (e) => LEAD_KINDS.has(e.kind) || (e.kind === 'statement' && isLeadSlot(e))
    ).length;
    if (lead >= 2) add('one-idea', 'warn', s.id, `主役級要素が ${lead} 個ある。1 枚 1 アイデアに分割を検討`);
  }

  // bullet-parallel — items whose endings do not agree (ADR-0025, p.171).
  // Replaces bullet-count: the book tells readers to ignore item-count rules
  // (p.170) and asks instead for one consistent phrasing across items.
  // profile-stage bio is exempt (reference labels, same as slideument).
  for (const s of slides) {
    if (s.layout === 'profile-stage') continue;
    for (const b of kinds(s, 'bullets')) {
      const problem = bulletParallelProblem(b.items);
      if (problem) add('bullet-parallel', 'warn', s.id, `箇条書きの言い回しが揃っていない (${problem})`);
    }
  }

  // layers — 4+ information layers on one slide (ADR-0025, p.117 TIP).
  for (const s of slides) {
    if (s.layout === 'profile-stage') continue;
    const layers = slideLayers(s);
    if (layers.length >= 4) {
      add('layers', 'info', s.id, `情報のレイヤーが ${layers.length} つある (${layers.join('・')})。メイン 1 + サブ 2 までを目安に`);
    }
  }

  // glance — a headline that will not fit on one line, or a content statement
  // too long to read in 3 seconds (ADR-0025, p.160, p.164). Both thresholds
  // are rough character budgets pending real measurement (SPEC §11).
  {
    const headingPx = theme.type.scale?.heading ?? 34;
    const headlineEm = (CANVAS.w - MARGIN.x * 2) / headingPx;
    for (const s of slides) {
      for (const el of s.elements) {
        if (el.kind !== 'statement' || !el.text) continue;
        if (el.slot === 'headline') {
          const lines = String(el.text).split('\n');
          const widest = Math.max(...lines.map(emWidth));
          if (lines.length > 1 || widest > headlineEm) {
            add('glance', 'info', s.id, `headline が 1 行に収まらない (${lines.length > 1 ? `${lines.length} 行` : `約 ${Math.ceil(widest)} 字幅 / 1 行 ${Math.floor(headlineEm)} 字幅`})`);
          }
        } else if (s.role === 'content' && isLeadSlot(el)) {
          const n = readableLen(el.text);
          if (n > GLANCE_STATEMENT_MAX) {
            add('glance', 'info', s.id, `statement が ${n} 字。3 秒で読める目安 ${GLANCE_STATEMENT_MAX} 字を超えている`);
          }
        }
      }
    }
  }

  // form-fallback — diagram form without a dedicated renderer (ADR-0025).
  for (const s of slides) {
    for (const d of kinds(s, 'diagram')) {
      if (!DEDICATED_FORMS.has(d.form)) {
        add('form-fallback', 'info', s.id, `diagram form "${d.form}" は専用の描画を持たず、横並びのステップ (flow.linear と同じ形) で描かれる`);
      }
    }
  }

  // message-missing — no deck.message (ADR-0024).
  if (!deckRoot.deck?.message) {
    add('message-missing', 'info', slides[0].id, 'deck.message (中核メッセージ) が無い。聴衆に理解してほしいことを 1 文で書く');
  }

  // code-budget — code text 17+ lines, or any line 81+ columns wide (ADR-0016).
  // Only measures el.code (already resolved from src by load.mjs); an
  // unresolved src (file not yet delivered) has nothing to measure, so it is
  // skipped rather than flagged.
  for (const s of slides) {
    for (const c of kinds(s, 'code')) {
      if (!c.code) continue;
      const lines = c.code.replace(/\n$/, '').split('\n');
      const maxWidth = Math.max(0, ...lines.map(cpLen));
      if (lines.length >= 17 || maxWidth >= 81) {
        add('code-budget', 'warn', s.id, `code が ${lines.length} 行・最長 ${maxWidth} 桁。17 行 / 81 桁が目安`);
      }
    }
  }

  // table-size — 8+ data rows (column cap of 6 is schema-enforced, ADR-0016).
  for (const s of slides) {
    for (const t of kinds(s, 'table')) {
      if (t.rows.length >= 8) {
        add('table-size', 'warn', s.id, `table のデータ行が ${t.rows.length} 行。8 行以上は読みにくい`);
      }
    }
  }

  // agenda-source — agenda has no role: transition slide to derive its items
  // from (ADR-0016). agenda itself carries no fields, so a deck-wide check.
  {
    const hasTransition = slides.some((s) => s.role === 'transition');
    if (!hasTransition) {
      for (const s of slides) {
        if (kinds(s, 'agenda').length > 0) {
          add('agenda-source', 'error', s.id, 'agenda 要素があるが role: transition のスライドが 1 枚も無い');
        }
      }
    }
  }

  // pie-rules — composition intent の単一系列の項目数 / 合計 (ADR-0016)。
  // 複数系列の composition は 100% 積み上げ棒に導出されるため、円グラフの規則
  // (8 項目以内・合計 100%) の対象外。
  for (const s of slides) {
    for (const ch of kinds(s, 'chart')) {
      if (ch.intent !== 'composition') continue;
      const series = ch.data.series || [];
      if (series.length !== 1) continue;
      const xs = ch.data.x || [];
      const values = series[0].values || [];
      const sum = values.reduce((a, b) => a + b, 0);
      if (xs.length >= 9) {
        add('pie-rules', 'warn', s.id, `円グラフの項目が ${xs.length} 個。8 項目以内を推奨`);
      }
      if (Math.abs(sum - 100) > 2) {
        add('pie-rules', 'warn', s.id, `円グラフの合計が ${sum} で 100±2 を外れている`);
      }
    }
  }

  // axis-lock — consecutive chart slides that do not share a scale.
  // intent: composition (ドーナツ / 100% 積み上げ棒) は軸を持たない (ADR-0016)。
  // ペアのどちらかが composition なら、そもそも揃えるべき軸がないので対象外にする。
  for (let i = 1; i < slides.length; i++) {
    const a = kinds(slides[i - 1], 'chart')[0];
    const b = kinds(slides[i], 'chart')[0];
    if (a && b) {
      if (a.intent === 'composition' || b.intent === 'composition') continue;
      if (!a.scale || !b.scale || a.scale !== b.scale) {
        add('axis-lock', 'warn', slides[i].id, '連続する chart が共有 scale を指定していない。軸位置が揃わない');
      }
    }
  }

  // contrast — static judgment from declared palette (no image analysis).
  const core = theme.palette.core;
  const bg = theme.palette.neutral.bg;
  for (const s of slides) {
    for (const ch of kinds(s, 'chart')) {
      const nSeries = ch.data.series ? ch.data.series.length : 0;
      if (nSeries >= 2) {
        // Grayscale separability of the core colors actually assigned.
        for (let i = 0; i < nSeries; i++) {
          for (let j = i + 1; j < nSeries; j++) {
            const d = Math.abs(relLuminance(core[i % core.length]) - relLuminance(core[j % core.length]));
            if (d < 0.12) {
              add('contrast', 'warn', s.id, `系列 ${i + 1} と ${j + 1} の色がグレースケールで判別しにくい`);
            }
          }
        }
      } else if (nSeries === 1) {
        if (contrastRatio(core[0], bg) < 3) {
          add('contrast', 'warn', s.id, 'データ系列と背景のコントラストが不足している');
        }
      }
    }
  }

  // whitespace — grid-direct with whitespace_min lowered below the 0.3 default.
  for (const s of slides) {
    if (typeof s.layout === 'object' && s.layout.whitespace_min != null && s.layout.whitespace_min < 0.3) {
      add('whitespace', 'warn', s.id, `whitespace_min ${s.layout.whitespace_min} が既定 0.3 を下回る`);
    }
  }

  // gaze — person image whose gaze points away from content (declared value).
  for (const s of slides) {
    for (const img of kinds(s, 'image')) {
      if (img.gaze === 'away-from-content') {
        add('gaze', 'warn', s.id, '人物の視線がコンテンツと逆向き');
      }
    }
  }

  // logo-bumper — ロゴ要素は opener/closer のみ許可。現行スキーマにロゴ要素の宣言経路が
  // 無いため、静的には検出対象が生じない (報告の SPEC ギャップ参照)。

  // raw-budget — raw elements exceed 10% of all elements.
  const allEls = slides.flatMap((s) => s.elements);
  const rawCount = allEls.filter((e) => e.kind === 'raw').length;
  if (allEls.length > 0 && rawCount / allEls.length > 0.1) {
    add('raw-budget', 'warn', slides[0].id, `raw 要素が全体の ${Math.round((rawCount / allEls.length) * 100)}% を占める (1 割超)`);
  }

  // deck-size — more than 10 content slides.
  const contentCount = slides.filter((s) => s.role === 'content').length;
  if (contentCount > 10) {
    add('deck-size', 'info', slides[0].id, `内容スライドが ${contentCount} 枚。10 枚超は文脈次第`);
  }

  // annotation-anchor — chart `at` that does not match any x value (error).
  for (const s of slides) {
    for (const ch of kinds(s, 'chart')) {
      const xs = ch.data.x || [];
      for (const ann of ch.annotations || []) {
        if (ann.at_index != null) {
          if (ann.at_index >= xs.length) add('annotation-anchor', 'error', s.id, `annotation at_index ${ann.at_index} が x 配列 (長さ ${xs.length}) の範囲外`);
        } else if (!xs.includes(ann.at)) {
          add('annotation-anchor', 'error', s.id, `annotation at:"${ann.at}" が x 配列の値と一致しない`);
        }
      }
    }
  }

  // icon-exists — icon name not in the theme's icon set catalog (error):
  // the render silently skips unknown icons, so the reference must not pass.
  for (const s of slides) {
    for (const el of s.elements) {
      const refs = [];
      if (el.icon) refs.push(el.icon);
      if (Array.isArray(el.nodes)) for (const nd of el.nodes) if (nd.icon) refs.push(nd.icon);
      for (const name of refs) {
        if (!iconExists(name)) add('icon-exists', 'error', s.id, `icon:"${name}" がアイコンセットに存在しない`);
      }
    }
  }

  // edge-ref — diagram edge referencing a nonexistent node id (error).
  for (const s of slides) {
    for (const d of kinds(s, 'diagram')) {
      const ids = new Set(d.nodes.map((n) => n.id));
      for (const e of d.edges || []) {
        if (!ids.has(e.from)) add('edge-ref', 'error', s.id, `edge の from:"${e.from}" が存在しないノード`);
        if (!ids.has(e.to)) add('edge-ref', 'error', s.id, `edge の to:"${e.to}" が存在しないノード`);
      }
    }
  }

  // shrink-report — lead element likely exceeds the stage (static estimate).
  // True shrink detection is a render-time signal; here we flag the tractable
  // case of a bullet list taller than the available stage height. The height
  // is a coarse snapshot of the renderer's stage (canvas − margins − headline
  // band); composition itself is renderer-internal (ADR-0014).
  for (const s of slides) {
    if (s.layout !== 'list-stage') continue;
    const b = kinds(s, 'bullets')[0];
    if (!b) continue;
    const stageH = 720 - 64 * 2 - 84;
    const bulletPx = (theme.type.scale?.bullet ?? 34);
    const estimate = b.items.length * bulletPx * 2.5; // line + gap per item
    if (estimate > stageH * 0.85) {
      add('shrink-report', 'info', s.id, `箇条書き ${b.items.length} 項目が舞台高さに収まらず縮小される可能性`);
    }
  }

  return findings;
}

/** Convenience: does the finding list contain any error? */
export function hasError(findings) {
  return findings.some((f) => f.severity === 'error');
}
