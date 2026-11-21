import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const skip = /node_modules|[\\/]\.git[\\/]|packages[\\/]standalone[\\/]web/
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const f = join(d, e.name)
  if (skip.test(f)) return []
  return e.isDirectory() ? walk(f) : [f]
})
for (const f of walk('.')) {
  let t
  try { t = readFileSync(f, 'utf8') } catch { continue }
  if (/\bDICT\b/.test(t)) console.log('DICT', '\t', f, t.length)
  if (/ofm-shared-client/.test(t)) console.log('SHARED', '\t', f)
}
