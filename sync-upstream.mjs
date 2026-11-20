#!/usr/bin/env node
/**
 * Pull upstream's new work into this fork without losing the English translation.
 *
 * Why this exists: this fork translates *source* files (packages/standalone/frontend/**,
 * worker/**, packages/standalone/README.md), while upstream keeps regenerating build
 * output (packages/standalone/web/**), the signed release manifests (catalog/**,
 * feed/manifest.json), lockfiles, and the announcement feed. Every one of those
 * conflicts on each sync, and none of them should be translated by hand:
 *
 *   - packages/standalone/web/**  is vite output — rebuilt below from the sources.
 *   - feed/announcements.json     is fetched live from upstream's `main` at runtime
 *                                 (DEFAULT_FEED_SOURCES in src/feed.js) and is not
 *                                 even in package.json "files", so a local
 *                                 translation of it is never read by the plugin.
 *   - catalog/**, feed/manifest.json, package-lock.json are generated/signed.
 *
 * So those are taken from upstream verbatim, the bundles are rebuilt from the
 * translated sources, and only genuine source conflicts are left for a human.
 *
 * Usage:
 *   node sync-upstream.mjs                # fetch + merge + rebuild + commit
 *   node sync-upstream.mjs --no-build     # skip the vite rebuild
 *   node sync-upstream.mjs --resume       # a merge stalled on real conflicts: finish it
 *   node sync-upstream.mjs --upstream=upstream
 */

import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const flag = name => argv.includes(name)
const option = (name, fallback) => {
  const hit = argv.find(value => value.startsWith(`${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 1)
}

const upstream = option('--upstream', 'upstream')
const resume = flag('--resume')
const build = !flag('--no-build')

function git(args, { inherit = false } = {}) {
  return execFileSync('git', args, inherit ? { stdio: 'inherit' } : { encoding: 'utf8' })
}
function tryGit(args) {
  try {
    git(args)
    return true
  } catch {
    return false
  }
}
function fail(message) {
  console.error(`\nsync-upstream: ${message}`)
  process.exit(1)
}
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean)

/** Files this fork must never translate by hand; upstream's copy always wins. */
const GENERATED = [
  /^feed\/announcements\.json$/,
  /^feed\/manifest\.json$/,
  /^catalog\//,
  /^package-lock\.json$/,
  /^packages\/[^/]+\/package-lock\.json$/,
  /^packages\/standalone\/web\//,
]

if (resume) {
  if (!tryGit(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])) {
    fail('--resume needs a merge in progress (no MERGE_HEAD found)')
  }
} else {
  const dirty = lines(git(['status', '--porcelain']))
  if (dirty.length > 0) fail(`working tree is dirty; commit or stash first:\n  ${dirty.join('\n  ')}`)

  console.log(`fetching ${upstream}…`)
  if (!tryGit(['fetch', `${upstream}`])) {
    fail(`could not reach the ${upstream} remote — check your network, then run this again`)
  }
  console.log(`merging ${upstream}/main…`)
  if (!tryGit(['merge', '--no-edit', `${upstream}/main`])) {
    console.log('merge reported conflicts — resolving the generated ones automatically…')
  }
}

const conflicted = () => lines(git(['diff', '--name-only', '--diff-filter=U']))

let conflicts = conflicted()
if (conflicts.length > 0) {
  const generated = conflicts.filter(path => GENERATED.some(pattern => pattern.test(path)))
  if (generated.length > 0) {
    git(['checkout', '--theirs', '--', ...generated], { inherit: true })
    git(['add', '--', ...generated], { inherit: true })
    for (const path of generated) console.log(`  kept upstream's copy: ${path}`)
  }
}

conflicts = conflicted()
if (conflicts.length > 0) {
  console.log('\nThese files were changed on both sides and need a human:')
  for (const path of conflicts) console.log(`  ${path}`)
  console.log(
    '\nOpen each one, keep your English while taking upstream\'s new code\n' +
      '(resolve every <<<<<<< / ======= / >>>>>>> block), then:\n' +
      '  git add <file> && node sync-upstream.mjs --resume',
  )
  process.exit(1)
}

if (build) {
  console.log('\nrebuilding the standalone console from the translated sources…')
  // Run the build script with node directly: `npm.cmd` cannot be spawned without a
  // shell on Windows (Node >= 20.12 blocks it), and `npm run` only wraps this call.
  execFileSync(process.execPath, ['scripts/build-standalone-ui.mjs'], { stdio: 'inherit' })
  git(['add', '-A', 'packages/standalone/web'], { inherit: true })
}

if (tryGit(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'])) {
  git(['commit', '--no-edit'], { inherit: true })
}

console.log(`\nDone. What still differs from ${upstream}/main is your translation only:`)
git(['diff', '--stat', `${upstream}/main`], { inherit: true })
console.log(`\nPublish it with:  git push origin HEAD`)
