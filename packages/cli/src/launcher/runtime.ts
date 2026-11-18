/**
 * Locates the dsh installation this launcher boots and validates that its
 * version is inside the range this bundle was built against.
 * @module @gblelis/dsh-tui/launcher/runtime
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, resolve } from 'node:path'
import { DSH_COMPAT_RANGE } from './constants.ts'
import { LauncherError } from './env.ts'
import { satisfiesRange } from './semver.ts'

/** One resolved dsh runtime. */
export interface RuntimeInfo {
  /** Absolute path to dsh's compiled launcher (`lib/bin.js`). */
  readonly bin: string
  /** Version from the runtime package manifest. */
  readonly version: string
  /** Package root of `@deepseek-ai/dsh`. */
  readonly packageDir: string
  /** How the runtime was found. */
  readonly source: 'flag' | 'env' | 'package' | 'path'
}

/** Walk up from a path until a `package.json` naming `@deepseek-ai/dsh` is found. */
function packageDirFrom(path: string): string | undefined {
  let current = resolve(path)
  for (;;) {
    const manifest = join(current, 'package.json')
    if (existsSync(manifest)) {
      try {
        const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
        if (value !== null && typeof value === 'object' && (value as { name?: unknown }).name === '@deepseek-ai/dsh') {
          return current
        }
      } catch {
        // Not a readable manifest: keep walking.
      }
    }
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** Read the runtime version from a package directory. */
function readVersion(packageDir: string): string {
  try {
    const value: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    const version = (value as { version?: unknown }).version
    if (typeof version === 'string' && version !== '') return version
  } catch {
    // Fall through to an honest placeholder.
  }
  return 'unknown'
}

/** The compiled launcher inside a dsh package directory. */
function binFromPackageDir(packageDir: string): string | undefined {
  const candidate = join(packageDir, 'lib', 'bin.js')
  return existsSync(candidate) ? candidate : undefined
}

/** Resolve an explicit `--dsh-bin` / `$DSH_TUI_DSH_BIN` value to a runtime. */
function fromExplicitPath(value: string, source: 'flag' | 'env'): RuntimeInfo {
  const path = resolve(value)
  if (!existsSync(path)) {
    throw new LauncherError(
      `the dsh runtime path does not exist: ${path}`,
      'Pass --dsh-bin pointing at dsh\'s lib/bin.js, or unset it to use the installed @deepseek-ai/dsh.',
    )
  }
  const isDirectory = statSync(path).isDirectory()
  const packageDir = isDirectory ? packageDirFrom(path) : packageDirFrom(dirname(path))
  if (packageDir === undefined) {
    throw new LauncherError(
      `the dsh runtime path is not inside an @deepseek-ai/dsh installation: ${path}`,
      'Point --dsh-bin at dsh\'s lib/bin.js inside the installed package.',
    )
  }
  const bin = isDirectory ? binFromPackageDir(packageDir) : path
  if (bin === undefined) {
    throw new LauncherError(`the dsh installation has no lib/bin.js: ${packageDir}`)
  }
  return { bin, version: readVersion(packageDir), packageDir, source }
}

/** Resolve `dsh` from the launcher's own dependency tree. */
function fromOwnDependency(): RuntimeInfo | undefined {
  try {
    const require = createRequire(import.meta.url)
    const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
    const packageDir = dirname(manifestPath)
    const bin = binFromPackageDir(packageDir)
    if (bin === undefined) return undefined
    return { bin, version: readVersion(packageDir), packageDir, source: 'package' }
  } catch {
    return undefined
  }
}

/** Resolve a `dsh` executable on `$PATH`. */
function fromPath(): RuntimeInfo | undefined {
  const entries = (process.env.PATH ?? '').split(delimiter).filter(entry => entry !== '')
  for (const entry of entries) {
    const candidate = join(entry, 'dsh')
    if (!existsSync(candidate)) continue
    let real = candidate
    try {
      real = realpathSync(candidate)
    } catch {
      continue
    }
    const packageDir = packageDirFrom(dirname(real))
    if (packageDir === undefined) continue
    const bin = binFromPackageDir(packageDir)
    if (bin === undefined) continue
    return { bin, version: readVersion(packageDir), packageDir, source: 'path' }
  }
  return undefined
}

/**
 * Find the dsh runtime this launcher will boot.
 * @param explicit - `--dsh-bin` value, when given.
 * @returns the resolved runtime.
 * @throws {LauncherError} when no installation is found.
 */
export function findRuntime(explicit?: string): RuntimeInfo {
  if (explicit !== undefined && explicit.trim() !== '') return fromExplicitPath(explicit, 'flag')
  const fromEnv = process.env.DSH_TUI_DSH_BIN?.trim()
  if (fromEnv !== undefined && fromEnv !== '') return fromExplicitPath(fromEnv, 'env')
  const found = fromOwnDependency() ?? fromPath()
  if (found !== undefined) return found
  throw new LauncherError(
    'no dsh runtime was found: @deepseek-ai/dsh is not installed next to dsh-tui and no dsh executable is on PATH',
    'Install it with `npm install -g @deepseek-ai/dsh@next`, or point --dsh-bin at an existing lib/bin.js.',
  )
}

/** Whether a runtime version is inside this build's supported range. */
export function runtimeCompatible(version: string): boolean {
  return version !== 'unknown' && satisfiesRange(version, DSH_COMPAT_RANGE)
}

/** The argument vector that boots the terminal profile. */
export function runtimeArgs(runtime: RuntimeInfo, profile: string, appArgs: readonly string[]): string[] {
  return [runtime.bin, '--profile', profile, ...appArgs]
}
