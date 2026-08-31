// markdown.mjs — 中間表現から index.md を書き出す。
//
// index.md は source.json から決定的に導かれる生成物で、人が手で直す場所では
// ない。だから「復元できるか」より「読めるか」を優先してよい。復元の責任は
// source.json が負う (ADR-0019)。
// ただし埋め込みだけは例外で、素の URL に潰すと種別が失われるため
// `:::embed{service="..." url="..."}` ディレクティブで残す。

// ---------------------------------------------------------------------------
// YAML front matter (依存を足さないための最小実装)
// ---------------------------------------------------------------------------
const needsQuote = (s) =>
  s === '' || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /: |\s$|^\s/.test(s) || /^(true|false|null|~|\d)/i.test(s);

const yamlString = (s) => (needsQuote(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s);

function frontMatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const v of value) lines.push(`  - ${yamlString(String(v))}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlString(String(value))}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// インライン
// ---------------------------------------------------------------------------
// 日本語の本文でエスケープが要るのは、Markdown の記法と衝突する記号だけ。
// 過剰にエスケープすると読めなくなるので、実害のある文字に絞る。
// 「_」は CommonMark では単語の内側で強調にならない (@MOSHinc_jp のような ID が
// そのまま書ける)。「>」は行頭だけが引用記号なので guardLineStarts に任せる。
const escapeText = (s) =>
  s.replace(/([\\`*[\]<])/g, '\\$1');

function inlineToMd(inline, { escape = true } = {}) {
  let out = '';
  for (const node of inline) {
    switch (node.t) {
      case 'text': out += escape ? escapeText(node.v) : node.v; break;
      case 'br': out += '  \n'; break;
      case 'strong': out += `**${inlineToMd(node.children, { escape })}**`; break;
      case 'em': out += `*${inlineToMd(node.children, { escape })}*`; break;
      case 'code': out += `\`${inlineToMd(node.children, { escape: false })}\``; break;
      case 'link': {
        const label = inlineToMd(node.children, { escape });
        const plain = label.replace(/\\(.)/g, '$1');
        if (node.href === '') out += label;
        else if (plain === node.href) out += `<${node.href}>`;
        else out += `[${label}](${node.href})`;
        break;
      }
    }
  }
  return out;
}

// 段落の行頭が Markdown の記法に化けるのを防ぐ (「- 」で始まる本文など)。
const guardLineStarts = (s) =>
  s.split('\n').map((line) => line.replace(/^(\s*)([-+>]|#{1,6}\s|\d+\.)/, '$1\\$2')).join('\n');

const prefixLines = (text, prefix) =>
  text.split('\n').map((l) => (l === '' ? prefix.trimEnd() : prefix + l)).join('\n');

// キャプションはイタリックの 1 行にする。中のリンクは Markdown のリンクとして
// 残す (テキストに潰すと URL が消える)。改行が入ると囲みが壊れるので空白に寄せる。
const captionToMd = (caption) =>
  Array.isArray(caption) && caption.length
    ? inlineToMd(caption).replace(/\s*\n\s*/g, ' ').trim()
    : '';

// ---------------------------------------------------------------------------
// 埋め込み
// ---------------------------------------------------------------------------
function embedToMd(block) {
  const attrs = [`service="${block.service}"`, `url="${block.url}"`];
  const body = [];

  // 埋め込み先のテキストは他人が書いた文で、「## 」や「- 」で始まることがある。
  // ディレクティブの中でも Markdown として解釈されるのでガードする。
  const safe = (s) => guardLineStarts(escapeText(s));
  if (block.service === 'twitter') {
    if (block.text) body.push(prefixLines(safe(block.text), '> '));
    if (block.byline) body.push(`> — ${escapeText(block.byline)}`);
  } else if (block.service === 'external-article') {
    if (block.title) body.push(`**${escapeText(block.title)}**`);
    if (block.description) body.push(safe(block.description));
    if (block.site) body.push(escapeText(block.site));
  } else if (block.title) {
    body.push(`**${escapeText(block.title)}**`);
  }

  const inner = body.length ? `\n${body.join('\n')}\n` : '\n';
  return `:::embed{${attrs.join(' ')}}${inner}:::`;
}

// ---------------------------------------------------------------------------
// ブロック
// ---------------------------------------------------------------------------
function blockToMd(block) {
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${inlineToMd(block.inline).replace(/\s+/g, ' ').trim()}`;
    case 'paragraph':
      return guardLineStarts(inlineToMd(block.inline).trim());
    case 'image': {
      const alt = escapeText(block.alt ?? '');
      let img = `![${alt}](${block.localPath ?? block.src})`;
      if (block.link) img = `[${img}](${block.link})`;
      const cap = captionToMd(block.caption);
      return cap ? `${img}\n*${cap}*` : img;
    }
    case 'embed':
      return embedToMd(block);
    case 'quote': {
      const inner = block.blocks.map(blockToMd).join('\n\n');
      const quoted = prefixLines(inner, '> ');
      const cap = captionToMd(block.caption);
      return cap ? `${quoted}\n*${cap}*` : quoted;
    }
    case 'list':
      return block.items
        .map((item, i) => {
          const marker = block.ordered ? `${i + 1}. ` : '- ';
          const text = inlineToMd(item).trim();
          return prefixLines(text, ' '.repeat(marker.length)).replace(/^\s+/, marker);
        })
        .join('\n');
    case 'code': {
      // コードの中に ``` が入っていることがある (Markdown を扱う記事など)。
      // CommonMark に従い、中身より長いフェンスで囲む。
      const longest = Math.max(0, ...[...block.text.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return `${fence}\n${block.text}\n${fence}`;
    }
    case 'hr':
      return '---';
    case 'toc':
      return ':::toc\n:::';
    case 'unknown':
      return `:::unknown{tag="${block.tag}"}\n${block.text}\n:::`;
    default:
      return '';
  }
}

/**
 * 記事メタ + ブロック配列から index.md の中身を作る。
 * @param {object} meta - front matter に載せるフィールド
 * @param {Array} blocks - parseNote が返すブロック
 */
export function toMarkdown(meta, blocks) {
  const body = blocks.map(blockToMd).filter((s) => s !== '').join('\n\n');
  return `${frontMatter(meta)}\n\n${body}\n`;
}
