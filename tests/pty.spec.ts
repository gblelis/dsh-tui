/**
 * PTY smoke: boot the built launcher under a real pseudo-terminal and check the
 * rendered screen. The capture-terminal hook used by the other smokes replaces
 * the terminal outright; this test is the one that exercises `ProcessTerminal`
 * itself — raw stdin, resize handling and the real write path.
 *
 * Skipped where a PTY cannot be allocated (sandboxes, some containers) or
 * where `script(1)` is missing. CI runs it on Ubuntu and macOS.
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = join(root, 'packages/cli/lib/bin.js')

/* eslint-disable no-control-regex -- stripping terminal escape sequences is the job */
/** Strip CSI and OSC sequences so assertions read the plain screen text. */
function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, '')
    .replace(/\u001b\][^\u0007]*\u0007/gu, '')
}

/**
 * Wrap a command in `script(1)`; util-linux wants `-e -c <string>`, BSD wants
 * the command as trailing arguments.
 */
function ptyCommand(command: string): { bin: string; args: string[] } | undefined {
  if (process.platform === 'win32') return undefined
  const isDarwin = process.platform === 'darwin'
  const probe = isDarwin
    ? spawnSync('script', ['-q', '/dev/null', 'true'], { timeout: 5_000 })
    : spawnSync('script', ['-q', '-e', '-c', 'true', '/dev/null'], { timeout: 5_000 })
  if (probe.error !== undefined || probe.status !== 0) return undefined
  return isDarwin
    ? { bin: 'script', args: ['-q', '/dev/null', 'sh', '-c', command] }
    : { bin: 'script', args: ['-q', '-e', '-c', command, '/dev/null'] }
}

const pty = ptyCommand('true')

describe.skipIf(pty === undefined)('PTY boot', () => {
  it('renders the banner and prompt, then exits cleanly on Ctrl+D', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-tui-pty-'))
    const command = [
      JSON.stringify(process.execPath),
      JSON.stringify(cli),
      '--home',
      JSON.stringify(home),
    ].join(' ')
    const launcher = ptyCommand(command)
    if (launcher === undefined) throw new Error('PTY support disappeared between probe and test')

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(launcher.bin, launcher.args, {
        cwd: home,
        env: {
          ...process.env,
          DSH_HOME: home,
          DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? 'sk-pty-smoke',
          DSH_TELEMETRY_DISABLED: '1',
          TERM: 'xterm-256color',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let text = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`the TUI never rendered a banner; output so far:\n${stripAnsi(text)}`))
      }, 45_000)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        text += chunk
        if (stripAnsi(text).includes('DEEPSEEK HARNESS')) {
          // Idle Ctrl+D is the documented exit path.
          child.stdin.write('\u0004')
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => { text += chunk })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (status) => {
        clearTimeout(timer)
        if (status !== 0) reject(new Error(`the TUI exited with ${String(status)}:\n${stripAnsi(text)}`))
        else resolve(text)
      })
    })

    const screen = stripAnsi(output)
    expect(screen).toContain('DEEPSEEK HARNESS')
    expect(screen).toMatch(/dsh\s*>/u)
    expect(screen).toContain('session-')
  }, 60_000)
})
