// chart-policy.mjs — chart の導出方針 (SPEC §6.5, §8.4, ADR-0025)。
//
// レンダラと lint が同じ判断をするための純関数だけを置く。どれもレンダラ内部の
// 構図ポリシー (ADR-0014) であり、数値はスキーマ・テーマ・SPEC に出さない。
//
// - compositionForm: composition をドーナツ / 100% 横棒 / 100% 積み上げ棒の
//   どれに導出するか (p.91 円は差が大きいときに使う)
// - seriesColors: emphasis を踏まえた系列の色 (p.95 重要度の低い情報はグレーに、p.97)

/**
 * 円に導出してよい、大きい順に隣り合う 2 項目の比の上限。
 * 小さい方が大きい方の 8 割を超える組が 1 つでもあれば、円の角度では差を
 * 読み分けにくいとみなし 100% 横棒に落とす。差の知覚は大きさに比例する
 * (Weber 則) ので、ポイント差ではなく比で測る。0.8 は未実測の目安 (ADR-0025)。
 */
export const PIE_MAX_ADJACENT_RATIO = 0.8;

/** 強調しない系列の色が背景に対して保ちたいコントラスト比 (WCAG 1.4.11 の非テキスト 3:1)。 */
export const DEEMPH_MIN_CONTRAST = 3;
/**
 * 強調色と輝度を離すために譲れる下限。3:1 の点が強調色とグレースケールで
 * 見分けられない (相対輝度の差 GRAY_SEPARATION 未満) ときだけ、ここまで背景へ寄せる。
 * 強調しない系列は意図して背景に下げた情報なので、3:1 より少し低くてよいと判断した。
 */
export const DEEMPH_FLOOR_CONTRAST = 2.5;
/** グレースケールで 2 色を見分けられるとみなす相対輝度の差 (contrast lint と同じ値)。 */
export const GRAY_SEPARATION = 0.12;

/**
 * composition の導出先。
 * @returns {'donut' | 'bar100' | 'stacked'}
 */
export function compositionForm(el) {
  const series = el.data.series || [];
  if (series.length !== 1) return 'stacked';
  const values = (series[0].values || []).filter((v) => v > 0).sort((a, b) => b - a);
  for (let i = 1; i < values.length; i++) {
    if (values[i] / values[i - 1] > PIE_MAX_ADJACENT_RATIO) return 'bar100';
  }
  return 'donut';
}

// ---------------------------------------------------------------------------
// 色
// ---------------------------------------------------------------------------
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** a から b へ t (0..1) だけ寄せた色。 */
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

/**
 * 強調しない系列の色。パレットの無彩色 muted を line (背景寄り) へ寄せられる
 * だけ寄せ、背景とのコントラスト 3:1 を割らない所で止める。muted のままでは
 * 強調系列と張り合い、line のままでは背景に埋もれるため、その間の最も控えめな点を採る。
 * その点が強調色 accents とグレースケールで見分けられないときは、見分けられる所まで
 * さらに背景へ寄せる (DEEMPH_FLOOR_CONTRAST で止める)。
 * @param {{ bg: string, line: string, muted: string }} P 平らなパレット
 * @param {string[]} [accents] 同じチャートで使う強調色
 */
export function deemphasisColor(P, accents = []) {
  const steps = Array.from({ length: 21 }, (_, k) => mix(P.muted, P.line, k / 20));
  const separated = (c) => accents.every((a) => Math.abs(relLuminance(a) - relLuminance(c)) >= GRAY_SEPARATION);
  let best = P.muted;
  for (const c of steps) {
    if (contrastRatio(c, P.bg) < DEEMPH_MIN_CONTRAST) break;
    best = c;
  }
  if (separated(best)) return best;
  const i0 = steps.indexOf(best);
  for (const c of steps.slice(i0 + 1)) {
    if (contrastRatio(c, P.bg) < DEEMPH_FLOOR_CONTRAST) break;
    if (separated(c)) return c;
  }
  return best;
}

/** 強調系列が 1 つのときの色。highlight が背景に対して 3:1 を割るテーマでは core[0] に替える。 */
function soloAccent(P) {
  return contrastRatio(P.highlight, P.bg) >= DEEMPH_MIN_CONTRAST ? P.highlight : P.core[0];
}

/**
 * 系列ごとの色と役割。
 * - emphasis なし: 宣言順に core を回す (従来どおり)。role は 'plain'
 * - emphasis 1 系列: その系列だけ highlight (背景と 3:1 を割るなら core[0])、他は deemphasisColor
 * - emphasis 2 系列以上: 強調系列に emphasis の宣言順で core を回し、他は deemphasisColor
 * emphasis に series に無いラベルが入っていても黙って無視する (chart-emphasis-ref lint が報告する)。
 * @param {{ bg, line, muted, highlight, core }} P 平らなパレット
 * @returns {{ color: string, role: 'plain' | 'emph' | 'deemph' }[]}
 */
export function seriesColors(el, P) {
  const series = el.data.series || [];
  const labels = series.map((s) => s.label);
  const emph = (el.emphasis || []).filter((l, i, a) => labels.includes(l) && a.indexOf(l) === i);
  if (emph.length === 0) {
    return series.map((_, i) => ({ color: P.core[i % P.core.length], role: 'plain' }));
  }
  const accents = emph.length === 1 ? [soloAccent(P)] : emph.map((_, k) => P.core[k % P.core.length]);
  const gray = deemphasisColor(P, accents);
  return series.map((s) => {
    const k = emph.indexOf(s.label);
    return k < 0 ? { color: gray, role: 'deemph' } : { color: accents[k], role: 'emph' };
  });
}

/** theme.palette (スキーマの形) を seriesColors が受ける平らな形にする。 */
export const flatPalette = (palette) => ({
  bg: palette.neutral.bg,
  line: palette.neutral.line,
  muted: palette.neutral.muted,
  highlight: palette.highlight,
  core: palette.core,
});
