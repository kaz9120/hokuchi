// api.mjs — note.com の公開 API から記事を取ってくる。
//
// 記事一覧: /api/v2/creators/<urlname>/contents?kind=note&page=N
// 記事本文: /api/v3/notes/<key>   (body に完全な HTML、embedded_contents に埋め込みメタ)
//
// HTML をスクレイプすると埋め込みが描画後の姿でしか取れず、元 URL が失われる。
// API は figure の data-src と embedded_contents を保つので、忠実な取り込みは
// こちらを使う (ADR-0019)。

const UA = 'hokuchi-note/0.1 (+https://github.com/; personal archive)';

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** クリエイターの公開記事を新しい順に全件返す (key と公開日だけの軽い一覧)。 */
export async function listNotes(urlname, { delayMs = 800 } = {}) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const { data } = await getJSON(
      `https://note.com/api/v2/creators/${encodeURIComponent(urlname)}/contents?kind=note&page=${page}`
    );
    for (const c of data.contents) {
      items.push({ key: c.key, name: c.name, publishAt: c.publishAt, status: c.status, type: c.type });
    }
    if (data.isLastPage) break;
    await sleep(delayMs);
  }
  return items;
}

/** 記事 1 本の生レスポンスを返す。 */
export async function fetchNote(key) {
  const { data } = await getJSON(`https://note.com/api/v3/notes/${encodeURIComponent(key)}`);
  return data;
}

/**
 * API レスポンスから「記事として不変なもの」だけを取り出す。
 *
 * スキ数・コメント数・閲覧者ごとのフラグは記事の内容ではなく、残すと取り込みの
 * たびに差分が出る。ここで落とすのは同一性に関わらないフィールドだけで、本文
 * (body)・埋め込みメタ・見出し画像は丸ごと保つ。
 */
export function freezeNote(note) {
  return {
    id: note.id,
    key: note.key,
    slug: note.slug,
    type: note.type,
    status: note.status,
    format: note.format,
    name: note.name,
    description: note.description,
    body: note.body,
    separator: note.separator,
    publish_at: note.publish_at,
    created_at: note.created_at,
    note_url: note.note_url,
    price: note.price,
    is_limited: note.is_limited,
    is_trial: note.is_trial,
    eyecatch: note.eyecatch,
    eyecatch_alt: note.eyecatch_alt,
    eyecatch_width: note.eyecatch_width,
    eyecatch_height: note.eyecatch_height,
    hashtags: (note.hashtag_notes ?? []).map((h) => h.hashtag.name),
    pictures: note.pictures ?? [],
    embedded_contents: (note.embedded_contents ?? []).map((e) => ({
      key: e.key,
      url: e.url,
      service: e.service,
      identifier: e.identifier,
      caption: e.caption,
      html_for_embed: e.html_for_embed,
      html_for_display: e.html_for_display,
    })),
    user: { urlname: note.user?.urlname, nickname: note.user?.nickname },
    _fetched_at: new Date().toISOString(),
  };
}
