/**
 * Compatibility gate: proves this tree really targets the pinned DeepSeek
 * Harness release, that the bundle still carries no DSH packages, that every
 * `@deepseek-ai/*` import is declared, and that every plugin the bundle patch
 * names exists in the pinned installation.
 *
 * This is the check to run (and to fix) when bumping the pinned release.
 * @module scripts/verify-compat
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { satisfiesRange } from '../packages/cli/src/launcher/semver.ts'

/** The release this project supports. Bump all three values together. */
const PIN = {
  dshVersion: '0.2.2-rc.5',
  tag: 'dsh-v0.2.2-rc.5',
  commit: '9c2670d3bce5275e0d1610272958121af87787bb',
} as const

const root = fileURLToPath(new URL('..', import.meta.url))
const bundleDir = join(root, 'packages', 'bundle')
const cliDir = join(root, 'packages', 'cli')
const upstream = join(root, 'upstream', 'deepseek-harness')

interface Check {
  name: string
  ok: boolean
  detail: string
}

const checks: Check[] = []
const check = (name: string, ok: boolean, detail: string): void => {
  checks.push({ name, ok, detail })
}

/** Run git in the upstream checkout. */
function git(...args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return undefined
  }
}

/** Read a JSON file with a typed cast, failing the check on malformed input. */
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

// 1. The reference checkout is the pinned release.
const head = git('rev-parse', 'HEAD')
check(
  'upstream checkout pinned',
  head === PIN.commit,
  head === undefined ? 'upstream/deepseek-harness is missing (git submodule update --init)' : `${PIN.tag} @ ${head.slice(0, 12)}`,
)

// 2. The published launcher depends on exactly the pinned runtime.
const cliManifest = readJson<{ dependencies?: Record<string, string>; files?: unknown; version?: string }>(join(cliDir, 'package.json'))
const runtimeDep = cliManifest.dependencies?.['@deepseek-ai/dsh']
check('launcher runtime pin', runtimeDep === PIN.dshVersion, `@deepseek-ai/dsh = ${String(runtimeDep)}`)

// 3. The bundle's engine range admits the pinned runtime (the dsh loader's own
//    admission check would otherwise skip the bundle with exit 0).
const bundleManifest = readJson<{
  engines?: { dsh?: string }
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  exports?: Record<string, string>
  dsh?: { bundle?: { patch?: unknown } }
}>(join(bundleDir, 'package.json'))
const engineRange = bundleManifest.engines?.dsh
check(
  'bundle engines.dsh',
  engineRange !== undefined && satisfiesRange(PIN.dshVersion, engineRange),
  `engines.dsh = ${String(engineRange)} admits ${PIN.dshVersion}`,
)

// 4. Design invariant: the bundle must never carry a DSH package, or the
//    profile copy would shadow the installation's single core.
const carried = Object.keys(bundleManifest.dependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/'))
check('bundle carries no dsh packages', carried.length === 0, carried.length === 0 ? 'dependencies is empty of @deepseek-ai/*' : carried.join(', '))
check(
  'artifact has no node_modules',
  !existsSync(join(cliDir, 'bundle', 'node_modules')),
  'the embedded copy (what a profile receives) installs its own packages',
)

// 5. Every DSH import in the sources is declared as a devDependency (for local
//    typecheck) and as a peer (for the profile's runtime resolution).
const sources = collectSources(join(bundleDir, 'src'))
const imported = new Set<string>()
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/from\s+'(@deepseek-ai\/[a-z0-9-]+)'/gu)) {
    if (match[1] !== undefined) imported.add(match[1])
  }
}
const undeclaredDev = [...imported].filter(name => bundleManifest.devDependencies?.[name] !== PIN.dshVersion && name !== '@deepseek-ai/cordis' && name !== '@deepseek-ai/schemastery')
const missingPeer = [...imported].filter(name => bundleManifest.peerDependencies?.[name] === undefined)
check(
  'dsh imports declared',
  undeclaredDev.length === 0 && missingPeer.length === 0,
  undeclaredDev.length === 0 && missingPeer.length === 0
    ? `${imported.size} packages imported, all declared`
    : `dev: ${undeclaredDev.join(', ') || '-'} · peer: ${missingPeer.join(', ') || '-'}`,
)

// 6. Every plugin the patch inserts must exist in the pinned installation,
//    otherwise the profile fails to boot after an upstream rename.
const patchPath = join(bundleDir, 'cordis.patch.yml')
const declaredPatch = bundleManifest.dsh?.bundle?.patch
check('bundle patch declared', typeof declaredPatch === 'string' && existsSync(join(bundleDir, declaredPatch)), String(declaredPatch))

let inserted: string[] = []
try {
  // `!!js` expressions are evaluated by the dsh loader, not by this script.
  const text = readFileSync(patchPath, 'utf8')
  const parsed: unknown = parseYaml(text, { logLevel: 'silent' })
  if (!Array.isArray(parsed)) throw new Error('not a YAML array')
  // Rows can sit at the top level (patches) or inside an `insert` list.
  const pluginNames = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(pluginNames)
    if (value === null || typeof value !== 'object') return []
    const record = value as { name?: unknown; insert?: unknown }
    const own = typeof record.name === 'string' ? [record.name] : []
    return [...own, ...pluginNames(record.insert)]
  }
  inserted = pluginNames(parsed).filter(name => name.startsWith('@deepseek-ai/'))
  const jsExpressions = (text.match(/!!js /gu) ?? []).length
  check('patch is a YAML array', true, `${parsed.length} entries, ${jsExpressions} !!js expressions`)
} catch (error) {
  check('patch is a YAML array', false, error instanceof Error ? error.message : String(error))
}

const requireFromCli = createRequire(join(cliDir, 'package.json'))
/** Package root of a specifier: `@scope/name/sub/path` -> `@scope/name`. */
const packageRoot = (specifier: string): string => {
  const parts = specifier.split('/')
  return parts.length > 2 ? parts.slice(0, 2).join('/') : specifier
}
const missingPlugins: string[] = []
for (const name of inserted) {
  try {
    // Plugin names may target a package subpath export; the package itself is
    // what has to exist in the installation.
    requireFromCli.resolve(`${packageRoot(name)}/package.json`)
  } catch {
    missingPlugins.push(name)
  }
}
check(
  'patch plugins resolvable',
  missingPlugins.length === 0,
  missingPlugins.length === 0 ? `${inserted.length} rows resolve in the installed runtime` : `missing: ${missingPlugins.join(', ')}`,
)

// 7. Bundle exports point at real files, so the profile copy (which rewrites
//    them to lib/) and the workspace dev loader agree on shape.
const exportProblems = Object.entries(bundleManifest.exports ?? {})
  .filter(([key]) => key !== './package.json')
  .filter(([, target]) => !existsSync(join(bundleDir, target)))
  .map(([key, target]) => `${key} → ${target}`)
check('bundle exports exist', exportProblems.length === 0, exportProblems.length === 0 ? 'all export targets exist' : exportProblems.join(', '))

// 8. The CLI must declare a runnable bin file after a build.
const cliBin = readJson<{ bin?: Record<string, string> }>(join(cliDir, 'package.json')).bin?.['dsh-tui']
check('cli bin built', cliBin !== undefined && existsSync(join(cliDir, cliBin)), String(cliBin))

for (const row of checks) process.stdout.write(`${row.ok ? '✓' : '✗'} ${row.name}: ${row.detail}\n`)
const failed = checks.filter(row => !row.ok)
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} compatibility checks passed against dsh ${PIN.dshVersion}\n`)
if (failed.length > 0) process.exitCode = 1

/** Recursively list `.ts` sources under one directory. */
function collectSources(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectSources(path))
    else if (entry.isFile() && path.endsWith('.ts')) out.push(path)
  }
  return out
}
