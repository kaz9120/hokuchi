// ProfileStage.jsx — 自己紹介の定型 (SPEC §5.1 profile-stage)。
//
// 見出し = 氏名 + 所属、左 = 丸抜きの写真 + ハンドル、右 = 略歴。略歴の各項は
// 「ラベル ── 本文」の前置きを持てる。

import fs from 'node:fs';
import path from 'node:path';
import { boxStyleObj, stageRect } from '../geometry.mjs';
import { iconExists, iconInner } from '../icons.mjs';
import { InlineText } from './InlineText.jsx';

// 写真+略歴という縦に短いコンテンツを縦長の body 領域に置くと、光学中心でも
// 中央寄りに沈んで見える (レビュー指摘 2026-07-09)。上詰めに振った専用値。
const PROFILE_TOP = 0.25;

function Portrait({ portrait, ctx, size }) {
  if (!portrait) return null;
  const abs = portrait.src ? path.resolve(ctx.deckDir, portrait.src) : null;
  const style = { width: size, height: size };
  if (abs && fs.existsSync(abs)) {
    return <img className="profile-portrait" src={ctx.useAsset(abs, 'assets')} alt="" style={style} />;
  }
  return <div className="profile-portrait ph jp" style={style}>{portrait.prompt || ''}</div>;
}

function BioItem({ item }) {
  const parts = String(item).split('──');
  const label = parts.length > 1 ? parts[0].trim() : null;
  const body = parts.length > 1 ? parts.slice(1).join('──').trim() : String(item);
  return (
    <div className="profile-item">
      {label && <div className="profile-label">{label}</div>}
      <div className="profile-body jp"><InlineText text={body} /></div>
    </div>
  );
}

export function ProfileStage({ slide, ctx }) {
  const stage = stageRect();
  const get = (slot) => slide.elements.find((e) => e.slot === slot);
  const portrait = get('portrait');
  const name = get('name');
  const affiliation = get('affiliation');
  const handle = get('handle');
  const bio = get('bio');

  const headH = Math.round(ctx.scale.heading * 1.5 + (affiliation ? ctx.scale.attribution * 1.7 : 0) + 20);
  const gap = 44; // ゆとり: 肩書きと本文ブロックの間 (レビュー指摘 2026-07-06)
  const header = { x: stage.x, y: stage.y, w: stage.w, h: headH };
  const body = { x: stage.x, y: stage.y + headH + gap, w: stage.w, h: stage.h - headH - gap };
  const leftW = Math.round(body.w * 0.42);
  const colGap = 80;
  const left = { x: body.x, y: body.y, w: leftW, h: body.h };
  const right = { x: body.x + leftW + colGap, y: body.y, w: body.w - leftW - colGap, h: body.h };

  const handleH = handle ? ctx.scale.node * 2 : 0;
  const size = Math.round(Math.min(left.w - 24, left.h - handleH - 24, 330));
  const topSpacer = <div style={{ flex: `${PROFILE_TOP} 0 0` }} />;
  const bottomSpacer = <div style={{ flex: `${1 - PROFILE_TOP} 0 0` }} />;

  return (
    <>
      <div className="pane" style={boxStyleObj(header)}>
        <div className="profile-name jp" style={{ fontSize: Math.round(ctx.scale.heading * 1.2) }}>
          <InlineText text={name.text} emphasis={name.emphasis} />
        </div>
        {affiliation && (
          <div className="profile-affil jp" style={{ fontSize: ctx.scale.attribution }}>
            <InlineText text={affiliation.text} />
          </div>
        )}
      </div>
      <div className="pane profile-left" style={boxStyleObj(left)}>
        {topSpacer}
        <Portrait portrait={portrait} ctx={ctx} size={size} />
        {handle && (
          <div className="profile-handle jp" style={{ fontSize: ctx.scale.node }}>
            {handle.icon && iconExists(handle.icon) && (
              <svg
                className="inline-icon"
                viewBox="0 0 256 256"
                fill="currentColor"
                dangerouslySetInnerHTML={{ __html: iconInner(handle.icon, ctx.iconWeight) }}
              />
            )}
            <InlineText text={handle.text} />
          </div>
        )}
        {bottomSpacer}
      </div>
      <div className="pane profile-right" style={boxStyleObj(right)}>
        {topSpacer}
        {(bio?.items || []).map((it, i) => <BioItem key={i} item={it} />)}
        {bottomSpacer}
      </div>
    </>
  );
}
