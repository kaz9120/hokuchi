// jsx-hooks.mjs — Node module customization hook that compiles .jsx on import.
//
// ADR-0018 でレンダラを React コンポーネントに移すにあたり、ビルド生成物を
// リポジトリに置かずに済ませるための仕組み。cli.mjs が起動時に
// `module.register()` でこのフックを登録し、以降 `.jsx` の import は
// esbuild が実行時に変換する。esbuild の変換は 1 ファイル数 ms で、CLI の
// 起動体験を損なわない。
//
// jsx: 'automatic' なので、コンポーネント側で React を import する必要はない。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.jsx')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'esm',
    target: 'node22',
    sourcefile: filename,
    sourcemap: 'inline',
  });
  return { format: 'module', source: code, shortCircuit: true };
}
