/**
 * Install smoke: prove the published artifact installs and boots like a user's.
 *
 * Packs the CLI, installs the tarball into a throwaway prefix with `npm
 * install -g` (no workspace, no pnpm), then boots the installed `dsh-tui`
 * through the documented capture hook and checks the rendered screen.
 *
 * Run with `pnpm smoke:install`. Needs registry access for the pinned
 * `@deepseek-ai/dsh` dependency, or a warm npm cache.
 * @module scripts/install-smoke
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import xterm from '@xterm/headless'

const { Terminal } = xterm as unknown as {
  Terminal: new (options: Record<string, unknown>) => {
    write(data: string, callback?: () => void): void
    buffer: { active: { length: number; getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined } }
    dispose(): void
  }
}

const COLUMNS = 100
const ROWS = 30
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const root = fileURLToPath(new URL('..', import.meta.url))
const cliPackage = join(root, 'packages', 'cli')

/** Run one command and fail loudly with both streams. */
function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env, cwd?: string): string {
  const result = spawnSync(command, args, { encoding: 'utf8', env, timeout: 300_000, ...cwd === undefined ? {} : { cwd } })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${String(result.status)}):\n${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`)
  }
  return result.stdout
}

/** Render recorded terminal output into plain screen text. */
async function render(raw: string): Promise<string> {
  return await new Promise<string>((resolve) => {
    const term = new Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true, scrollback: 500 })
    term.write(raw, () => {
      const buffer = term.buffer.active
      const lines: string[] = []
      for (let index = 0; index < buffer.length; index += 1) {
        lines.push(buffer.getLine(index)?.translateToString(true) ?? '')
      }
      term.dispose()
      resolve(lines.join('\n').replace(/\n+$/u, ''))
    })
  })
}

const work = mkdtempSync(join(tmpdir(), 'dsh-tui-install-'))
const cache = join(work, 'npm-cache')
const prefix = join(work, 'prefix')
const home = join(work, 'home')
mkdirSync(home, { recursive: true })
const env: NodeJS.ProcessEnv = { ...process.env, npm_config_cache: cache }

const packed = run(npm, ['pack', '--pack-destination', work, '--cache', cache], env, cliPackage)
const tarball = packed.trim().split('\n').at(-1) ?? ''
if (!tarball.endsWith('.tgz')) throw new Error(`npm pack did not report a tarball:\n${packed}`)
process.stdout.write(`packed ${tarball}\n`)

run(npm, ['install', '-g', '--prefix', prefix, '--ignore-scripts', join(work, tarball)], env)
process.stdout.write('installed into a clean prefix\n')

const bin = join(prefix, 'bin', 'dsh-tui')
const launcherEnv: NodeJS.ProcessEnv = { ...env, DSH_HOME: home }
run(bin, ['install'], launcherEnv)
const doctor = run(bin, ['doctor', '--json'], launcherEnv)
const checks = JSON.parse(doctor) as { name: string; status: string; detail?: string }[]
const failed = checks.filter(check => check.status === 'fail')
if (failed.length > 0) {
  throw new Error(`doctor reported failures:\n${failed.map(check => `${check.name}: ${check.detail ?? ''}`).join('\n')}`)
}

const rawFile = join(work, 'screen.raw')
const stderrFile = join(work, 'stderr.log')
const boot = spawnSync(bin, ['--new'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 60_000,
  cwd: home,
  env: {
    ...env,
    DSH_HOME: home,
    DEEPSEEK_API_KEY: 'sk-install-smoke',
    DSH_TELEMETRY_DISABLED: '1',
    DSH_TUI_CAPTURE_OUTPUT: rawFile,
    DSH_TUI_CAPTURE_COLUMNS: String(COLUMNS),
    DSH_TUI_CAPTURE_ROWS: String(ROWS),
    DSH_TUI_CAPTURE_INPUT: JSON.stringify([{ afterMs: 6000, data: '\u0004' }]),
  },
})
if (boot.status !== 0) throw new Error(`installed dsh-tui exited with ${String(boot.status)}:\n${boot.stderr}`)
const screen = await render(readFileSync(rawFile, 'utf8'))
process.stdout.write(`${screen}\n`)

const failures: string[] = []
if (!screen.includes('DEEPSEEK HARNESS')) failures.push('the installed CLI did not render the banner')
if (!/dsh\s*>/u.test(screen)) failures.push('the installed CLI did not render the prompt')
if (!screen.includes('session-')) failures.push('the installed CLI did not create a session')

if (failures.length > 0) {
  process.stderr.write(`\ninstall smoke failed (artifacts in ${work}):\n${failures.map(line => `  ✗ ${line}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\ninstall smoke passed (${work})\n`)
}
void stderrFile
