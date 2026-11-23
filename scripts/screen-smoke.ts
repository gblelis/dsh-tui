/**
 * Screen smoke test: boot the genuine profile through the genuine launcher and
 * assert what a user would see, without a PTY.
 *
 * The bundle exposes a documented test hook (`DSH_TUI_CAPTURE_OUTPUT`) that
 * replaces the process terminal with a recorded one; the recorded bytes are
 * replayed through `@xterm/headless` so the assertions run against the rendered
 * screen, including colors and cursor movement, not against log text.
 *
 * Run with `pnpm smoke:screen` (or `pnpm smoke:screen -- --delay 12000`).
 * @module scripts/screen-smoke
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import xterm from '@xterm/headless'

const { Terminal } = xterm as unknown as { Terminal: new (options: Record<string, unknown>) => {
  write(data: string, callback?: () => void): void
  buffer: { active: { length: number; getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined } }
  dispose(): void
} }

const COLUMNS = 100
const ROWS = 30
/** Ctrl+D: the documented "exit while idle" key. */
const CTRL_D = '\u0004'

/** Read `--flag value` pairs from the CLI. */
function option(argv: readonly string[], name: string, fallback: string): string {
  const index = argv.indexOf(`--${name}`)
  const value = index === -1 ? undefined : argv[index + 1]
  return value === undefined || value.startsWith('--') ? fallback : value
}

/** Render recorded terminal output into plain screen text. */
async function render(raw: string): Promise<string> {
  return await new Promise<string>((resolve) => {
    const term = new Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true, scrollback: 1_000 })
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

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const delay = Number(option(args, 'delay', '6000'))
const outFile = option(args, 'out', '')
const home = mkdtempSync(join(tmpdir(), 'dsh-tui-screen-'))
const cli = join(root, 'packages/cli/lib/bin.js')
const explicitBin = option(args, 'dsh-bin', '')
const launcherArgs = (command: string, extra: readonly string[] = []): string[] => [
  cli, command, '--home', home, ...explicitBin === '' ? [] : ['--dsh-bin', explicitBin], ...extra,
]

// Install through the built launcher, exactly as a user would: this covers the
// profile copy, the stamp, and the runtime validation on the real artifact.
const install = spawnSync(process.execPath, launcherArgs('install'), { encoding: 'utf8' })
if (install.status !== 0) {
  throw new Error(`dsh-tui install failed (${String(install.status)}):\n${install.stdout}\n${install.stderr}`)
}
const runtimeInfo = spawnSync(process.execPath, launcherArgs('runtime', ['--json']), { encoding: 'utf8' })
const runtime = JSON.parse(runtimeInfo.stdout) as { bin: string; version: string; compatible: boolean }
if (!runtime.compatible) throw new Error(`runtime ${runtime.version} is outside the supported range`)

const rawFile = join(home, 'screen.raw')
const errorsFile = join(home, 'stderr.log')
const result = spawnSync(process.execPath, [runtime.bin, '--profile', 'tui', '--new'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    DSH_HOME: home,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? 'sk-screen-smoke',
    DSH_TELEMETRY_DISABLED: '1',
    // Release awareness would add a registry request (and a possible notice)
    // to a screen whose assertions are a golden comparison.
    DSH_TUI_NO_UPDATE_CHECK: '1',
    DSH_TUI_CAPTURE_OUTPUT: rawFile,
    DSH_TUI_CAPTURE_COLUMNS: String(COLUMNS),
    DSH_TUI_CAPTURE_ROWS: String(ROWS),
    DSH_TUI_CAPTURE_INPUT: JSON.stringify([{ afterMs: delay, data: CTRL_D }]),
  },
  timeout: delay + 30_000,
})
writeFileSync(errorsFile, result.stderr ?? '')

let raw = ''
try {
  raw = readFileSync(rawFile, 'utf8')
} catch {
  throw new Error(`the TUI never wrote a frame; stderr:\n${result.stderr ?? ''}`)
}
const screen = await render(raw)
process.stdout.write(`${screen}\n`)
if (outFile !== '') writeFileSync(outFile, `${screen}\n`)

const failures: string[] = []
if (result.status !== 0) failures.push(`the TUI exited with ${String(result.status)}; stderr:\n${result.stderr ?? ''}`)
if (!screen.includes('DEEPSEEK HARNESS')) failures.push('the welcome banner title is missing')
if (!/dsh\s*>/u.test(screen)) failures.push('the input prompt is missing')
if (!/deepseek/u.test(screen)) failures.push('the status line does not name the model')

if (failures.length > 0) {
  process.stderr.write(`\nscreen smoke failed:\n${failures.map(line => `  ✗ ${line}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('\nscreen smoke passed\n')
}
void root
