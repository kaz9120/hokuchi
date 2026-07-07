// lint.mjs — SPEC §9 linter. 15 rules, severity error / warn / info.
//
// The linter never mutates; it returns a flat list of findings
// { id, severity, slideId, message }. Errors are reserved for references that
// silently break (edge-ref, annotation-anchor). Everything else is warn/info:
// a deviation is logged, not forbidden (ADR-0002).
//
// Static-only stance: rules that would need image analysis (contrast grayscale,
// gaze) judge from declared values alone, as the SPEC allows. Three rules
// (pie-rules, logo-bumper, shrink-report) have no full declarative signal in the
// current schema; see the notes on each for how far the static check reaches.

import { iconExists } from './icons.mjs';

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

/** Visible text total: text / items / label / annotate (SPEC §9 slideument). */
function visibleTextCount(slide) {
  let n = 0;
  for (const el of slide.elements) {
    if (el.text) n += cpLen(el.text);
    if (Array.isArray(el.items)) for (const it of el.items) n += cpLen(it);
    if (Array.isArray(el.nodes)) for (const nd of el.nodes) n += cpLen(nd.label);
    if (Array.isArray(el.edges)) for (const ed of el.edges) if (ed.label) n += cpLen(ed.label);
    if (el.data && Array.isArray(el.data.series)) for (const s of el.data.series) n += cpLen(s.label);
    if (Array.isArray(el.annotations)) for (const a of el.annotations) n += cpLen(a.annotate);
  }
  return n;
}

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

  // one-idea — 2+ lead-level elements (diagram / chart / lead statement) on one slide.
  // Headline and subtitle statements are structurally subordinate, so they are
  // not counted as separate ideas (see report note).
  for (const s of slides) {
    const lead = s.elements.filter(
      (e) => e.kind === 'diagram' || e.kind === 'chart' || (e.kind === 'statement' && isLeadSlot(e))
    ).length;
    if (lead >= 2) add('one-idea', 'warn', s.id, `主役級要素が ${lead} 個ある。1 枚 1 アイデアに分割を検討`);
  }

  // bullet-count — more than 5 bullet items.
  for (const s of slides) {
    for (const b of kinds(s, 'bullets')) {
      if (b.items.length > 5) add('bullet-count', 'warn', s.id, `箇条書きが ${b.items.length} 項目。5 項目以内を推奨`);
    }
  }

  // pie-rules — 円グラフの項目数 / 合計。現行スキーマに円グラフの宣言経路が無いため、
  // 静的には検出対象が生じない (報告の SPEC ギャップ参照)。

  // axis-lock — consecutive chart slides that do not share a scale.
  for (let i = 1; i < slides.length; i++) {
    const a = kinds(slides[i - 1], 'chart')[0];
    const b = kinds(slides[i], 'chart')[0];
    if (a && b) {
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
