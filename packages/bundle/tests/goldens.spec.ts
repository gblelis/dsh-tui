/**
 * Golden screens for the ported terminal surfaces. Components render pure
 * text, so the committed snapshots are the visual contract: a change that
 * moves a border, drops a key hint or reorders a row is a reviewable diff
 * instead of a surprise in a release.
 *
 * Update the goldens with `pnpm vitest run -u`.
 */

import { describe, expect, it } from 'vitest'
import type { FileDiff } from '@deepseek-ai/dsh-tools'
import { DetailsDialog, PermissionsDialog, SecretDialog } from '../src/components/dialogs.ts'
import { renderDiff } from '../src/components/transcript.ts'
import type { Palette } from '../src/components/theme.ts'

/** Identity palette: goldens are plain text, colour lives in the theme tests. */
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

/* eslint-disable no-control-regex -- stripping terminal escape sequences is the job */
/** Strip CSI/OSC so a golden only records layout, never colour. */
function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, '')
    .replace(/\u001b\][^\u0007]*\u0007/gu, '')
}

/** Normalize trailing spaces that no reader can see. */
function golden(lines: readonly string[]): string {
  return stripAnsi(lines.join('\n')).replace(/[ \t]+$/gmu, '')
}

const permissionChoices = [
  { value: 'workspace-write', name: 'workspace-write', description: 'workspace-write sandbox with approvals' },
  { value: 'danger-full-access', name: 'danger-full-access', description: 'no sandbox, never asks' },
]

describe('permission selector golden', () => {
  it('marks the active preset and keeps the key hints', () => {
    const dialog = new PermissionsDialog(permissionChoices, 'workspace-write', palette, () => {}, () => {})
    expect(golden(dialog.render(70))).toMatchSnapshot()
  })
})

describe('login prompt golden', () => {
  it('masks the secret and names the keys', () => {
    const dialog = new SecretDialog(
      'DeepSeek API key',
      'Stored through the credentials service; the key never enters the transcript.',
      palette,
      () => {},
      () => {},
    )
    for (const char of 'sk-test-key') dialog.handleInput(char)
    expect(golden(dialog.render(80))).toMatchSnapshot()
  })
})

describe('transcript details golden', () => {
  it('renders both toggle rows with their values', () => {
    const dialog = new DetailsDialog('collapsed', false, palette, () => {}, () => {})
    expect(golden(dialog.render(70))).toMatchSnapshot()
  })
})

describe('diff golden', () => {
  const add: FileDiff = { path: 'notes/todo.md', oldText: null, newText: '# todo\n\n- write the TUI\n- publish 0.1.0\n' }
  const edit: FileDiff = {
    path: 'src/greeting.ts',
    oldText: 'export const greeting = "hello"\n',
    newText: 'export const greeting = "hello, world"\n',
  }

  it('renders a created file', () => {
    expect(golden(renderDiff(add, 1_000, palette).lines)).toMatchSnapshot()
  })

  it('renders an edit with both sides', () => {
    expect(golden(renderDiff(edit, 1_000, palette).lines)).toMatchSnapshot()
  })
})
