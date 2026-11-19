import { describe, expect, it } from 'vitest'
import { WelcomeComponent, type WelcomeSnapshot } from '../src/components/welcome.ts'
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

const snapshot: WelcomeSnapshot = {
  sessionId: 'session-1234-abcd',
  model: 'deepseek-official/deepseek-flash',
  effort: 'high',
  cwd: '~/work/project',
  branch: 'main',
  permission: 'workspace-write',
}

function panel(value: WelcomeSnapshot = snapshot, variant?: 'panel' | 'compact'): WelcomeComponent {
  return new WelcomeComponent(() => value, palette, false, variant)
}

describe('WelcomeComponent', () => {
  it('renders a centred card with the mark, facts and hints', () => {
    const lines = panel().render(100)
    const text = lines.join('\n')
    expect(lines[0]).toContain('╭')
    expect(lines.at(-1)).toContain('╰')
    expect(text).toContain('DEEPSEEK HARNESS')
    expect(text).toContain('terminal front end for DeepSeek Harness')
    expect(text).toContain('model      deepseek-official/deepseek-flash · high')
    expect(text).toContain('directory  ~/work/project (main)')
    expect(text).toContain('permission workspace-write')
    expect(text).toContain('session    session-1234-abcd')
    expect(text).toContain('/help commands')
    expect(text).toContain('Ctrl+O tool cards')
  })

  it('keeps the card within the terminal and never exceeds its width', () => {
    const lines = panel().render(60)
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(60)
  })

  it('falls back to the compact header on a narrow terminal', () => {
    const lines = panel().render(40)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('DEEPSEEK HARNESS')
    expect(lines[1]).toContain('session-1234-abcd')
    expect(lines.join('\n')).not.toContain('╭')
  })

  it('honours the compact variant regardless of width', () => {
    const lines = panel(snapshot, 'compact').render(120)
    expect(lines).toHaveLength(2)
    expect(lines.join('\n')).not.toContain('╭')
  })

  it('omits optional rows that are not known', () => {
    const text = panel({ sessionId: 'session-x', cwd: '~/only' }).render(80).join('\n')
    expect(text).not.toContain('model      ')
    expect(text).not.toContain('permission ')
    expect(text).toContain('session    session-x')
  })

  it('reads live state on every frame', () => {
    let current: WelcomeSnapshot = snapshot
    const header = new WelcomeComponent(() => current, palette, false)
    expect(header.render(80).join('\n')).toContain('workspace-write')
    current = { ...snapshot, permission: 'danger-full-access', model: 'deepseek-official/deepseek-v4-pro' }
    const updated = header.render(80).join('\n')
    expect(updated).toContain('danger-full-access')
    expect(updated).toContain('deepseek-v4-pro')
    expect(updated).not.toContain('workspace-write')
  })

  it('uses a configured tagline (or session title) instead of the default', () => {
    const text = panel({ ...snapshot, tagline: 'fix the welcome screen' }).render(80).join('\n')
    expect(text).toContain('fix the welcome screen')
    expect(text).not.toContain('terminal front end for')
  })
})
