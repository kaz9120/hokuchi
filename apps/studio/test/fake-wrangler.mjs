#!/usr/bin/env node
// wrangler の偽物。本物の公開はしない。呼ばれたことをログに残す
import { appendFileSync } from 'node:fs'
appendFileSync(process.env.FAKE_WRANGLER_LOG, process.argv.slice(2).join(' ') + '\n')
