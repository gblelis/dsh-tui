/**
 * Command dispatch for `dsh-tui`: launcher subcommands plus the default action
 * that installs the profile and hands the terminal to dsh.
 * @module @gblelis/dsh-tui/launcher/main
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUNDLE_PACKAGE,
  CLI_PACKAGE,
  DSH_COMPAT_RANGE,
  PROFILE_NAME,
} from './constants.ts'
import { assertNodeVersion, LauncherError, resolvePaths, type ResolvedPaths } from './env.ts'
import { diagnose, renderDiagnostics } from './doctor.ts'
import { ensureProfile, readEmbeddedBundle } from './profile.ts'
import { findRuntime, runtimeArgs, runtimeCompatible, type RuntimeInfo } from './runtime.ts'

/** One parsed launcher invocation. */
interface Invocation {
  readonly command: 'run' | 'install' | 'sync' | 'doctor' | 'profile' | 'runtime' | 'version' | 'help' | 'print'
  readonly home?: string
  readonly dshBin?: string
  /** Arguments forwarded to dsh (run) or the target command. */
  readonly rest: readonly string[]
  readonly json: boolean
}

const HELP = `dsh-tui — interactive terminal front end for DeepSeek Harness

Usage:
  dsh-tui [options] [-- app args...]    start the terminal UI
  dsh-tui install                       install or repair the dsh profile
  dsh-tui sync                          refresh the profile's bundle copy
  dsh-tui doctor                        check Node, the profile, and the dsh runtime
  dsh-tui profile [--json]              print the profile directory
  dsh-tui runtime [--json]              print the dsh runtime this build boots
  dsh-tui print [app args...]           print the dsh command instead of running it
  dsh-tui version                       print launcher and runtime versions
  dsh-tui help                          show this help

Launcher options:
  --dsh-bin <path>   use this dsh installation (lib/bin.js) instead of the installed one
  --home <dir>       use this DSH_HOME (default: $DSH_HOME or ~/.dsh)
  --json             machine-readable output for profile/runtime/doctor

App options (after --, or when not a launcher command):
  --resume [id]             resume a persisted session; omit the id to list sessions
  --continue                resume the newest session recorded in this directory
  --new                     start a fresh session
  --session-id <id>         open this exact session id, creating it when absent
  --model <[provider/]model>
  --reasoning-effort <id>
  --permission-mode <preset>
  --no-welcome              skip the welcome banner subtitle
  -h, --help                show the terminal UI's own help

Environment:
  DSH_HOME             dsh home (profiles, settings, credentials); default ~/.dsh
  DSH_TUI_DSH_BIN      dsh runtime to boot (same as --dsh-bin)
`

/** Parse one invocation. Unknown launcher-looking flags are forwarded to dsh. */
export function parseInvocation(argv: readonly string[]): Invocation {
  const rest: string[] = []
  let home: string | undefined
  let dshBin: string | undefined
  let json = false
  let command: Invocation['command'] | undefined
  // Once an app argument is seen, every later token belongs to dsh: launcher
  // flags and a bare subcommand are only recognized in the leading position.
  let appMode = false
  const args = [...argv]
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue
    if (arg === '--') {
      rest.push(...args.slice(index + 1))
      break
    }
    if (appMode) {
      rest.push(arg)
      continue
    }
    if (arg === '--home') {
      const value = args[index + 1]
      if (value === undefined) throw new LauncherError('--home requires a directory')
      home = value
      index += 1
      continue
    }
    if (arg.startsWith('--home=')) {
      home = arg.slice('--home='.length)
      continue
    }
    if (arg === '--dsh-bin') {
      const value = args[index + 1]
      if (value === undefined) throw new LauncherError('--dsh-bin requires a path')
      dshBin = value
      index += 1
      continue
    }
    if (arg.startsWith('--dsh-bin=')) {
      dshBin = arg.slice('--dsh-bin='.length)
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
    if (!appMode && command === undefined && !arg.startsWith('-')) {
      const known: Invocation['command'][] = ['run', 'install', 'sync', 'doctor', 'profile', 'runtime', 'version', 'help', 'print']
      if ((known as string[]).includes(arg)) {
        command = arg as Invocation['command']
        continue
      }
      // A bare word in the leading position is a mistyped command; the TUI
      // has no one-shot prompt to accept it as.
      throw new LauncherError(`unknown command: ${arg}`, 'Run `dsh-tui help` for the command list.')
    }
    if (!appMode && command === undefined && (arg === '-h' || arg === '--help' || arg === '-v' || arg === '--version')) {
      command = arg === '-v' || arg === '--version' ? 'version' : 'help'
      continue
    }
    appMode = true
    rest.push(arg)
  }
  return { command: command ?? 'run', ...home === undefined ? {} : { home }, ...dshBin === undefined ? {} : { dshBin }, rest, json }
}

/**
 * Read one version string from a package manifest.
 * @param manifest - Absolute path to the manifest.
 * @returns Its `version`, or `unknown` when it cannot be read.
 */
async function manifestVersion(manifest: string): Promise<string> {
  try {
    const value: unknown = JSON.parse(await readFile(manifest, 'utf8'))
    if (typeof value === 'object' && value !== null
      && typeof (value as { version?: unknown }).version === 'string') {
      return (value as { version: string }).version
    }
  } catch {
    // `version` is a diagnostic: a missing manifest is reported elsewhere.
  }
  return 'unknown'
}

/**
 * Print the launcher/bundle/runtime version banner. Both versions come from the
 * artifacts themselves, so they cannot drift from a hand-maintained constant.
 * @param runtime - Located dsh runtime, when one resolved.
 * @returns The banner text.
 */
async function versionLine(runtime: RuntimeInfo | undefined): Promise<string> {
  const launcher = await manifestVersion(fileURLToPath(new URL('../package.json', import.meta.url)))
  let bundle = 'unknown'
  try {
    bundle = (await readEmbeddedBundle()).version
  } catch {
    // A missing embedded artifact is an install problem; doctor names it.
  }
  const runtimeText = runtime === undefined
    ? 'dsh runtime: not found'
    : `dsh ${runtime.version}${runtimeCompatible(runtime.version) ? '' : ` (outside ${DSH_COMPAT_RANGE})`} at ${runtime.packageDir}`
  return `${CLI_PACKAGE} ${launcher}\nbundle ${BUNDLE_PACKAGE} ${bundle}\n${runtimeText}`
}

/** Ensure the profile exists and is current. */
async function ensure(paths: ResolvedPaths, runtime: RuntimeInfo | undefined, explicitBin: string | undefined): Promise<void> {
  await ensureProfile(paths, runtime?.version)
  void explicitBin
}

/**
 * Install the profile and replace this process with dsh driving the terminal
 * profile. The child inherits stdio directly, so the terminal belongs to dsh.
 * @param paths - resolved launcher paths.
 * @param runtime - the runtime to boot.
 * @param appArgs - terminal flags forwarded verbatim.
 * @returns never returns; exits with the child's status.
 */
function execRuntime(paths: ResolvedPaths, runtime: RuntimeInfo, appArgs: readonly string[]): never {
  const args = runtimeArgs(runtime, PROFILE_NAME, appArgs)
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      DSH_HOME: paths.home,
      // Hand the bundle the exact facts of this boot: which runtime it is
      // running on (the install may hold several) and where the home is, so
      // its release check caches beside the sessions it already knows.
      DSH_TUI_HOME: paths.home,
      DSH_TUI_RUNTIME_VERSION: runtime.version,
    },
  })
  if (result.error !== undefined) {
    throw new LauncherError(`could not start dsh: ${result.error.message}`)
  }
  if (result.signal !== null) {
    // Re-raise the child's signal semantics through the exit status.
    const signalNumber: number = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1, SIGQUIT: 3 }[result.signal as string] ?? 1
    process.exit(128 + signalNumber)
  }
  process.exit(result.status ?? 1)
}

/**
 * Run one invocation.
 * @param argv - arguments after the executable.
 * @returns the process exit code for commands that return.
 */
export async function main(argv: readonly string[]): Promise<number> {
  assertNodeVersion()
  const invocation = parseInvocation(argv)
  const paths = resolvePaths(invocation.home)

  if (invocation.command === 'help') {
    process.stdout.write(HELP)
    return 0
  }
  if (invocation.command === 'version') {
    let runtime: RuntimeInfo | undefined
    try {
      runtime = findRuntime(invocation.dshBin)
    } catch {
      runtime = undefined
    }
    process.stdout.write(`${await versionLine(runtime)}\n`)
    return 0
  }
  if (invocation.command === 'profile') {
    if (invocation.json) {
      process.stdout.write(`${JSON.stringify({ name: PROFILE_NAME, dir: paths.profile, home: paths.home, bundle: paths.bundle }, undefined, 2)}\n`)
    } else {
      process.stdout.write(`${paths.profile}\n`)
    }
    return 0
  }
  if (invocation.command === 'runtime') {
    const runtime = findRuntime(invocation.dshBin)
    if (invocation.json) {
      process.stdout.write(`${JSON.stringify({ ...runtime, compatible: runtimeCompatible(runtime.version) }, undefined, 2)}\n`)
    } else {
      process.stdout.write(`${runtime.bin}\n${runtime.version}\n`)
    }
    return runtimeCompatible(runtime.version) ? 0 : 1
  }
  if (invocation.command === 'doctor') {
    const rows = await diagnose(paths, invocation.dshBin)
    if (invocation.json) process.stdout.write(`${JSON.stringify(rows, undefined, 2)}\n`)
    else process.stdout.write(`${renderDiagnostics(rows)}\n`)
    return rows.some(row => row.status === 'fail') ? 1 : 0
  }

  const runtime = findRuntime(invocation.dshBin)
  if (!runtimeCompatible(runtime.version)) {
    // Session format V4 is shared across 0.2.x, but the plugin surface this
    // bundle compiles against is not; refuse instead of booting half a profile.
    throw new LauncherError(
      `dsh ${runtime.version} is outside the supported range ${DSH_COMPAT_RANGE}`,
      'Install a matching runtime (npm install -g @deepseek-ai/dsh@next), or set DSH_TUI_DSH_BIN to a compatible lib/bin.js.',
    )
  }

  if (invocation.command === 'install' || invocation.command === 'sync') {
    await ensure(paths, runtime, invocation.dshBin)
    const bundle = await readEmbeddedBundle()
    if (invocation.command === 'install') {
      process.stdout.write([
        `profile: ${paths.profile}`,
        `bundles: @deepseek-ai/dsh-base, ${BUNDLE_PACKAGE}@${bundle.version}`,
        `runtime: dsh ${runtime.version} (${runtime.source})`,
        existsSync(join(paths.profile, 'cordis.patch.yml'))
          ? 'user patch layer: kept'
          : 'user patch layer: created',
        '',
      ].join('\n'))
    }
    return 0
  }
  if (invocation.command === 'print') {
    await ensure(paths, runtime, invocation.dshBin)
    process.stdout.write(`${[process.execPath, ...runtimeArgs(runtime, PROFILE_NAME, invocation.rest)].join(' ')}\n`)
    return 0
  }

  // The bundle honours DSH_TUI_CAPTURE_OUTPUT by substituting a recorded
  // terminal, which is how this repository's smokes drive the real profile
  // without a PTY. The guard and the front door must agree on what counts as
  // an interactive terminal, so the same override applies here.
  const captureOverride = process.env.DSH_TUI_CAPTURE_OUTPUT ?? ''
  if (captureOverride === '' && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new LauncherError(
      'the interactive terminal front end needs a TTY on both stdin and stdout',
      'Run dsh-tui directly in a terminal. For scripted use, boot the headless profile with dsh itself.',
    )
  }
  await ensure(paths, runtime, invocation.dshBin)
  return execRuntime(paths, runtime, invocation.rest)
}

/** Report a launcher failure the way the CLI contract promises. */
export function reportFailure(error: unknown): void {
  if (error instanceof LauncherError) {
    process.stderr.write(`dsh-tui: ${error.message}\n`)
    if (error.hint !== undefined) process.stderr.write(`dsh-tui: ${error.hint}\n`)
    return
  }
  process.stderr.write(`dsh-tui: ${error instanceof Error ? error.message : String(error)}\n`)
  if (error instanceof Error && error.stack !== undefined && process.env.DSH_TUI_DEBUG === '1') {
    process.stderr.write(`${error.stack}\n`)
  }
}
