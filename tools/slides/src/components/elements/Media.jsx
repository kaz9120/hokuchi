// Media.jsx — 写真・動画・脱出口 (SPEC §6.3 / §6.14 / §6.15)。

import fs from 'node:fs';
import path from 'node:path';

const SUBJECT_POS = { 'third-left': '33% 50%', 'third-right': '67% 50%' };

/** 実画像が無いときの箱。生成プロンプトを画像仕様として見せる (ADR-0006)。 */
export function ImagePlaceholder({ el, ctx }) {
  return (
    <div className="img-ph">
      <div className="img-corner tl" />
      <div className="img-corner tr" />
      <div className="img-corner bl" />
      <div className="img-corner br" />
      <div className="img-badge">IMAGE · prompt</div>
      <div className="img-inner">
        <svg
          width="52" height="52" viewBox="0 0 24 24"
          fill="none" stroke={ctx.C.muted} strokeWidth="1.4" style={{ opacity: 0.85 }}
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.8" />
          <path d="M3 17l5-4 4 3 4-4 5 4" />
        </svg>
        <div className="img-prompt">{el.prompt || ''}</div>
      </div>
    </div>
  );
}

/** src が宣言されていてもファイルが未着なら、render 全体を失敗させずに
 * プレースホルダへ落とす。 */
function resolveSrc(el, ctx) {
  if (!el.src) return null;
  const abs = path.resolve(ctx.deckDir, el.src);
  return fs.existsSync(abs) ? abs : null;
}

/** grid-direct のセルに置く写真 (SPEC §6.3)。 */
export function ImageElement({ el, ctx }) {
  const abs = resolveSrc(el, ctx);
  if (!abs) return <ImagePlaceholder el={el} ctx={ctx} />;
  const src = ctx.useAsset(abs, 'assets');
  const style = { objectPosition: SUBJECT_POS[el.subject] || '50% 50%' };
  if (el.treatment === 'framed') {
    return <div className="photo-framed"><img className="photo" src={src} alt="" style={style} /></div>;
  }
  if (el.treatment === 'cutout') {
    return <div className="photo-cutout"><img className="photo contain" src={src} alt="" style={style} /></div>;
  }
  return <img className="photo" src={src} alt="" style={style} />; // full-bleed (既定)
}

/** image-stage の写真 (ADR-0015)。実寸比の箱に収まるので object-position は不要。 */
export function StagePhoto({ el, ctx }) {
  const abs = resolveSrc(el, ctx);
  if (!abs) return <ImagePlaceholder el={el} ctx={ctx} />;
  const img = <img className="stage-photo" src={ctx.useAsset(abs, 'assets')} alt="" />;
  // framed はスクリーンショットに面のパネルを敷く既存の見た目を流用
  return el.treatment === 'framed' ? <div className="photo-framed">{img}</div> : img;
}

/**
 * video — 静止プレースホルダ (SPEC §6.14)。再生グリフは線描のみでベタ塗りに
 * しない。背後の半透明円は、ポスター写真の上でも線が読めるための土台。
 * fallback のファイル名はグリフの下に縦積みする — 同じ中心に重ねると文字が
 * グリフを貫通して読めない (レビュー指摘 2026-07-08)。
 */
export function Video({ el, ctx }) {
  const abs = el.poster ? path.resolve(ctx.deckDir, el.poster) : null;
  const hasPoster = abs && fs.existsSync(abs);
  return (
    <div className="video-box">
      {hasPoster && <img className="video-poster" src={ctx.useAsset(abs, 'assets')} alt="" />}
      <div className="video-center">
        <svg className="video-glyph" viewBox="0 0 100 100" width="88" height="88">
          <circle cx="50" cy="50" r="46" fill="rgba(0,0,0,.3)" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={ctx.C.text} strokeWidth="3" />
          <path
            d="M43 33 L71 50 L43 67 Z"
            fill="none" stroke={ctx.C.text} strokeWidth="3" strokeLinejoin="round"
          />
        </svg>
        {!hasPoster && <div className="video-fallback jp">{path.basename(el.src)}</div>}
      </div>
    </div>
  );
}

/** raw — 語彙で表せない 1 枚のための口 (SPEC §6.15)。中身は書き手の SVG /
 * HTML そのものなので、ここだけは生のまま流し込む。 */
export function Raw({ el, ctx }) {
  let html = el.html;
  if (!html) {
    const s = String(el.svg || '').trim();
    if (!s) return null;
    html = s.startsWith('<svg') ? s : fs.readFileSync(path.resolve(ctx.deckDir, s), 'utf8');
  }
  return <div className="raw-wrap" dangerouslySetInnerHTML={{ __html: html }} />;
}
