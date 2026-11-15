#!/usr/bin/env node
// tools/notes/cli.mjs sync の偽物。slugs.json から名前を引き、アーカイブに記事を 1 本作る
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const archive = process.env.HOKUCHI_ARCHIVE
const key = process.argv[process.argv.indexOf('--only') + 1]
const slug = JSON.parse(readFileSync(join(archive, 'slugs.json'), 'utf8'))[key]
const dir = join(archive, `2026-11-15-${slug}`)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'index.md'), `---\ntitle: 公開した題\nnote_url: https://note.com/someone/n/${key}\npublished_at: 2026-11-15\n---\n\n本文\n`)
