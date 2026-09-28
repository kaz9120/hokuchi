// Slide.jsx — 1 枚の外枠。背景・章ラベル・本体・ブランド枠を重ねる。
//
// ブランド枠 (ADR-0010) は舞台の外側にあり、role が背景グループを決め、
// それ以外はテーマが決める。背景の foreground: light は前景を白系に反転させる
// (.inv)。
//
// push で連なるスライド列 (SPEC §7.2) では、章ラベル・ロゴ・フッタを外す。
// 画面ごと押し出す遷移のつなぎ目に装飾が挟まると、パノラマが切れて見える
// (p.212)。判定は renderDeck が ctx.inPush に入れる。

import path from 'node:path';

/** role → ブランド背景のグループ (ADR-0010)。 */
const roleGroup = (role) => (role === 'opener' || role === 'closer' ? 'bumper' : role);

/** そのスライドに割り当たるブランド背景。無ければ null。 */
export function brandBackground(ctx, slide) {
  return ctx.brand?.backgrounds?.[roleGroup(slide.role)] || null;
}

function BrandFrame({ slide, ctx, inverted }) {
  const b = ctx.brand;
  if (!b) return null;
  const isBumper = slide.role === 'opener' || slide.role === 'closer';
  const showLogo = b.logo && (b.logo.placement === 'all' || isBumper);
  const logoSrc = showLogo && inverted && b.logo.src_invert ? b.logo.src_invert : b.logo?.src;
  return (
    <>
      {showLogo && (
        <img
          className="brand-logo"
          src={ctx.useAsset(path.resolve(ctx.themeDir, logoSrc), 'theme-assets')}
          alt=""
          style={{ height: b.logo.height ?? 24 }}
        />
      )}
      {b.footer && <div className="brand-footer">{b.footer}</div>}
    </>
  );
}

export function Slide({ slide, ctx, children }) {
  const bg = brandBackground(ctx, slide);
  const inverted = bg?.foreground === 'light';
  const isBumper = slide.role === 'opener' || slide.role === 'closer';
  return (
    <div className={inverted ? 'slide inv' : 'slide'}>
      {bg && (
        <img
          className="bg"
          src={ctx.useAsset(path.resolve(ctx.themeDir, bg.src), 'theme-assets')}
          alt=""
        />
      )}
      {slide.chapter && !isBumper && !ctx.inPush && <div className="chapter">{slide.chapter}</div>}
      {children}
      {!ctx.inPush && <BrandFrame slide={slide} ctx={ctx} inverted={inverted} />}
    </div>
  );
}
