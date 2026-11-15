#!/usr/bin/env node
// apps/slides/build.mjs の偽物。--accept が無ければ、見た目が変わったとして止まる
if (!process.argv.includes('--accept')) {
  console.error('見た目が変わった状態が 2 件あります')
  process.exit(1)
}
console.log('組み立てました')
