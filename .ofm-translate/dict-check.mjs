import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const t = readFileSync('client.js', 'utf8')
const start = t.indexOf('const DICT = {')
const open = t.indexOf('{', start)
let i = open, depth = 0, quote = null
for (; i < t.length; i++) {
  const c = t[i], prev = t[i - 1]
  if (quote) {
    if (c === '\\') { i++; continue }
    if (c === quote) quote = null
    continue
  }
  if (c === "'" || c === '"' || c === '`') { quote = c; continue }
  if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; continue }
  if (c === '/' && t[i + 1] === '*') { while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) i++; i++; continue }
  if (c === '{') depth++
  else if (c === '}') { depth--; if (depth === 0) break }
}
const literal = t.slice(open, i + 1)
const dict = vm.runInNewContext('(' + literal + ')')
console.log('top-level locales:', Object.keys(dict))
for (const k of Object.keys(dict)) console.log(' ', k, Object.keys(dict[k]).length)
const zh = Object.keys(dict.zh ?? {})
for (const k of Object.keys(dict)) {
  if (k === 'zh') continue
  const other = new Set(Object.keys(dict[k] ?? {}))
  const missing = zh.filter(key => !other.has(key))
  console.log(`locale ${k}: missing ${missing.length} of zh keys -> ${missing.slice(0, 20).join(', ')}`)
}
