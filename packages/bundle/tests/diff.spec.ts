import { describe, expect, it } from 'vitest'
import type { FileDiff } from '@deepseek-ai/dsh-tools'
import { renderDiff } from '../src/components/transcript.ts'
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

function diff(oldText: string | null, newText: string): FileDiff {
  return { path: 'notes.txt', oldText, newText }
}

describe('renderDiff', () => {
  it('renders a new file as added lines with exact totals', () => {
    const rendered = renderDiff(diff(null, 'alpha\nbeta\n'), 1_000, palette)
    expect(rendered.added).toBe(2)
    expect(rendered.removed).toBe(0)
    expect(rendered.approximate).toBe(false)
    expect(rendered.lines).toEqual(['notes.txt', '+ alpha', '+ beta'])
  })

  it('counts exact additions and removals for an edit', () => {
    const rendered = renderDiff(diff('one\ntwo\nthree\n', 'one\n2\nthree\n'), 1_000, palette)
    expect(rendered.added).toBe(1)
    expect(rendered.removed).toBe(1)
    expect(rendered.approximate).toBe(false)
    expect(rendered.lines).toContain('+ 2')
    expect(rendered.lines).toContain('- two')
  })

  it('falls back to whole-side rendering when the edit is too large to compare', () => {
    const rendered = renderDiff(diff('a\nb\nc\n', 'x\ny\nz\n'), 1, palette)
    expect(rendered.approximate).toBe(true)
    expect(rendered.added).toBe(3)
    expect(rendered.removed).toBe(3)
    expect(rendered.lines[1]).toBe('[exact line diff omitted: >1 changed lines]')
    expect(rendered.lines).toContain('- a')
    expect(rendered.lines).toContain('+ x')
  })

  it('treats a trailing newline as a terminator, not an extra line', () => {
    const withNewline = renderDiff(diff(null, 'only\n'), 1_000, palette)
    const without = renderDiff(diff(null, 'only'), 1_000, palette)
    expect(withNewline).toEqual(without)
  })
})
