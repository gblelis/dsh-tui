/**
 * Owns the profile this front end boots: its manifest, its bundle copies, and
 * the install stamp that keeps `dsh-tui` self-healing without ever running a
 * package manager inside `$DSH_HOME`.
 * @module @gblelis/dsh-tui/launcher/profile
 */

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUNDLE_PACKAGE,
  PROFILE_BUNDLES,
  PROFILE_NAME,
  PROFILE_STATE_DIR,
} from './constants.ts'
import type { ResolvedPaths } from './env.ts'
import { LauncherError } from './env.ts'

/** The bundle artifact embedded next to the CLI's compiled output. */
export interface EmbeddedBundle {
  /** Bundle package version. */
  readonly version: string
  /** Content hash of every file in the artifact. */
  readonly hash: string
  /** Package-relative paths, in copy order. */
  readonly files: readonly string[]
}

/** The install stamp written beside the copied package. */
interface InstallStamp {
  readonly version: string
  readonly hash: string
  /** dsh runtime the copy was verified against; informational only. */
  readonly dshVersion?: string
}

/** Directory holding the embedded artifact inside the published CLI package. */
function embeddedDir(): string {
  return fileURLToPath(new URL('../bundle/', import.meta.url))
}

/**
 * Read and validate the embedded bundle manifest.
 * @returns the embedded artifact description.
 */
export async function readEmbeddedBundle(): Promise<EmbeddedBundle> {
  const path = join(embeddedDir(), 'manifest.json')
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new LauncherError(
      `the embedded dsh-tui bundle is missing (${path})`,
      'Reinstall the package: npm install -g @gblelis/dsh-tui@latest.',
    )
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new LauncherError(`the embedded dsh-tui bundle manifest is corrupt (${path})`)
  }
  if (value === null || typeof value !== 'object') throw new LauncherError(`the embedded dsh-tui bundle manifest is corrupt (${path})`)
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'string' || typeof record.hash !== 'string' || !Array.isArray(record.files)) {
    throw new LauncherError(`the embedded dsh-tui bundle manifest is incomplete (${path})`)
  }
  const files = record.files.filter((file): file is string => typeof file === 'string')
  if (files.length === 0) throw new LauncherError(`the embedded dsh-tui bundle is empty (${path})`)
  return { version: record.version, hash: record.hash, files }
}

/** The package manifest written into the profile's copy of the bundle. */
export function bundleManifestJson(version: string): string {
  return `${JSON.stringify({
    name: BUNDLE_PACKAGE,
    version,
    description: 'Terminal front end for DeepSeek Harness (installed by @gblelis/dsh-tui)',
    type: 'module',
    license: 'MIT',
    exports: {
      '.': './lib/index.js',
      './startup': './lib/startup.js',
      './prompt': './lib/prompt-service.js',
      './testing': './lib/testing/capture-terminal.js',
      './package.json': './package.json',
    },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    engines: { node: '>=24.9.0', dsh: '^0.2.2-rc.5 || ^0.2.3-alpha.2' },
  }, undefined, 2)}\n`
}

/**
 * Compute the same content hash the build stamps into the manifest, so a
 * hand-edited artifact is detected and reinstalled.
 * @param files - artifact-relative files with their contents.
 * @returns the hex sha256 digest.
 */
export function artifactHash(files: ReadonlyArray<{ path: string; content: Buffer }>): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

/** Result of ensuring a profile is ready to boot. */
export interface ProfileStatus {
  readonly paths: ResolvedPaths
  /** Whether the profile directory was created this run. */
  readonly created: boolean
  /** Whether the bundle copy was installed or refreshed this run. */
  readonly bundleInstalled: boolean
  /** Whether the manifest's bundle list changed this run. */
  readonly manifestUpdated: boolean
  /** Whether a pre-existing user patch layer was found. */
  readonly hasUserPatch: boolean
}

const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

/** Whether a path exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Merge the required bundles into a profile's `dsh.profile.bundles` list.
 * dsh-base stays first; this front door follows; user-added bundles keep their
 * relative order after it so they can override the terminal layer.
 * @param existing - the list read from the manifest, if any.
 * @returns the merged list and whether it changed.
 */
export function mergeBundles(existing: readonly string[] | undefined): { bundles: string[]; changed: boolean } {
  const current = existing ?? []
  const rest = current.filter(name => name !== PROFILE_BUNDLES[0] && name !== PROFILE_BUNDLES[1])
  const next = [...PROFILE_BUNDLES, ...rest]
  const changed = current.length !== next.length || current.some((name, index) => name !== next[index])
  return { bundles: next, changed }
}

/**
 * Write a JSON file only when its contents differ.
 * @param path - absolute target.
 * @param content - full file contents.
 * @returns whether the file changed.
 */
async function writeIfChanged(path: string, content: string): Promise<boolean> {
  try {
    if (await readFile(path, 'utf8') === content) return false
  } catch {
    // Absent or unreadable: write it.
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  return true
}

/** Read the install stamp, tolerating absence and corruption. */
async function readStamp(profile: string): Promise<InstallStamp | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(join(profile, PROFILE_STATE_DIR, 'stamp.json'), 'utf8'))
    if (value === null || typeof value !== 'object') return undefined
    const record = value as Record<string, unknown>
    if (typeof record.version !== 'string' || typeof record.hash !== 'string') return undefined
    return {
      version: record.version,
      hash: record.hash,
      ...typeof record.dshVersion === 'string' ? { dshVersion: record.dshVersion } : {},
    }
  } catch {
    return undefined
  }
}

/**
 * Copy the embedded artifact into the profile when the stamp does not match.
 * The copy replaces the whole package directory, so a stale file can never
 * shadow a new build.
 * @param paths - resolved launcher paths.
 * @param bundle - the embedded artifact.
 * @param dshVersion - runtime version, recorded for diagnostics.
 * @returns whether the copy ran.
 */
async function installBundle(paths: ResolvedPaths, bundle: EmbeddedBundle, dshVersion: string | undefined): Promise<boolean> {
  const stamp = await readStamp(paths.profile)
  const installed = await exists(join(paths.bundle, 'package.json'))
  if (installed && stamp?.version === bundle.version && stamp.hash === bundle.hash) return false

  const source = embeddedDir()
  const files: Array<{ path: string; content: Buffer }> = []
  for (const file of bundle.files) {
    const from = join(source, ...file.split('/'))
    const content = await readFile(from)
    files.push({ path: file, content })
  }
  if (artifactHash(files) !== bundle.hash) {
    throw new LauncherError(
      'the embedded dsh-tui bundle does not match its manifest',
      'Reinstall the package: npm install -g @gblelis/dsh-tui@latest.',
    )
  }
  await rm(paths.bundle, { recursive: true, force: true })
  for (const file of files) {
    const target = join(paths.bundle, ...file.path.split('/'))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.content)
  }
  await mkdir(join(paths.profile, PROFILE_STATE_DIR), { recursive: true })
  await writeFile(join(paths.profile, PROFILE_STATE_DIR, 'stamp.json'), `${JSON.stringify({
    version: bundle.version,
    hash: bundle.hash,
    ...dshVersion === undefined ? {} : { dshVersion },
  }, undefined, 2)}\n`)
  return true
}

/**
 * Create or repair the profile this front end owns. Idempotent: existing files
 * are preserved, the user's patch layer is never overwritten, and the bundle
 * copy is only replaced when its stamp disagrees with the embedded build.
 * @param paths - resolved launcher paths.
 * @param dshVersion - runtime version reported by `doctor`, when known.
 * @returns what changed this run.
 */
export async function ensureProfile(paths: ResolvedPaths, dshVersion?: string): Promise<ProfileStatus> {
  const created = !await exists(paths.profile)
  await mkdir(paths.profile, { recursive: true })
  const bundle = await readEmbeddedBundle()

  const manifestPath = join(paths.profile, 'package.json')
  let record: Record<string, unknown> = {}
  if (await exists(manifestPath)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch {
      throw new LauncherError(
        `the dsh profile manifest is not valid JSON: ${manifestPath}`,
        `Fix or remove that file; dsh-tui will recreate it on the next run.`,
      )
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new LauncherError(`the dsh profile manifest is not a JSON object: ${manifestPath}`)
    }
    record = parsed as Record<string, unknown>
  }
  const profileSection = record.dsh !== null && typeof record.dsh === 'object' && !Array.isArray(record.dsh)
    ? record.dsh as Record<string, unknown>
    : {}
  const currentBundles = Array.isArray((profileSection.profile as Record<string, unknown> | undefined)?.bundles)
    ? ((profileSection.profile as Record<string, unknown>).bundles as unknown[]).filter((name): name is string => typeof name === 'string')
    : undefined
  const merged = mergeBundles(currentBundles)
  const manifestUpdated = currentBundles === undefined || merged.changed
  if (manifestUpdated) {
    const manifest = {
      ...record,
      name: typeof record.name === 'string' ? record.name : `dsh-profile-${PROFILE_NAME}`,
      private: true,
      dependencies: record.dependencies !== null && typeof record.dependencies === 'object' ? record.dependencies : {},
      dsh: { ...profileSection, profile: { ...(profileSection.profile as Record<string, unknown> | undefined), bundles: merged.bundles } },
    }
    await writeIfChanged(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
  }

  const patchPath = join(paths.profile, 'cordis.patch.yml')
  const hasUserPatch = await exists(patchPath)
  if (!hasUserPatch) await writeFile(patchPath, PROFILE_PATCH_TEMPLATE)
  const workspacePath = join(paths.profile, 'pnpm-workspace.yaml')
  if (!await exists(workspacePath)) await writeFile(workspacePath, PROFILE_PNPM_WORKSPACE)

  const bundleInstalled = await installBundle(paths, bundle, dshVersion)
  return { paths, created, bundleInstalled, manifestUpdated, hasUserPatch }
}

/** Every file of a copied bundle directory, package-relative, for diagnostics. */
export async function listInstalledBundle(dir: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else out.push(relative(dir, path).split(sep).join('/'))
    }
  }
  if (await exists(dir)) await walk(dir)
  return out
}

/** Copy a single file for callers that need a fixture-like install. */
export async function copyFileInto(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
}
