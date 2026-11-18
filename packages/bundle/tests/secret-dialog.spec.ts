import { describe, expect, it } from 'vitest'
import { SecretDialog } from '../src/components/dialogs.ts'
import type { Palette } from '../src/components/theme.ts'

const plain = (text: string): string => text
const palette = {
  accent: plain,
  brand: plain,
  text: plain,
  dim: plain,
  success: plain,
  warning: plain,
  error: plain,
  code: plain,
  bold: plain,
  italic: plain,
  underline: plain,
  strike: plain,
  selected: plain,
} as unknown as Palette

function dialog(report: { submitted?: string; cancelled?: number }): SecretDialog {
  return new SecretDialog(
    'DeepSeek API key',
    'never appears in the transcript',
    palette,
    (value) => { report.submitted = value },
    () => { report.cancelled = (report.cancelled ?? 0) + 1 },
  )
}

describe('SecretDialog', () => {
  it('masks typed characters instead of rendering the secret', () => {
    const report: { submitted?: string; cancelled?: number } = {}
    const secret = dialog(report)
    for (const char of 'sk-abc') secret.handleInput(char)
    const rendered = secret.render(80).join('\n')
    expect(rendered).toContain('••••••')
    expect(rendered).not.toContain('sk-abc')
  })

  it('submits the raw value on Enter and clears the buffer', () => {
    const report: { submitted?: string; cancelled?: number } = {}
    const secret = dialog(report)
    for (const char of 'sk-1') secret.handleInput(char)
    secret.handleInput('\r')
    expect(report.submitted).toBe('sk-1')
    expect(secret.render(80).join('\n')).not.toContain('•••')
  })

  it('edits with backspace', () => {
    const report: { submitted?: string; cancelled?: number } = {}
    const secret = dialog(report)
    for (const char of 'sk-12') secret.handleInput(char)
    secret.handleInput('\u007f')
    secret.handleInput('\r')
    expect(report.submitted).toBe('sk-1')
  })

  it('cancels on Esc and on Enter while empty', () => {
    const report: { submitted?: string; cancelled?: number } = {}
    const secret = dialog(report)
    secret.handleInput('\u001b')
    secret.handleInput('\r')
    expect(report.cancelled).toBe(2)
    expect(report.submitted).toBeUndefined()
  })

  it('ignores escape sequences instead of storing them', () => {
    const report: { submitted?: string; cancelled?: number } = {}
    const secret = dialog(report)
    secret.handleInput('\u001b[A')
    secret.handleInput('k')
    secret.handleInput('\r')
    expect(report.submitted).toBe('k')
  })
})
