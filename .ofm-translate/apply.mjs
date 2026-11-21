import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = process.argv[2]
const files = process.argv.slice(3)
const global = JSON.parse(readFileSync(join(here, 'global.json'), 'utf8'))
const cjk = line => /[\u4e00-\u9fff]/.test(line)
const esc = s => s.replace(/[^\x20-\x7e]/g, c => '{' + c.codePointAt(0).toString(16) + '}')

for (const file of files) {
  const target = join(frontend, file)
  const mapPath = join(here, file.replace(/[\\/]/g, '__') + '.json')
  const fileMap = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {}
  const merged = { ...global, ...fileMap }
  const keys = Object.keys(merged).sort((a, b) => b.length - a.length || a.localeCompare(b))
  let text = readFileSync(target, 'utf8')
  const before = text
  const misses = []
  let applied = 0
  for (const key of keys) {
    const parts = text.split(key)
    const n = parts.length - 1
    if (n === 0) { misses.push(key); continue }
    applied++
    text = parts.join(merged[key])
  }
  if (text !== before) writeFileSync(target, text)
  const left = text.split('\n').map((line, i) => [i + 1, line]).filter(([, line]) => cjk(line))
  console.log(`\n=== ${file} === applied ${applied}/${keys.length} keys`)
  if (misses.length) console.log('  MISS: ' + misses.map(esc).join(' || '))
  console.log(`  LEFTOVER CJK LINES: ${left.length}`)
  for (const [n, line] of left) console.log(`    ${n}: ${esc(line.trim().slice(0, 170))}`)
}
