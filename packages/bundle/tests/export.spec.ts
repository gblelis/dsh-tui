import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { exportFileName, renderSessionMarkdown } from '../src/chat/export.ts'

const header = {
  sessionId: 'session-1',
  cwd: '/work',
  title: 'Fix the bug',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  exportedAt: new Date('2026-01-02T04:00:00.000Z'),
}

function events(): SessionEvent[] {
  return [
    {
      seq: 1,
      type: 'system/message',
      data: { turn: 1, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'SYSTEM PROMPT' }] } },
    },
    {
      seq: 2,
      type: 'user/message',
      data: {
        role: 'user',
        id: 'u1',
        source: { kind: 'user' },
        content: [{ type: 'text', text: 'please fix it' }],
      },
    },
    {
      seq: 3,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        stream: [],
        message: {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'SECRET REASONING' },
            { type: 'text', text: 'Reading the file.' },
            { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{"path":"a.ts"}' },
          ],
        },
      },
    },
    {
      seq: 4,
      type: 'tool/result',
      data: {
        turn: 1,
        step: 1,
        message: {
          role: 'tool',
          toolCallId: 'call-1',
          isError: true,
          content: [{ type: 'text', text: 'export const a = 1' }],
        },
      },
    },
  ] as unknown as SessionEvent[]
}

describe('renderSessionMarkdown', () => {
  const markdown = renderSessionMarkdown(events(), new Set([2, 3, 4]), header)

  it('writes a preamble with the session identity', () => {
    expect(markdown.startsWith('# Fix the bug\n')).toBe(true)
    expect(markdown).toContain('- Session: `session-1`')
    expect(markdown).toContain('- Workspace: `/work`')
    expect(markdown).toContain('- Created: 2026-01-02T03:04:05.000Z')
    expect(markdown).toContain('- Exported: 2026-01-02T04:00:00.000Z')
  })

  it('renders the visible conversation in order', () => {
    expect(markdown.indexOf('## You')).toBeLessThan(markdown.indexOf('## Assistant'))
    expect(markdown).toContain('please fix it')
    expect(markdown).toContain('Reading the file.')
  })

  it('labels tool calls and names their results', () => {
    expect(markdown).toContain('**Tool call: `read`**')
    expect(markdown).toContain('```json\n{"path":"a.ts"}\n```')
    expect(markdown).toContain('### Tool: read (failed)')
    expect(markdown).toContain('export const a = 1')
  })

  it('omits synthetic context messages', () => {
    const injected = [
      {
        seq: 2,
        type: 'user/message',
        data: {
          role: 'user',
          id: 'ctx',
          source: { kind: 'runtime-context', form: 'snapshot', sections: [] },
          content: [{ type: 'text', text: 'SYNTHETIC CONTEXT' }],
        },
      },
    ] as unknown as SessionEvent[]
    const rendered = renderSessionMarkdown(injected, new Set([2]), header)
    expect(rendered).not.toContain('SYNTHETIC CONTEXT')
    expect(rendered).not.toContain('## You')
  })

  it('omits events outside the folded surface and hidden reasoning', () => {
    expect(markdown).not.toContain('SYSTEM PROMPT')
    expect(markdown).not.toContain('SECRET REASONING')
  })

  it('extends the fence when the body contains backticks', () => {
    const nested = [
      {
        seq: 2,
        type: 'tool/result',
        data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'x', content: [{ type: 'text', text: 'a ```js``` b' }] } },
      },
    ] as unknown as SessionEvent[]
    const rendered = renderSessionMarkdown(nested, new Set([2]), { ...header, title: '' })
    expect(rendered.startsWith('# Session transcript\n')).toBe(true)
    expect(rendered).toContain('````\na ```js``` b\n````')
  })
})

describe('exportFileName', () => {
  it('stamps the export time and adds a counter on collision', () => {
    const now = new Date('2026-01-02T03:04:05.000Z')
    const taken = new Set<string>()
    const first = exportFileName(now, name => taken.has(name))
    taken.add(first)
    const second = exportFileName(now, name => taken.has(name))
    expect(first).toBe('dsh-transcript-2026-01-02T03-04-05-000.md')
    expect(second).toBe('dsh-transcript-2026-01-02T03-04-05-000-2.md')
  })
})
