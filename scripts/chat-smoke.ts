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

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import xterm from '@xterm/headless'
import { startMockLlmServer } from './mock-model.mjs'

const { Terminal } = xterm as unknown as { Terminal: new (options: Record<string, unknown>) => {
  write(data: string, callback?: () => void): void
  buffer: { active: { length: number; getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined } }
  dispose(): void
} }

const COLUMNS = 100
const ROWS = 40
/** Ctrl+D: the documented "exit while idle" key. */
const CTRL_D = '\u0004'
/** Carriage return: the `enter` key as a terminal sends it. */
const CR = '\r'
/** Fixed port so the profile patch can name the mock endpoint. */
const MOCK_PORT = 47831

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

/**
 * Run the TUI to completion without blocking this process's event loop: the
 * mock model server lives here, so `spawnSync` would deadlock the first model
 * call while the server waits for a turn that can never start.
 */
function runTui(args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    const timer = setTimeout(() => { child.kill('SIGKILL') }, timeoutMs)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stderr })
    })
  })
}

/** Environment for one captured TUI run: same home and model endpoint. */
function captureEnv(output: string, input: readonly { afterMs: number; data: string }[]): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DSH_HOME: home,
    DEEPSEEK_API_KEY: 'sk-smoke',
    DEEPSEEK_BASE_URL: model.baseURL,
    DSH_TELEMETRY_DISABLED: '1',
    DSH_TUI_CAPTURE_OUTPUT: output,
    DSH_TUI_CAPTURE_COLUMNS: String(COLUMNS),
    DSH_TUI_CAPTURE_ROWS: String(ROWS),
    DSH_TUI_CAPTURE_INPUT: JSON.stringify(input),
  }
}

/** Render one capture file, or throw with the child's stderr. */
async function screenOf(file: string): Promise<string> {
  try {
    return await render(readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`the TUI never wrote a frame to ${file}`)
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const typingDelay = Number(option(args, 'typing-delay', '6000'))
const exitDelay = Number(option(args, 'exit-delay', '16000'))
const PROMPT = 'hello there'
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
const REPLY = 'Acknowledged, this is a streamed smoke reply.'
const model = await startMockLlmServer({ sequence: ['success'], successText: REPLY, apiKey: 'sk-smoke', chunkSize: 8, port: MOCK_PORT })


// Point the DeepSeek adapter row at the local Messages server. The profile
// user layer merges `config` into an existing row, so this needs no new plugin.
writeFileSync(join(home, 'profiles', 'tui', 'cordis.patch.yml'),
  '- id: llm-deepseek\n  config:\n    baseURL: http://127.0.0.1:' + String(MOCK_PORT) + '\n')

const rawFile = join(home, 'screen.raw')
const errorsFile = join(home, 'stderr.log')
const result = await runTui([runtime.bin, '--profile', 'tui', '--new'], {
    ...process.env,
    DSH_HOME: home,
    DEEPSEEK_API_KEY: 'sk-smoke',
    DEEPSEEK_BASE_URL: model.baseURL,
    DSH_TELEMETRY_DISABLED: '1',
    DSH_TUI_CAPTURE_OUTPUT: rawFile,
    DSH_TUI_CAPTURE_COLUMNS: String(COLUMNS),
    DSH_TUI_CAPTURE_ROWS: String(ROWS),
    DSH_TUI_CAPTURE_INPUT: JSON.stringify([
      // One key per event, like a real terminal: a whole string arrives as a
      // paste, and the editor keeps the trailing Enter as text.
      ...PROMPT.split('').map((char, index) => ({ afterMs: typingDelay + index * 25, data: char })),
      { afterMs: typingDelay + PROMPT.length * 25 + 200, data: CR },
      // The mock answers immediately; export the transcript once it landed.
      ...'/export'.split('').map((char, index) => ({ afterMs: typingDelay + 4000 + index * 25, data: char })),
      { afterMs: typingDelay + 4000 + '/export'.length * 25 + 200, data: CR },
      { afterMs: exitDelay, data: CTRL_D },
    ]),
  }, exitDelay + 40_000)
writeFileSync(errorsFile, result.stderr ?? '')

await model.close()

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
if (!screen.includes(PROMPT)) failures.push('the user message is missing from the transcript')
if (!screen.includes(REPLY)) failures.push('the streamed assistant reply is missing from the transcript')
if (/LlmFailure|NO_ADAPTER/u.test(screen)) failures.push('the transcript reports a model error')

// Phase 1b: /export must write a Markdown transcript of what was just shown,
// into the session workspace (the child runs with cwd set to the temp home).
const exported = readdirSync(home).filter(name => name.startsWith('dsh-transcript-') && name.endsWith('.md'))
if (exported.length === 0) {
  failures.push('/export wrote no transcript file')
} else {
  const markdown = readFileSync(join(home, exported[0]), 'utf8')
  if (!markdown.includes(PROMPT)) failures.push('/export transcript is missing the user message')
  if (!markdown.includes(REPLY)) failures.push('/export transcript is missing the reply')
  if (!screen.includes('Exported this session to')) failures.push('/export did not confirm the path in the transcript')
}

// Phase 2: reopening with --continue must land on the same session and show the
// restored transcript, including the reply the mock streamed in phase 1.
const sessionId = /session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u.exec(screen)?.[0]
if (sessionId === undefined) {
  failures.push('the banner does not show a session id')
} else {
  for (const flags of [['--continue'], ['--resume', sessionId]] as const) {
    const label = flags.join(' ')
    const output = join(home, 'screen-' + flags[0].replace(/^--/u, '') + '.raw')
    const resumed = await runTui([runtime.bin, '--profile', 'tui', ...flags], captureEnv(output, [{ afterMs: 7000, data: CTRL_D }]), 60_000)
    const resumedScreen = await screenOf(output)
    writeFileSync(join(home, 'screen-' + flags[0].replace(/^--/u, '') + '.txt'), resumedScreen + '\n')
    if (resumed.status !== 0) failures.push(`${label} exited with ${String(resumed.status)}; stderr:\n${resumed.stderr}`)
    if (!resumedScreen.includes(sessionId)) failures.push(`${label} did not reopen session ${sessionId}`)
    if (!resumedScreen.includes(PROMPT)) failures.push(`${label} did not restore the previous user message`)
    if (!resumedScreen.includes(REPLY)) failures.push(`${label} did not restore the previous reply`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`\nchat smoke failed:\n${failures.map(line => `  ✗ ${line}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('\nchat smoke passed (new, --continue, --resume)\n')
}
void root
