import { describe, expect, it } from 'vitest'
import { PermissionsDialog } from '../src/components/dialogs.ts'
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

const choices = [
  { value: 'workspace-write', name: 'Workspace write', description: 'write inside the workspace and ask' },
  { value: 'danger-full-access', name: 'Full access' },
]

describe('PermissionsDialog', () => {
  it('marks the active preset and lists explanations', () => {
    const lines = new PermissionsDialog(choices, 'workspace-write', palette, () => {}, () => {}).render(120).join('\n')
    expect(lines).toContain('Permission preset')
    expect(lines).toContain('Workspace write (current)')
    expect(lines).toContain('write inside the workspace and ask')
    expect(lines).toContain('Full access')
  })

  it('applies the highlighted preset on Enter and closes on Esc', () => {
    let applied: string | undefined
    let closed = false
    const dialog = new PermissionsDialog(choices, 'workspace-write', palette, (value) => { applied = value }, () => { closed = true })
    dialog.handleInput('\r')
    expect(applied).toBe('workspace-write')
    dialog.handleInput('\u001b')
    expect(closed).toBe(true)
  })
})
