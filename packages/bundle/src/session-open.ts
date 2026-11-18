/**
 * Owns the one Agent a terminal invocation drives: creates a fresh session,
 * resumes a persisted one, or adopts the id the caller named. Every entry point
 * is explicit — there is no implicit "last session" magic — so a typo can never
 * masquerade as a brand-new conversation.
 * @module @gblelis/dsh-tui-bundle/session-open
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  installModelSelection,
  type Agent,
  type AgentHandle,
  type AgentOptions,
  type ModelSelection,
} from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import type { TuiStartupValues } from './startup.ts'

/** The live Agent a terminal invocation drives, plus its replay history. */
export interface OpenedSession {
  readonly agent: Agent
  /** Owns teardown of the Agent this process created or resumed. */
  readonly handle: AgentHandle
  /** Immutable log replay snapshot taken before the UI mounted. */
  readonly events: readonly SessionEvent[]
  /** Whether the log continued persisted history rather than starting fresh. */
  readonly resumed: boolean
}

/** Build the model selection an explicit override or the persisted default names. */
function initialModel(ctx: Context, startup: TuiStartupValues): ModelSelection | undefined {
  if (startup.provider !== undefined && startup.model !== undefined) {
    return {
      provider: startup.provider,
      model: startup.model,
      ...startup.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(startup.reasoningEffort) },
    }
  }
  const defaults = ctx.get('agentDefaultModel')
  if (defaults === undefined) return undefined
  const selection = defaults.currentSelection()
  if (startup.model !== undefined) {
    return {
      provider: selection.provider,
      model: startup.model,
      ...startup.reasoningEffort === undefined ? { ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort } } : { reasoningEffort: ReasoningEffortId(startup.reasoningEffort) },
    }
  }
  if (startup.provider !== undefined) {
    return {
      provider: startup.provider,
      model: selection.model,
      ...startup.reasoningEffort === undefined ? { ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort } } : { reasoningEffort: ReasoningEffortId(startup.reasoningEffort) },
    }
  }
  if (startup.reasoningEffort === undefined) return { ...selection }
  return { provider: selection.provider, model: selection.model, reasoningEffort: ReasoningEffortId(startup.reasoningEffort) }
}

/** Read one persisted/session log; `undefined` when the identity does not exist. */
async function readEvents(ctx: Context, sessionId: SessionId): Promise<readonly SessionEvent[] | undefined> {
  const query = ctx.get('sessionQuery')
  if (query === undefined) return undefined
  try {
    return (await query.readSession(sessionId)).events
  } catch (error: unknown) {
    if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') return undefined
    throw error
  }
}

/**
 * Refuse a persisted Session this terminal cannot honestly continue: a subagent
 * log has no human conversation, and a Session recorded in another workspace
 * would run this process's tools against the wrong directory.
 * @param header - the persisted Session header under consideration.
 * @param sessionId - identity named in diagnostics.
 */
function assertAdoptable(header: { cwd?: string; origin?: 'subagent' }, sessionId: SessionId): void {
  if (header.origin === 'subagent') {
    throw new Error(`session "${sessionId}" is a subagent session and cannot be driven directly`)
  }
  if (header.cwd !== undefined && header.cwd !== process.cwd()) {
    throw new Error(`session "${sessionId}" was recorded in "${header.cwd}"; run dsh-tui from that directory to resume it`)
  }
}

/** Candidate sessions for `--continue`, newest first, in this workspace. */
interface ContinueCandidate {
  readonly id: SessionId
  readonly createdAt: number
}

async function newestSessionInWorkspace(ctx: Context): Promise<ContinueCandidate | undefined> {
  const query = ctx.get('sessionQuery')
  if (query === undefined) return undefined
  const records = await query.listSessions()
  return records
    .filter(record => record.header.cwd === process.cwd() && record.header.origin !== 'subagent')
    .map(record => ({ id: record.header.id, createdAt: record.header.createdAt }))
    .sort((left, right) => right.createdAt - left.createdAt)[0]
}

/**
 * Resolve the invocation's Agent. Composition must already be settled: this
 * creates the Agent's scoped world, which reads every sibling service.
 * @param ctx - plugin context carrying the registry, defaults, and storage.
 * @param startup - parsed command line of this invocation.
 * @returns the Agent, its handle, and the replay snapshot of its log.
 */
export async function openSession(ctx: Context, startup: TuiStartupValues): Promise<OpenedSession> {
  const agents = ctx.get('agents')
  if (agents === undefined) throw new Error('dsh-tui: the agents service is not mounted; dsh-base provides it')
  const selection = initialModel(ctx, startup)
  const setup = (agentCtx: Context, agent: Agent): void => {
    installModelSelection(agentCtx)
    // A resumed Session continues with this invocation's configured route when
    // the user overrode it; an unchanged route keeps its recorded effort.
    if (selection !== undefined && (startup.provider !== undefined || startup.model !== undefined || startup.reasoningEffort !== undefined)) {
      const previous = agent.model.current()
      const configured: ModelSelection = { ...selection }
      if (configured.reasoningEffort === undefined && previous !== undefined
        && previous.provider === configured.provider && previous.model === configured.model
        && previous.reasoningEffort !== undefined) {
        configured.reasoningEffort = previous.reasoningEffort
      }
      agent.model.select(configured)
    }
  }
  const agentOptions: AgentOptions = selection === undefined ? {} : { ...selection }

  const resumeNamed = async (sessionId: SessionId, label: string): Promise<OpenedSession> => {
    const events = await readEvents(ctx, sessionId)
    if (events === undefined) {
      throw new Error(`session "${sessionId}" does not exist; omit ${label} to start a new session`)
    }
    const { agent, dispose } = await agents.resume({ resumeSessionId: sessionId, agentOptions, setup })
    assertAdoptable(agent.session.header, sessionId)
    return { agent, handle: { agent, dispose }, events, resumed: true }
  }

  if (startup.resumeSessionId !== undefined) {
    return resumeNamed(startup.resumeSessionId as SessionId, '--resume')
  }
  if (startup.continueSession === true) {
    const newest = await newestSessionInWorkspace(ctx)
    if (newest === undefined) {
      throw new Error(`no resumable session was recorded in "${process.cwd()}"; run dsh-tui without --continue to start one`)
    }
    return resumeNamed(newest.id, '--continue')
  }
  let sessionId: SessionId
  if (startup.sessionId !== undefined) {
    sessionId = startup.sessionId as SessionId
    if (agents.get(sessionId) !== undefined) {
      throw new Error(`session "${sessionId}" is already live in this process`)
    }
    const events = await readEvents(ctx, sessionId)
    if (events !== undefined) {
      const { agent, dispose } = await agents.resume({ resumeSessionId: sessionId, agentOptions, setup })
      assertAdoptable(agent.session.header, sessionId)
      return { agent, handle: { agent, dispose }, events, resumed: true }
    }
  } else {
    sessionId = `session-${randomUUID()}` as SessionId
  }
  const handle = await agents.create({
    sessionId,
    meta: { cwd: process.cwd() },
    agentOptions,
    setup,
  })
  return { agent: handle.agent, handle, events: [], resumed: false }
}

/**
 * Apply the invocation's permission preset before its first turn.
 * @param ctx - plugin context carrying the preset catalog.
 * @param session - the Session the preset applies to.
 * @param preset - preset name from the command line.
 */
export function applyPermissionPreset(ctx: Context, session: Session, preset: string): void {
  const permissions = ctx.get('permissionPresets')
  if (permissions === undefined) {
    throw new Error('dsh-tui: --permission-mode requires the permissionPresets service; dsh-base provides it')
  }
  // Resolve first so an unknown preset fails loudly instead of silently
  // leaving the deployment default in place.
  permissions.resolve(preset)
  permissions.set(session, preset)
}
