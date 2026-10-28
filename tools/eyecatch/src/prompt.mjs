// prompt.mjs — nano banana に渡すプロンプトを組み立てる
//
// 記事ごとに変えるのは、場面 (scene) と季節の光 (light) の 2 つだけ。画風・色・構図は固定する。
// 位置は描かせない。モチーフを正方形の中央に描かせ、置き場所は place で決める。

const TEMPLATE = `Create a single minimalist hand-drawn illustration on paper.

FORMAT
Square 1:1. No text, letters, numbers, logos, or signage anywhere in the image.

COMPOSITION
The subject sits in the center of the canvas, occupying about 45% of the canvas width.
Leave plain empty paper around it on every side, at least 15% of the canvas from each edge; nothing touches the edges.
No border, frame, or rectangle around the image. No ground plane, wall, or wash of color that extends to the edges.

SUBJECT
{SCENE}
Show the scene through the objects around it, not through symbols or icons. Avoid clichés such as light bulbs, gears, rockets, or laptops with code on screen.
If a person appears, draw them small, faceless, seen from behind or in profile. They are a vessel for a feeling, not a specific individual.
One main subject and at most two supporting elements. Do not add windows, walls, or extra figures beyond what is described.

STYLE
Delicate, slightly imperfect hand-drawn lines in pale chalk or white colored pencil.
A few bold, flat gouache-style color shapes with visible brush marks and slightly irregular, organic edges.
Rough dark charcoal-brown paper with subtle grain, like black drawing paper or dark kraft board. Genuinely handmade, quiet, and unhurried, like a picture book page set at night.

COLOR
Paper: very dark warm charcoal #2c2721, evenly toned across the whole canvas. Never pure black, never blue-black.
Line: warm off-white #ebe5d8.
Muted fills: warm gray #5a5247.
At most two accent colors, chosen from: ember orange #f47d3a, moss green #7a8c5e, smoke gray #7c8590, pale moon blue #c8d4e0.
Use ember orange sparingly, as a single small point of warmth, like a fire seen in the dark.
{LIGHT}

MOOD
Quiet, poetic, refined, minimal, innocent, relaxed, thoughtful.`;

export function buildPrompt({ scene, light }) {
  if (!scene?.trim()) throw new Error('場面 (--scene) が空');
  if (!light?.trim()) throw new Error('季節の光 (--light) が空');
  return TEMPLATE.replace('{SCENE}', scene.trim()).replace('{LIGHT}', light.trim());
}
