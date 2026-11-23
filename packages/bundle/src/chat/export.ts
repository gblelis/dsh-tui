/**
 * Render a session as a Markdown transcript for `/export`.
 *
 * The renderer is pure and takes the already-folded surface, so the command
 * never re-interprets session semantics: it walks the events the model saw, in
 * order, and writes what a reader would need to follow the conversation.
 * @module chat/export
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** Metadata printed in the transcript preamble. */
export interface ExportHeader {
  /** Session this transcript came from. */
  sessionId: string
  /** Working directory the session was created in. */
  cwd: string
  /** Session title when one is known. */
  title?: string
  /** Session creation time, for the "created" line. */
  createdAt?: Date
  /** Export time, for the "exported" line. */
  exportedAt: Date
}

/** Fence a code block longer than any backtick run inside the body. */
function fence(body: string, language = ''): string {
  const runs = [...body.matchAll(/`+/gu)].map(match => match[0].length)
  const longest = runs.length === 0 ? 0 : Math.max(...runs)
  const marker = '`'.repeat(Math.max(3, longest + 1))
  return `${marker}${language}\n${body}\n${marker}`
}

/** Render the text-bearing blocks of one message body. */
function renderBlocks(blocks: readonly ContentBlock[], callNames: Map<string, string>, fenceText = false): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        if (block.text.trim() !== '') parts.push(fenceText ? fence(block.text.trimEnd()) : block.text.trimEnd())
        break
      case 'reasoning':
        // Reasoning is not part of the durable conversation a reader wants.
        break
      case 'image':
        parts.push('_(image)_')
        break
      case 'file':
        parts.push('_(attached file)_')
        break
      case 'tool-call': {
        callNames.set(String(block.id), block.name)
        parts.push(`**Tool call: \`${block.name}\`**\n\n${fence(block.arguments, 'json')}`)
        break
      }
      default:
        break
    }
  }
  return parts.join('\n\n')
}

/** Render one session as a Markdown document. */
export function renderSessionMarkdown(
  events: readonly SessionEvent[],
  visible: ReadonlySet<number>,
  header: ExportHeader,
): string {
  const callNames = new Map<string, string>()
  const lines: string[] = []
  const title = header.title === undefined || header.title === '' ? 'Session transcript' : header.title
  lines.push(`# ${title}`, '')
  lines.push(`- Session: \`${header.sessionId}\``)
  lines.push(`- Workspace: \`${header.cwd}\``)
  const iso = (value: Date): string => Number.isNaN(value.getTime()) ? 'unknown' : value.toISOString()
  if (header.createdAt !== undefined) lines.push(`- Created: ${iso(header.createdAt)}`)
  lines.push(`- Exported: ${iso(header.exportedAt)}`, '')

  for (const event of events) {
    if (!visible.has(event.seq)) continue
    if (event.type === 'user/message') {
      // Synthetic context (runtime snapshot, skill catalog, reminders) is
      // model input, not conversation: a reader wants what the human typed.
      if (event.data.source.kind !== 'user') continue
      const body = renderBlocks(event.data.content, callNames)
      if (body !== '') lines.push('## You', '', body, '')
      continue
    }
    if (event.type === 'assistant/message') {
      const body = renderBlocks(event.data.message.content, callNames)
      if (body !== '') lines.push('## Assistant', '', body, '')
      continue
    }
    if (event.type === 'tool/result') {
      const name = callNames.get(String(event.data.message.toolCallId)) ?? 'tool'
      const body = renderBlocks(event.data.message.content, callNames, true)
      if (body === '') continue
      const failed = event.data.message.isError === true ? ' (failed)' : ''
      lines.push(`### Tool: ${name}${failed}`, '', body, '')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** Choose a file name that does not overwrite an earlier export. */
export function exportFileName(now: Date, taken: (name: string) => boolean): string {
  const stamp = now.toISOString().replace(/[:.]/gu, '-').replace(/Z$/u, '')
  const base = `dsh-transcript-${stamp}`
  let candidate = `${base}.md`
  let counter = 2
  while (taken(candidate)) {
    candidate = `${base}-${String(counter)}.md`
    counter += 1
  }
  return candidate
}
