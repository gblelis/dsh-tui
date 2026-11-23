/**
 * `dsh-tui doctor`: every precondition this launcher needs, each with a status
 * and a concrete next step, so a broken install can be diagnosed without
 * reading logs.
 * @module @gblelis/dsh-tui/launcher/doctor
 */

import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLE_PACKAGE, DSH_COMPAT_RANGE, PROFILE_NAME } from './constants.ts'
import { MIN_NODE, type ResolvedPaths } from './env.ts'
import { profileDir } from './env.ts'
import { readEmbeddedBundle, verifyInstalledBundle } from './profile.ts'
import { findRuntime, runtimeCompatible } from './runtime.ts'
import { compareVersions, satisfiesRange } from './semver.ts'

/** One diagnostic line. */
export interface Diagnostic {
  readonly name: string
  readonly status: 'ok' | 'warn' | 'fail'
  readonly detail: string
  /** Actionable next step; absent when there is nothing to do. */
  readonly hint?: string
}

/** Whether a directory is writable. */
function writable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** Paths dsh reads credentials from, in precedence order. */
function credentialSources(home: string): Array<{ path: string; label: string }> {
  return [
    { path: join(process.cwd(), '.env'), label: 'project .env' },
    { path: join(home, '.env'), label: 'home .env' },
    { path: join(home, '.credentials.yaml'), label: 'saved credentials' },
  ]
}

/** Whether a `.env` file declares a DeepSeek key. */
function envFileHasKey(path: string): boolean {
  try {
    return /^DEEPSEEK_API_KEY=\s*\S+/mu.test(readFileSync(path, 'utf8'))
  } catch {
    return false
  }
}

/** Release facts the TUI cached under `$DSH_HOME/cache/dsh-tui`. */
interface CachedRelease {
  readonly checkedAt: number
  readonly channels: { latest?: string; alpha?: string }
}

/**
 * Read the release cache the TUI writes.
 * @param home - Harness home directory.
 * @returns The cached record, or `undefined` when absent or unreadable.
 */
function readUpdateCache(home: string): CachedRelease | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, 'cache', 'dsh-tui', 'update-check.json'), 'utf8'))
    if (value === null || typeof value !== 'object') return undefined
    const record = value as { checkedAt?: unknown; channels?: unknown }
    if (typeof record.checkedAt !== 'number' || record.channels === null || typeof record.channels !== 'object') return undefined
    const channels = record.channels as { latest?: unknown; alpha?: unknown }
    return {
      checkedAt: record.checkedAt,
      channels: {
        ...typeof channels.latest === 'string' ? { latest: channels.latest } : {},
        ...typeof channels.alpha === 'string' ? { alpha: channels.alpha } : {},
      },
    }
  } catch {
    return undefined
  }
}

/**
 * Run every check.
 * @param paths - resolved launcher paths.
 * @param explicitBin - `--dsh-bin` value, when given.
 * @returns one diagnostic per precondition, in display order.
 */
export async function diagnose(paths: ResolvedPaths, explicitBin?: string): Promise<Diagnostic[]> {
  const out: Diagnostic[] = []
  const nodeOk = satisfiesRange(process.version, `>=${MIN_NODE}`)
  out.push({
    name: 'Node.js',
    status: nodeOk ? 'ok' : 'fail',
    detail: `${process.version} (requires >= ${MIN_NODE})`,
    ...nodeOk ? {} : { hint: 'Install Node.js 24.9 or newer (nvm install 24 --lts).' },
  })

  out.push({
    name: 'DSH home',
    status: existsSync(paths.home) ? (writable(paths.home) ? 'ok' : 'fail') : 'warn',
    detail: `${paths.home} (${paths.homeSource === 'default' ? 'default ~/.dsh' : paths.homeSource})`,
    ...existsSync(paths.home)
      ? writable(paths.home) ? {} : { hint: 'dsh-tui cannot write this directory; fix its permissions or set DSH_HOME.' }
      : { hint: 'Created on first run; no action needed unless the parent is read-only.' },
  })

  const profile = profileDir(paths.home)
  const manifestPath = join(profile, 'package.json')
  let manifestProblem: string | undefined
  let bundles: string[] = []
  if (!existsSync(manifestPath)) {
    manifestProblem = 'missing'
  } else {
    try {
      const value: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const record = value as { dsh?: { profile?: { bundles?: unknown } } }
      const list = record.dsh?.profile?.bundles
      if (Array.isArray(list)) bundles = list.filter((name): name is string => typeof name === 'string')
      else manifestProblem = 'no dsh.profile.bundles'
    } catch {
      manifestProblem = 'invalid JSON'
    }
  }
  out.push({
    name: `Profile "${PROFILE_NAME}"`,
    status: manifestProblem === undefined && bundles.length > 0 ? 'ok' : manifestProblem === 'missing' ? 'warn' : 'fail',
    detail: manifestProblem === undefined ? `${profile} · bundles: ${bundles.join(', ')}` : `${profile} · ${manifestProblem}`,
    ...manifestProblem === undefined || manifestProblem === 'missing' ? {} : {
      hint: `Run \`dsh-tui install\` to repair the profile manifest (or remove ${manifestPath}).`,
    },
  })
  if (manifestProblem === undefined) {
    const missing = ['@deepseek-ai/dsh-base', BUNDLE_PACKAGE].filter(name => !bundles.includes(name))
    if (missing.length > 0) {
      out.push({
        name: 'Bundle layers',
        status: 'fail',
        detail: `missing from dsh.profile.bundles: ${missing.join(', ')}`,
        hint: 'Run `dsh-tui install` to restore the required layers.',
      })
    }
  }

  let bundle: Awaited<ReturnType<typeof readEmbeddedBundle>> | undefined
  try {
    bundle = await readEmbeddedBundle()
  } catch (error: unknown) {
    out.push({ name: 'Embedded bundle', status: 'fail', detail: error instanceof Error ? error.message : String(error) })
  }
  if (bundle !== undefined) {
    const health = await verifyInstalledBundle(paths)
    out.push({
      name: 'Embedded bundle',
      status: health.status === 'ok' ? 'ok' : 'warn',
      detail: health.status === 'ok'
        ? `${BUNDLE_PACKAGE}@${bundle.version} (${String(health.files)} files, content hash verified)`
        : health.status === 'missing'
          ? `${BUNDLE_PACKAGE}@${bundle.version} not installed in the profile yet`
          : health.status === 'unreadable'
            ? `the embedded bundle is unreadable: ${health.detail}`
            : `${BUNDLE_PACKAGE}@${bundle.version} needs a refresh (${health.detail})`,
      ...health.status === 'ok' ? {} : { hint: 'Run `dsh-tui sync`; it rewrites the copy even when the stamp says it is current.' },
    })
  }

  let runtime: ReturnType<typeof findRuntime> | undefined
  try {
    runtime = findRuntime(explicitBin)
  } catch (error: unknown) {
    out.push({
      name: 'dsh runtime',
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
      ...(error as { hint?: string }).hint === undefined ? {} : { hint: (error as { hint?: string }).hint },
    })
  }
  if (runtime !== undefined) {
    const compatible = runtimeCompatible(runtime.version)
    out.push({
      name: 'dsh runtime',
      status: compatible ? 'ok' : 'fail',
      detail: `${runtime.version} at ${runtime.packageDir} (found via ${runtime.source}); dsh-tui targets ${DSH_COMPAT_RANGE}`,
      ...compatible ? {} : {
        hint: `Install a matching runtime (npm install -g @deepseek-ai/dsh@next) or pass --dsh-bin pointing at one. Session format V4 is shared across 0.2.x, but plugin APIs may differ.`,
      },
    })
  }

  // The bundle writes this cache after the first frame; doctor only reads it,
  // so a diagnostic never blocks on the network.
  if (runtime !== undefined) {
    const cached = readUpdateCache(paths.home)
    if (cached === undefined) {
      out.push({
        name: 'dsh release',
        status: 'ok',
        detail: 'not checked yet (the TUI fills this in on its next run)',
      })
    } else {
      const latest = cached.channels.latest
      const behind = latest !== undefined && compareVersions(runtime.version, latest) < 0
      const checked = new Date(cached.checkedAt).toISOString().slice(0, 16).replace('T', ' ')
      out.push({
        name: 'dsh release',
        status: behind ? 'warn' : 'ok',
        detail: behind
          ? `published ${latest} is newer than ${runtime.version} (checked ${checked} UTC)`
          : `up to date with ${latest ?? 'the registry'} (checked ${checked} UTC)`,
        ...behind ? { hint: 'Upgrade with npm install -g @gblelis/dsh-tui@latest; the TUI reports the same fact under /update.' } : {},
      })
    }
  }

  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  out.push({
    name: 'Terminal',
    status: tty ? 'ok' : 'warn',
    detail: tty ? `${process.env.TERM ?? 'unknown'} · stdin and stdout are TTYs` : 'stdin or stdout is not a TTY',
    ...tty ? {} : { hint: 'Run dsh-tui directly in a terminal; piping is not supported by the interactive front end.' },
  })

  const envKey = process.env.DEEPSEEK_API_KEY?.trim()
  const source = envKey !== undefined && envKey !== ''
    ? 'DEEPSEEK_API_KEY from the environment'
    : credentialSources(paths.home).find(file => file.path.endsWith('.env') && envFileHasKey(file.path))?.label
      ?? (existsSync(join(paths.home, '.credentials.yaml')) ? 'saved credentials file' : undefined)
  out.push({
    name: 'Credentials',
    status: source === undefined ? 'warn' : 'ok',
    detail: source ?? 'no DeepSeek credential was found',
    ...source === undefined ? {
      hint: 'Export DEEPSEEK_API_KEY, add it to a .env file, or configure it in the Desktop/Web settings (written to $DSH_HOME/.credentials.yaml).',
    } : {},
  })
  return out
}

/** Render diagnostics for a human reader. */
export function renderDiagnostics(rows: readonly Diagnostic[]): string {
  const symbols = { ok: '✓', warn: '!', fail: '✗' } as const
  const lines = rows.map((row) => {
    const head = `${symbols[row.status]} ${row.name}: ${row.detail}`
    return row.hint === undefined ? head : `${head}\n    → ${row.hint}`
  })
  const failed = rows.filter(row => row.status === 'fail').length
  const warned = rows.filter(row => row.status === 'warn').length
  lines.push('', failed === 0
    ? warned === 0 ? 'Everything looks ready.' : `Ready, with ${warned} warning${warned === 1 ? '' : 's'}.`
    : `${failed} check${failed === 1 ? '' : 's'} failed.`)
  return lines.join('\n')
}
