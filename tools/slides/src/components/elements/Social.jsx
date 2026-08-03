// Social.jsx — SNS ポストの引用と記事の紹介 (SPEC §6.8 / §6.9)。
//
// どちらも面を持つカードなので、濃色背景での反転 (.inv) は要らない。

import fs from 'node:fs';
import path from 'node:path';
import { InlineText } from '../InlineText.jsx';

/** avatar 未指定・未解決のときはイニシャルの円で代替する (SPEC §6.8)。 */
function Avatar({ el, ctx, size }) {
  const abs = el.avatar ? path.resolve(ctx.deckDir, el.avatar) : null;
  if (abs && fs.existsSync(abs)) {
    return (
      <img
        className="post-avatar"
        src={ctx.useAsset(abs, 'assets')}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = [...String(el.author || '?')][0] || '?';
  return (
    <div
      className="post-avatar post-avatar-fallback"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </div>
  );
}

/**
 * post — SNS ポストの引用 (SPEC §6.8)。
 *
 * 漸進的強化 (ADR-0017): source を持つ post だけ、カードの上に X の実埋め込みを
 * 重ねる下地を出す。静的出力 (shot / file://) では埋め込みスクリプトが動かず
 * .post-embed は visibility:hidden のままなので、カードがそのまま写る。
 * フォールバックではなく初期表示がカードである (決定 3)。
 */
export function Post({ el, ctx, fsBody, fsAuthor, fsMeta, avatarSize, headGap }) {
  const meta = [el.handle, el.date].filter(Boolean).join('　·　');
  const card = (
    <div className="post-card">
      <div className="post-head" style={{ gap: headGap }}>
        <Avatar el={el} ctx={ctx} size={avatarSize} />
        <div className="post-head-text">
          <div className="post-author jp" style={{ fontSize: fsAuthor }}>
            <InlineText text={el.author} />
          </div>
          {meta && <div className="post-meta" style={{ fontSize: fsMeta }}>{meta}</div>}
        </div>
      </div>
      <div className="post-body jp" style={{ fontSize: fsBody }}>
        <InlineText text={el.text} />
      </div>
    </div>
  );
  if (!el.source) return card;
  return (
    <div className="post-wrap">
      {card}
      <div className="post-embed" data-post-source={el.source}>
        <blockquote className="twitter-tweet"><a href={el.source} /></blockquote>
      </div>
    </div>
  );
}

/** link — OGP カード + QR (SPEC §6.9)。QR は常に url から導出する。 */
export function Link({ el, ctx, leftW, qrBox, hasImage, abs, imgH, fsTitle, fsDesc, fsUrl, gap, qrSvg }) {
  const showImage = hasImage && abs && fs.existsSync(abs);
  return (
    <div className="link-card" style={{ gap }}>
      <div className="link-left jp" style={{ width: leftW }}>
        {showImage && (
          <img
            className="link-img"
            src={ctx.useAsset(abs, 'assets')}
            alt=""
            style={{ width: leftW, height: imgH }}
          />
        )}
        {el.title && (
          <div className="link-title" style={{ fontSize: fsTitle }}>
            <InlineText text={el.title} />
          </div>
        )}
        {el.description && (
          <div className="link-desc" style={{ fontSize: fsDesc }}>
            <InlineText text={el.description} />
          </div>
        )}
        <div className="link-url" style={{ fontSize: fsUrl }}>{el.url}</div>
      </div>
      <div
        className="link-qr"
        style={{ width: qrBox, height: qrBox }}
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
    </div>
  );
}
