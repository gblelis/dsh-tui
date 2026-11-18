/**
 * Environment facts the launcher resolves once per invocation: the dsh home,
 * the profile directory this front end owns, and the Node floor it requires.
 * @module @gblelis/dsh-tui/launcher/env
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { PROFILE_NAME } from './constants.ts'
import { satisfiesRange } from './semver.ts'

/** Minimum Node.js version this package runs on, matching dsh itself. */
export const MIN_NODE = '24.9.0'

/** Resolve `$DSH_HOME`, falling back to `~/.dsh` exactly as dsh does. */
export function dshHome(override?: string): string {
  const fromFlag = override?.trim()
  if (fromFlag !== undefined && fromFlag !== '') return resolve(fromFlag)
  const fromEnv = process.env.DSH_HOME?.trim()
  if (fromEnv !== undefined && fromEnv !== '') return resolve(fromEnv)
  return join(homedir(), '.dsh')
}

/** The profile directory this front end installs and boots. */
export function profileDir(home: string): string {
  return join(home, 'profiles', PROFILE_NAME)
}

/** The copied bundle package directory inside a profile. */
export function bundleModuleDir(profile: string): string {
  return join(profile, 'node_modules', ...'@gblelis/dsh-tui-bundle'.split('/'))
}

/** Human-readable path resolution facts for `doctor` and `profile --json`. */
export interface ResolvedPaths {
  readonly home: string
  readonly profile: string
  readonly bundle: string
  /** Where the home came from; `undefined` when only the default decided. */
  readonly homeSource: 'flag' | 'env' | 'default'
}

/**
 * Resolve every launcher path from an optional home override.
 * @param flag - `--home` value, when given.
 * @returns the resolved home, profile, and bundle directories.
 */
export function resolvePaths(flag?: string): ResolvedPaths {
  const source: ResolvedPaths['homeSource'] = flag?.trim() ? 'flag' : process.env.DSH_HOME?.trim() ? 'env' : 'default'
  const home = dshHome(flag)
  const profile = profileDir(home)
  return { home, profile, bundle: bundleModuleDir(profile), homeSource: source }
}

/** A failure the launcher reports before it ever reaches dsh. */
export class LauncherError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message)
    this.name = 'LauncherError'
  }
}

/**
 * Assert the running Node.js satisfies {@link MIN_NODE}.
 * @param version - the running version, `process.version` style.
 */
export function assertNodeVersion(version: string = process.version): void {
  if (!satisfiesRange(version, `>=${MIN_NODE}`)) {
    throw new LauncherError(
      `Node.js ${version} is too old: dsh-tui requires >= ${MIN_NODE}`,
      'Install a newer Node.js (for example with nvm) and run dsh-tui again.',
    )
  }
}
