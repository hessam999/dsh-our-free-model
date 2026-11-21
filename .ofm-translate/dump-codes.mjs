import { readFileSync } from 'node:fs'

const dir = 'packages/standalone/frontend/'
for (const file of process.argv.slice(2)) {
  console.log('=== ' + file)
  const lines = readFileSync(dir + file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/[\u4e00-\u9fff]/.test(line)) return
    const marked = line
      .replace(/[\u4e00-\u9fff]/g, c => c + '[' + c.codePointAt(0).toString(16) + ']')
      .replace(/[^\x20-\x7e]/g, c => '{' + c.codePointAt(0).toString(16) + '}')
    console.log(i + 1 + ': ' + marked)
  })
}