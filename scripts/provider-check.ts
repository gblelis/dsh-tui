/** Temporary: prove the pi-ai route recipe before documenting it. */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import xterm from '@xterm/headless'
import { startMockLlmServer } from './mock-model.mjs'

const { Terminal } = xterm as unknown as { Terminal: new (o: Record<string, unknown>) => {
  write(d: string, cb?: () => void): void
  buffer: { active: { length: number; getLine(i: number): { translateToString(t?: boolean): string } | undefined } }
  dispose(): void
} }
const root = new URL('..', import.meta.url).pathname
const work = mkdtempSync(join(tmpdir(), 'dsh-tui-provider-'))
const home = join(work, 'home')
const cli = join(root, 'packages/cli/lib/bin.js')
spawnSync(process.execPath, [cli, 'install', '--home', home], { encoding: 'utf8' })
const info = spawnSync(process.execPath, [cli, 'runtime', '--json', '--home', home], { encoding: 'utf8' })
const runtime = JSON.parse(info.stdout) as { bin: string }

const PORT = 47871
const model = await startMockLlmServer({
  sequence: ['success'],
  successText: 'Route works: pi-ai adapter ready.',
  apiKey: 'sk-provider',
  chunkSize: 8,
  port: PORT,
})
const baseRoot = model.baseURL.replace(/\/v1$/u, '')
writeFileSync(join(home, 'profiles', 'tui', 'cordis.patch.yml'), `- id: llm-pi-ai
  config:
    providers:
      demo:
        displayName: Demo Gateway
        api: anthropic-messages
        baseURL: ${baseRoot}
        apiKeyEnv: DEMO_API_KEY
        models:
          - id: demo-model
            name: Demo Model
            contextWindow: 64000
            reasoningEfforts: false
- id: session-title-llm
  disabled: true
`)

const COLUMNS = 100
const ROWS = 32
const PROMPT = 'hello from another provider'
const raw = join(work, 'screen.raw')
const events = [
  ...PROMPT.split('').map((char, index) => ({ afterMs: 2500 + index * 22, data: char })),
  { afterMs: 2500 + PROMPT.length * 22 + 150, data: '\r' },
  { afterMs: 11_000, data: '\u0004' },
]
const status = await new Promise<number | null>((resolve) => {
  const child = spawn(runtime.bin, ['--profile', 'tui', '--new', '--model', 'demo/demo-model'], {
    cwd: home,
    env: {
      ...process.env,
      DSH_HOME: home,
      DEMO_API_KEY: 'sk-provider',
      DSH_TELEMETRY_DISABLED: '1',
      DSH_TUI_CAPTURE_OUTPUT: raw,
      DSH_TUI_CAPTURE_COLUMNS: String(COLUMNS),
      DSH_TUI_CAPTURE_ROWS: String(ROWS),
      DSH_TUI_CAPTURE_INPUT: JSON.stringify(events),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const timer = setTimeout(() => { child.kill('SIGKILL') }, 60_000)
  child.on('close', (code) => {
    clearTimeout(timer)
    if (code !== 0) process.stderr.write(stderr)
    resolve(code)
  })
})
await model.close()
const text = await new Promise<string>((resolve) => {
  const term = new Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true, scrollback: 1000 })
  term.write(readFileSync(raw, 'utf8'), () => {
    const b = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < b.length; i += 1) lines.push(b.getLine(i)?.translateToString(true) ?? '')
    term.dispose()
    resolve(lines.join('\n'))
  })
})
writeFileSync(join(work, 'screen.txt'), text)
console.log('exit', status)
console.log(text.split('\n').slice(-16).join('\n'))
if (!text.includes('Route works')) { console.error('PROVIDER ROUTE FAILED'); process.exitCode = 1 }
