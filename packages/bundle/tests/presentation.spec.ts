/**
 * Ported presentation logic: prompt templates, token accounting, timing
 * buckets, skill parsing, and configuration defaults. These modules are pure
 * functions over log data, so they need no live agent or terminal.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { parseTuiPromptTemplate, renderTuiPromptTemplate } from '../src/prompt-service.ts'
import { cacheHitRate, formatTokens, recordTokenUsage, sessionTokens } from '../src/chat/tokens.ts'
import {
  formatQueuedStatus,
  formatStatusDuration,
  LiveStepTiming,
  openStepPhase,
  openTurn,
  StepTimingTracker,
} from '../src/chat/timing.ts'
import { parseSkillCommand, SKILL_COMMAND_PREFIX } from '../src/chat/skill-invocation.ts'
import { resolveTuiConfig } from '../src/config.ts'

/** Build one event with the sequence-shaped envelope the UI reads. */
function event(seq: number, body: Record<string, unknown>, time: number = 1_000 + seq): SessionEvent {
  return { ...body, seq, time } as unknown as SessionEvent
}

describe('prompt templates', () => {
  it('parses literal and value tokens in order', () => {
    expect(parseTuiPromptTemplate('a ${x} b ${y}z')).toEqual([
      { kind: 'literal', value: 'a ' },
      { kind: 'value', name: 'x' },
      { kind: 'literal', value: ' b ' },
      { kind: 'value', name: 'y' },
      { kind: 'literal', value: 'z' },
    ])
  })

  it('drops the whitespace a missing value would have separated', () => {
    const tokens = parseTuiPromptTemplate('${cwd} ${git}${model}')
    expect(renderTuiPromptTemplate(tokens, name => name === 'cwd' ? '/work' : undefined)).toBe('/work ')
    // The trailing space of `a ` stays; only the literal that follows a
    // missing value loses its leading spaces, so no double gap appears.
    expect(renderTuiPromptTemplate(parseTuiPromptTemplate('a ${x} b'), () => undefined)).toBe('a b')
    expect(renderTuiPromptTemplate(parseTuiPromptTemplate('a ${x} b'), () => 'X')).toBe('a X b')
    expect(renderTuiPromptTemplate(parseTuiPromptTemplate('a ${x} ${y}'), name => name === 'y' ? 'Y' : undefined)).toBe('a Y')
  })
})

describe('token accounting', () => {
  it('replaces usage logged twice for the same step', () => {
    const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, byStep: new Map() }
    const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }
    recordTokenUsage(totals, 1, 1, usage)
    recordTokenUsage(totals, 1, 1, { ...usage, inputTokens: 20 })
    expect(totals.input).toBe(20)
    expect(totals.output).toBe(5)
    expect(totals.byStep.size).toBe(1)
  })

  it('folds the durable assistant message and ignores other events', () => {
    const events = [
      event(0, { type: 'turn/start', data: { turn: 1 } }),
      event(1, { type: 'assistant/message', data: {
        turn: 1, step: 1, message: { role: 'assistant', content: [] }, stream: [],
        usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 0 },
      } }),
    ]
    const totals = sessionTokens(events)
    expect(totals).toMatchObject({ input: 100, output: 30, cacheRead: 50, cacheWrite: 0 })
    expect(cacheHitRate(totals)).toBe(33)
    expect(cacheHitRate(sessionTokens([]))).toBeUndefined()
  })

  it('formats compact token counts', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1_500)).toBe('1.5k')
    expect(formatTokens(45_000)).toBe('45k')
    expect(formatTokens(1_250_000)).toBe('1.3m')
  })
})

describe('turn and step position', () => {
  const open = [
    event(0, { type: 'turn/start', data: { turn: 2 } }),
    event(1, { type: 'step/start', data: { turn: 2, step: 1 } }),
  ]
  const closed = [...open, event(2, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })]

  it('reports the open turn', () => {
    expect(openTurn(open)).toBe(2)
    expect(openTurn(closed)).toBeUndefined()
  })

  it('reports the open step phase after the first token', () => {
    expect(openStepPhase(open)).toBe('ttft')
    const streaming = [...open, event(2, { type: 'assistant/message', data: {
      turn: 2, step: 1, message: { role: 'assistant', content: [] },
      stream: [{ type: 'chunk', time: 1_010, chunk: { type: 'text-delta', index: 0, text: 'hi' } }],
    } })]
    expect(openStepPhase(streaming)).toBe('responding')
  })

  it('accumulates per-phase wall time from the durable stream', () => {
    const tracker = new StepTimingTracker()
    const events = [
      event(0, { type: 'step/start', data: { turn: 1, step: 1 } }, 1_000),
      event(1, { type: 'assistant/message', data: {
        turn: 1, step: 1, message: { role: 'assistant', content: [] },
        stream: [
          { type: 'chunk', time: 1_100, chunk: { type: 'reasoning-delta', index: 0, text: 'think' } },
          { type: 'chunk', time: 1_300, chunk: { type: 'text-delta', index: 1, text: 'answer' } },
        ],
      } }, 1_400),
      event(2, { type: 'step/end', data: { turn: 1, step: 1 } }, 2_000),
    ]
    const totals = tracker.totalsAt(events, { turn: 1, step: 1 }, 2_500)
    expect(totals.ttft).toBe(100)
    expect(totals.thinking).toBe(200)
    expect(totals.responding).toBe(700)
    expect(totals.tools).toBe(0)
  })

  it('tracks the live phase from stream frames', () => {
    const live = new LiveStepTiming(1_000)
    expect(live.bucket).toBe('ttft')
    live.advance({ type: 'reasoning-delta', index: 0, text: 'hmm' }, 1_050)
    expect(live.bucket).toBe('thinking')
    live.advance({ type: 'text-delta', index: 1, text: 'ok' }, 1_150)
    expect(live.bucket).toBe('responding')
    live.close(1_250)
    expect(live.totalsAt(2_000)).toEqual({ ttft: 50, thinking: 100, responding: 100, tools: 0 })
  })
})

describe('status formatting', () => {
  it('formats elapsed durations', () => {
    expect(formatStatusDuration(1_250)).toBe('1.2s')
    expect(formatStatusDuration(65_400)).toBe('1m05.4s')
  })

  it('shows a queued badge only while steering waits', () => {
    expect(formatQueuedStatus(0)).toBeUndefined()
    expect(formatQueuedStatus(3)).toBe('3 queued')
  })
})

describe('skill commands', () => {
  it('parses the prefix, name, and instructions', () => {
    expect(parseSkillCommand(`${SKILL_COMMAND_PREFIX}review check the diff`)).toEqual({ name: 'review', instructions: 'check the diff' })
    expect(parseSkillCommand(`${SKILL_COMMAND_PREFIX}`)).toEqual({ name: '', instructions: '' })
    expect(parseSkillCommand('/skill:a   spaced ')).toEqual({ name: 'a', instructions: 'spaced' })
    expect(parseSkillCommand('/skill:review')).toEqual({ name: 'review', instructions: '' })
  })
})

describe('configuration defaults', () => {
  it('fills every presentation default', () => {
    const resolved = resolveTuiConfig(undefined)
    expect(resolved.showReasoning).toBe(true)
    expect(resolved.maxToolOutputLines).toBe(6)
    expect(resolved.theme.leftPrompt).toContain('${model}')
    expect(resolved.theme.inputPlaceholder).toContain('steer')
    expect(resolved.title).toBe('DeepSeek Harness')
    expect(resolved.fileSearchExcludedDirectories).toEqual(['.git', 'node_modules'])
  })

  it('honors explicit overrides', () => {
    const resolved = resolveTuiConfig({ showReasoning: false, maxToolOutputLines: 12, theme: { color: false } })
    expect(resolved.showReasoning).toBe(false)
    expect(resolved.maxToolOutputLines).toBe(12)
    expect(resolved.theme.color).toBe(false)
    expect(resolved.theme.truecolor).toBe(false)
  })
})
