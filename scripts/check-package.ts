/**
 * Release gate for the published CLI: packs the package exactly as npm would,
 * asserts the artifact shape (bundle embedded, no sources/tests), and re-checks
 * the embedded content hash that the launcher verifies at runtime.
 *
 * Run with `pnpm verify:package` after `pnpm build`.
 * @module scripts/check-package
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const cliDir = join(root, 'packages', 'cli')

interface PackEntry {
  path: string
  size: number
}

/** The file list npm would publish, without running lifecycle scripts. */
function packList(): PackEntry[] {
  const out = execFileSync('npm', [
    'pack', '--dry-run', '--json', '--ignore-scripts',
    // A private cache keeps the check independent from a shared/root-owned ~/.npm.
    '--cache', process.env.DSH_TUI_NPM_CACHE ?? '/tmp/dsh-tui-npm-cache',
  ], {
    cwd: cliDir,
    encoding: 'utf8',
  })
  const parsed: unknown = JSON.parse(out.slice(out.indexOf('[')))
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('npm pack produced no entries')
  const first = parsed[0] as { files?: unknown }
  if (!Array.isArray(first.files)) throw new Error('npm pack produced no file list')
  return first.files.map((entry) => {
    const record = entry as { path?: unknown; size?: unknown }
    if (typeof record.path !== 'string') throw new Error('npm pack entry without a path')
    return { path: record.path, size: typeof record.size === 'number' ? record.size : 0 }
  })
}

/** Files that must be present for the launcher to work after `npm i -g`. */
const REQUIRED = [
  'package.json',
  'README.md',
  'LICENSE',
  'NOTICE.md',
  'lib/bin.js',
  'bundle/manifest.json',
  'bundle/package.json',
  'bundle/cordis.patch.yml',
  'bundle/lib/index.js',
  'bundle/lib/startup.js',
  'bundle/lib/prompt-service.js',
]

/** Path prefixes that must never ship: sources, tests, or nested installs. */
const FORBIDDEN_PREFIXES = ['src/', 'tests/', 'node_modules/', 'scripts/', 'tsconfig']
/** Path suffixes that must never ship, whatever directory holds them. */
const FORBIDDEN_SUFFIXES = ['.map', '.tsbuildinfo']

const failures: string[] = []
const files = packList()
const paths = new Set(files.map(file => file.path))

for (const required of REQUIRED) {
  if (!paths.has(required)) failures.push(`missing from the tarball: ${required}`)
}
for (const path of paths) {
  if (FORBIDDEN_PREFIXES.some(prefix => path.startsWith(prefix))
    || FORBIDDEN_SUFFIXES.some(suffix => path.endsWith(suffix))) {
    failures.push(`must not ship: ${path}`)
  }
}

// The launcher recomputes this digest before copying the bundle into a profile;
// a mismatch here would make every install fail on first boot. The three
// version strings ship together, so drift between them is a release bug the
// tarball check can catch before it publishes.
const bundleDir = join(cliDir, 'bundle')
const manifestPath = join(bundleDir, 'manifest.json')
const cliPackage = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8')) as { version?: unknown }
if (existsSync(manifestPath)) {
  const bundleManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown; hash?: unknown; files?: unknown }
  if (typeof bundleManifest.hash !== 'string' || !Array.isArray(bundleManifest.files)) {
    failures.push('bundle/manifest.json is incomplete')
  } else {
    const embedded = JSON.parse(readFileSync(join(bundleDir, 'package.json'), 'utf8')) as { version?: unknown }
    // The three version strings ship together: an embedded bundle older than
    // the launcher would install a stale TUI under a new version number.
    if (bundleManifest.version !== cliPackage.version) {
      failures.push(`bundle/manifest.json says ${String(bundleManifest.version)} but the CLI publishes ${String(cliPackage.version)}`)
    }
    if (embedded.version !== cliPackage.version) {
      failures.push(`the embedded bundle is ${String(embedded.version)} but the CLI publishes ${String(cliPackage.version)}`)
    }
    // Every file in bundle/ must be hashed, or an unlisted file would travel
    // in the tarball without the launcher ever verifying it.
    const listed = new Set(bundleManifest.files.filter((entry): entry is string => typeof entry === 'string'))
    const onDisk: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else onDisk.push(relative(bundleDir, path).split(sep).join('/'))
      }
    }
    walk(bundleDir)
    for (const file of onDisk) {
      if (!listed.has(file) && file !== 'manifest.json') failures.push(`bundle/${file} is not listed in bundle/manifest.json`)
    }
    const digest = createHash('sha256')
    for (const file of [...listed].sort((a, b) => a.localeCompare(b))) {
      digest.update(file)
      digest.update('\0')
      digest.update(readFileSync(join(bundleDir, ...file.split('/'))))
      digest.update('\0')
    }
    const actual = digest.digest('hex')
    if (actual !== bundleManifest.hash) {
      failures.push(`bundle content hash mismatch: manifest ${bundleManifest.hash.slice(0, 12)}…, files ${actual.slice(0, 12)}…`)
    }
  }
}

// Every published file must be listed by `files` in package.json, and every
// listed directory must exist, so a stale build cannot be published silently.
const cliFiles = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8')) as { files?: unknown }
if (!Array.isArray(cliFiles.files)) failures.push('packages/cli/package.json has no files list')
if (typeof cliPackage.version !== 'string') failures.push('packages/cli/package.json has no version')

const total = files.reduce((sum, file) => sum + file.size, 0)
process.stdout.write(`${files.length} files, ${(total / 1024).toFixed(1)} kB unpacked\n`)
for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
  process.stdout.write(`  ${file.path}\n`)
}

if (failures.length > 0) {
  process.stderr.write(`\npackage check failed:\n${failures.map(line => `  ✗ ${line}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('\npackage check passed\n')
}
