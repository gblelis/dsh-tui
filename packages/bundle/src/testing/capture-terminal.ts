/**
 * Deterministic terminal for automated runs of the real TUI.
 *
 * A harness can boot the genuine profile without a PTY: every byte the
 * renderer writes lands in a file and input arrives from a timed script, so
 * screen assertions can replay the capture through `@xterm/headless`. The
 * hook is opt-in through `DSH_TUI_CAPTURE_OUTPUT` (see
 * {@link captureTerminalFromEnv}); a normal `dsh-tui` boot never touches it.
 * @module @gblelis/dsh-tui-bundle/testing
 */

import { appendFileSync } from 'node:fs'
import type { Terminal } from '@earendil-works/pi-tui'

/** One scripted input event, relative to terminal start. */
export interface CaptureInputEvent {
  /** Delay since start, in milliseconds. */
  afterMs: number
  /** Raw terminal input, escape sequences included. */
  data: string
}

/** Everything the capture terminal needs, read from the harness. */
export interface CaptureTerminalOptions {
  /** File receiving every written byte, in order. */
  readonly output: string
  readonly columns: number
  readonly rows: number
  readonly script: readonly CaptureInputEvent[]
}

/** Cursor and line operations as the escape sequences a real terminal expects. */
function cursorUp(rows: number): string {
  return rows <= 0 ? '' : `\x1b[${rows}A`
}

/** A terminal that records output and replays a scripted key sequence. */
export class CaptureTerminal implements Terminal {
  readonly #options: CaptureTerminalOptions
  readonly #timers: ReturnType<typeof setTimeout>[] = []
  #input: ((data: string) => void) | undefined
  #started = false

  constructor(options: CaptureTerminalOptions) {
    this.#options = options
    // The capture can contain the whole conversation; create it private.
    appendFileSync(options.output, '', { mode: 0o600 })
  }

  get columns(): number { return this.#options.columns }
  get rows(): number { return this.#options.rows }
  get kittyProtocolActive(): boolean { return false }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.#started = true
    this.#input = onInput
    // A real terminal starts at its size; report it once so the renderer lays
    // out against known dimensions before the first frame.
    queueMicrotask(() => { if (this.#started) onResize() })
    for (const event of this.#options.script) {
      this.#timers.push(setTimeout(() => {
        if (this.#started) this.#input?.(event.data)
      }, event.afterMs))
    }
  }

  stop(): void {
    this.#started = false
    for (const timer of this.#timers.splice(0)) clearTimeout(timer)
  }

  async drainInput(): Promise<void> {
    // Nothing is buffered: the script is delivered on its own schedule.
  }

  write(data: string): void {
    appendFileSync(this.#options.output, data)
  }

  moveBy(lines: number): void {
    this.write(lines >= 0 ? `\x1b[${lines}B` : cursorUp(-lines))
  }

  hideCursor(): void { this.write('\x1b[?25l') }

  showCursor(): void { this.write('\x1b[?25h') }

  clearLine(): void { this.write('\x1b[2K') }

  clearFromCursor(): void { this.write('\x1b[0J') }

  clearScreen(): void { this.write('\x1b[2J\x1b[H') }

  setTitle(_title: string): void {
    // Window titles are not part of the captured screen.
  }

  setProgress(_active: boolean): void {
    // Progress reporting is a platform feature, not part of the screen.
  }
}

/**
 * Build the capture terminal from the harness environment, if any.
 *
 * Documented test hook (the only environment-driven branch in the front end):
 * `DSH_TUI_CAPTURE_OUTPUT` names the file that receives every written byte,
 * `DSH_TUI_CAPTURE_COLUMNS`/`_ROWS` set the reported size, and
 * `DSH_TUI_CAPTURE_INPUT` is a JSON array of `{afterMs, data}` keystrokes. When
 * it is absent, the real process terminal is used and nothing changes.
 * @returns the capture terminal, or `undefined` for a normal boot.
 */
export function captureTerminalFromEnv(): CaptureTerminal | undefined {
  const output = process.env.DSH_TUI_CAPTURE_OUTPUT
  if (output === undefined || output === '') return undefined
  const columns = Number(process.env.DSH_TUI_CAPTURE_COLUMNS ?? 100)
  const rows = Number(process.env.DSH_TUI_CAPTURE_ROWS ?? 32)
  let script: unknown = []
  try {
    script = JSON.parse(process.env.DSH_TUI_CAPTURE_INPUT ?? '[]')
  } catch {
    // A malformed script must not stop the front end from mounting: the
    // capture terminal still records output, it just replays no keys.
    script = []
  }
  const events = Array.isArray(script)
    ? script.filter((event): event is CaptureInputEvent =>
      event !== null && typeof event === 'object'
      && typeof (event as { afterMs?: unknown }).afterMs === 'number'
      && typeof (event as { data?: unknown }).data === 'string')
    : []
  return new CaptureTerminal({
    output,
    columns: Number.isFinite(columns) && columns > 0 ? columns : 100,
    rows: Number.isFinite(rows) && rows > 0 ? rows : 32,
    script: events,
  })
}
