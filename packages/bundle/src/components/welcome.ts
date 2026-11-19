/**
 * Startup panel: the product mark, where this session lives, and the keys worth
 * knowing before the first prompt. Rendered above the transcript on a fresh
 * session and scrolls away with it once the conversation starts.
 * @module @gblelis/dsh-tui-bundle/components/welcome
 */

import { truncateToWidth, visibleWidth, type Component } from '@earendil-works/pi-tui'
import { gradientText, type Palette } from './theme.ts'

/** Facts the panel shows; every field except the session id is optional. */
export interface WelcomeSnapshot {
  /** Session identity, always present. */
  readonly sessionId: string
  /** `provider/model` of the active route. */
  readonly model?: string | undefined
  /** Reasoning effort id, when the route sets one. */
  readonly effort?: string | undefined
  /** Working directory, already formatted for display. */
  readonly cwd: string
  /** Current git branch or worktree label, when known. */
  readonly branch?: string | undefined
  /** Active permission preset, when the deployment mounts the service. */
  readonly permission?: string | undefined
  /** Configured subtitle, replacing the default tagline. */
  readonly tagline?: string | undefined
}

/** How much chrome the header draws for its width and configuration. */
export type WelcomeVariant = 'panel' | 'compact'

const LABEL_WIDTH = 11
const MAX_PANEL_WIDTH = 84
const MIN_PANEL_WIDTH = 46

/** Hint lines for a wide panel; the short form keeps the essentials on narrow ones. */
const HINT_LINES = [
  '/help commands · /model switch · /permissions presets · /login key',
  'Ctrl+O tool cards · Ctrl+R reasoning · Esc cancel · Ctrl+D exit',
] as const
const HINT_LINES_SHORT = [
  '/help · /model · /permissions',
  'Ctrl+O cards · Ctrl+R reasoning · Esc cancel',
] as const

/** Pad `text` to `target` visible columns (never truncates). */
function padTo(text: string, target: number): string {
  return text + ' '.repeat(Math.max(0, target - visibleWidth(text)))
}

/**
 * The bordered startup panel, or a two-line header when the terminal is too
 * narrow (or `--no-welcome` asked for the compact form).
 */
export class WelcomeComponent implements Component {
  constructor(
    private readonly snapshot: () => WelcomeSnapshot,
    private readonly palette: Palette,
    private readonly gradient: boolean,
    private readonly variant: WelcomeVariant = 'panel',
  ) {}

  invalidate(): void {}

  private mark(): string {
    const name = this.gradient
      ? this.palette.bold(gradientText('DEEPSEEK'))
      : this.palette.bold(this.palette.brand('DEEPSEEK'))
    return `${name} ${this.palette.bold('HARNESS')}`
  }

  private tagline(snapshot: WelcomeSnapshot): string {
    return this.palette.dim(snapshot.tagline ?? 'terminal front end for DeepSeek Harness')
  }

  private infoLines(snapshot: WelcomeSnapshot, inner: number): string[] {
    const valueWidth = Math.max(1, inner - LABEL_WIDTH)
    const rows: { label: string; value: string }[] = []
    if (snapshot.model !== undefined) {
      rows.push({
        label: 'model',
        value: `${snapshot.model}${snapshot.effort === undefined ? '' : ` · ${snapshot.effort}`}`,
      })
    }
    rows.push({
      label: 'directory',
      value: `${snapshot.cwd}${snapshot.branch === undefined ? '' : ` (${snapshot.branch})`}`,
    })
    if (snapshot.permission !== undefined) rows.push({ label: 'permission', value: snapshot.permission })
    rows.push({ label: 'session', value: snapshot.sessionId })
    return rows.map((row) => {
      const label = this.palette.dim(padTo(row.label, LABEL_WIDTH))
      return label + truncateToWidth(row.value, valueWidth, '…')
    })
  }

  private panel(width: number): string[] {
    const snapshot = this.snapshot()
    const boxWidth = Math.max(MIN_PANEL_WIDTH, Math.min(width, MAX_PANEL_WIDTH))
    // Centre the panel inside the terminal so the composer rules below stay
    // full-bleed while the mark reads as a deliberate card.
    const left = ' '.repeat(Math.max(0, Math.floor((width - boxWidth) / 2)))
    const inner = boxWidth - 4
    const content: string[] = [
      '',
      this.mark(),
      this.tagline(snapshot),
      '',
      ...this.infoLines(snapshot, inner),
      '',
      ...(inner >= 76 ? HINT_LINES : HINT_LINES_SHORT)
        .map(line => this.palette.dim(truncateToWidth(line, inner, '…'))),
      '',
    ]
    const border = (text: string): string => this.palette.dim(text)
    const top = border(`╭${'─'.repeat(boxWidth - 2)}╮`)
    const bottom = border(`╰${'─'.repeat(boxWidth - 2)}╯`)
    const body = content.map((line) => {
      const padded = padTo(line, inner)
      return `${border('│')} ${padded} ${border('│')}`
    })
    return [top, ...body, bottom].map(line => `${left}${line}`)
  }

  private compact(width: number): string[] {
    const snapshot = this.snapshot()
    return [
      truncateToWidth(this.mark(), width, '…'),
      truncateToWidth(this.palette.dim(snapshot.sessionId), width, '…'),
    ]
  }

  render(width: number): string[] {
    const usable = Math.max(1, width - 2)
    if (this.variant === 'compact' || usable < MIN_PANEL_WIDTH) {
      return this.compact(usable).map(line => ` ${line}`)
    }
    return this.panel(width)
  }
}
