/**
 * This app's command line: the terminal front door's flags are parsed here and
 * published as `ctx.tuiStartup`, which the `tui` row injects. The same row
 * guards the front door: a profile whose UI row failed to import must exit
 * non-zero instead of leaving a live process with no interface.
 * @module @gblelis/dsh-tui-bundle/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'tui-startup'

/** Services required before the command line can be resolved. */
export const inject = ['cmdlineArgs'] as const

/** Service provided by this plugin and injected by the terminal front door. */
export const TUI_STARTUP_SERVICE = 'tuiStartup'

/** What the front-door row reads from {@link TUI_STARTUP_SERVICE}. */
export interface TuiStartupValues {
  /** Exact session identity to open, creating it when it does not exist yet. */
  sessionId?: string
  /** Persisted session to resume. */
  resumeSessionId?: string
  /** Open the interactive session picker at startup. */
  pickSession?: boolean
  /** Resume the newest session recorded in this working directory. */
  continueSession?: boolean
  /** Initial provider route. */
  provider?: string
  /** Initial model id. */
  model?: string
  /** Initial adapter-owned reasoning effort. */
  reasoningEffort?: string
  /** Permission preset applied before the first turn. */
  permissionMode?: string
  /** Whether the welcome panel is offered on a fresh session. */
  showWelcome?: boolean
  /** Whether to check published dsh releases. */
  updateCheck?: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Parsed arguments of this terminal invocation. */
    tuiStartup: TuiStartupValues
  }
}

/** Resolve one `--model` spelling into a provider/model pair. */
function parseModelSpec(spec: string): { provider?: string; model: string } {
  const trimmed = spec.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) return { model: trimmed }
  return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) }
}

/** This app's command: the terminal flags and their help text. */
function tuiCommand(): Command {
  return new Command()
    .name('dsh-tui')
    .description('Interactive terminal front end for DeepSeek Harness.')
    .option('--resume [id]', 'resume a persisted session; omit the id to choose from a list')
    .option('--continue', 'resume the newest session recorded in this working directory')
    .option('--new', 'start a fresh session even when a resumable one exists')
    .option('--session-id <id>', 'open this exact session id, creating it when absent')
    .option('--model <[provider/]model>', 'initial model for this session')
    .option('--reasoning-effort <id>', 'initial reasoning effort for this session')
    .option('--permission-mode <preset>', 'permission preset to apply, e.g. read-only or workspace-write')
    .option('--no-welcome', 'skip the welcome panel on a fresh session (compact header)')
    .option('--no-update-check', 'skip the lookup of published dsh releases')
    .addHelpText('after', `
Examples:
  dsh-tui                        fresh session in this working directory
  dsh-tui --continue             resume the newest session of this directory
  dsh-tui --resume               choose a session interactively
  dsh-tui --resume 01j...        resume one exact session
  dsh-tui --model deepseek-official/deepseek-v4-pro
`)
}

/**
 * Publish the parsed invocation and install the front-door activation guard.
 * @param ctx - plugin context carrying the launcher's command line and exit request.
 */
export function apply(ctx: Context): void {
  const program = tuiCommand()

  program.action(() => {
    const options = program.opts<{
      resume?: string | true
      continue?: boolean
      new?: boolean
      sessionId?: string
      model?: string
      reasoningEffort?: string
      permissionMode?: string
      welcome?: boolean
      updateCheck?: boolean
    }>()
    // Commander rejects unknown options before this action runs, so every
    // conflict below is a user-choice conflict, not a grammar error.
    const sessionId = options.sessionId?.trim()
    if (sessionId !== undefined && sessionId === '') program.error('error: --session-id requires a non-empty session id')
    const resumeSessionId = typeof options.resume === 'string' ? options.resume.trim() : undefined
    if (resumeSessionId !== undefined && resumeSessionId === '') program.error('error: --resume requires a non-empty session id when one is given')
    const pickSession = options.resume === true
    const continueSession = options.continue === true
    const exclusive = [resumeSessionId !== undefined || pickSession, continueSession, sessionId !== undefined]
      .filter(Boolean).length
    if (exclusive > 1) {
      program.error('error: --resume, --continue and --session-id are mutually exclusive')
    }
    if (options.new === true && exclusive > 0) {
      program.error('error: --new cannot be combined with --resume, --continue or --session-id')
    }
    const modelSpec = options.model?.trim()
    if (modelSpec !== undefined && modelSpec === '') program.error('error: --model requires a provider/model value')
    const permissionMode = options.permissionMode?.trim()
    if (permissionMode !== undefined && permissionMode === '') program.error('error: --permission-mode requires a preset name')
    const reasoningEffort = options.reasoningEffort?.trim()
    if (reasoningEffort !== undefined && reasoningEffort === '') program.error('error: --reasoning-effort requires a value')

    const model = modelSpec === undefined ? undefined : parseModelSpec(modelSpec)
    const values: TuiStartupValues = {
      ...sessionId === undefined ? {} : { sessionId },
      ...resumeSessionId === undefined ? {} : { resumeSessionId },
      ...pickSession ? { pickSession } : {},
      ...continueSession ? { continueSession } : {},
      ...model?.provider === undefined ? {} : { provider: model.provider },
      ...model === undefined ? {} : { model: model.model },
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
      ...permissionMode === undefined ? {} : { permissionMode },
      ...options.welcome === false ? { showWelcome: false } : {},
      ...options.updateCheck === false ? { updateCheck: false } : {},
    }
    ctx.provide(TUI_STARTUP_SERVICE, values)
  })

  parseCmdline(ctx, program)

  // A profile bundle whose front-door row failed to import keeps the process
  // alive with no interface: the Loader reports a warning and exits 0. Detect
  // that after startup commits and turn it into an explicit failure. The front
  // door mounts asynchronously (it waits for the loader to settle before it can
  // create an Agent), so a missing service is only fatal once its entry is no
  // longer able to provide one.
  let cancelled = false
  const fail = (detail: string): void => {
    if (cancelled) return
    cancelled = true
    process.stderr.write(`dsh-tui: ${detail}\n`)
    ctx.get('appExit')?.(1)
  }
  const reportInactive = (): void => {
    fail('the terminal front door did not activate. The profile bundle is present but its UI row failed to load; '
      + "run 'dsh-tui doctor' and check the dsh logs for the entry failure.")
  }
  const guard = (): void => {
    if (cancelled || ctx.get('tui') !== undefined) return
    const entry = findTuiEntry(ctx)
    if (entry === undefined) {
      fail(`the profile does not define the "${TUI_ROW_ID}" row. Run 'dsh-tui sync' to restore the bundle, then retry.`)
      return
    }
    if (!entry.usable()) {
      reportInactive()
      return
    }
    // Still mounting: session adoption and the session index legitimately take
    // a moment. Poll the entry until it provides the service, dies, or the
    // deadline passes.
    const deadline = Date.now() + ACTIVATION_TIMEOUT_MS
    const tick = (): void => {
      if (cancelled) return
      if (ctx.get('tui') !== undefined) {
        cancelled = true
        return
      }
      if (!entry.usable()) {
        reportInactive()
        return
      }
      if (Date.now() >= deadline) {
        fail(`the terminal front door is still starting after ${ACTIVATION_TIMEOUT_MS / 1000}s. `
          + `Run 'dsh-tui doctor' and check the dsh logs.`)
        return
      }
      setTimeout(tick, ACTIVATION_POLL_MS)
    }
    setTimeout(tick, ACTIVATION_POLL_MS)
  }
  let cancelReady: (() => void) | undefined
  const ready = ctx.get('appReady')
  if (ready === undefined) {
    const loader = ctx.get('loader')
    void Promise.resolve(loader?.await()).then(guard, () => {})
  } else {
    cancelReady = ready.onReady(guard)
  }
  ctx.effect(() => () => {
    cancelled = true
    cancelReady?.()
  }, 'tui-startup:activation-guard')
}

/**
 * Cordis fiber states that can still provide a service (the enum is const and
 * erased at runtime, so the values are mirrored here).
 */
const FIBER_PENDING = 0
const FIBER_LOADING = 1
const FIBER_ACTIVE = 2

/** Id of the row this bundle contributes as the terminal front door. */
const TUI_ROW_ID = 'tui'

/** How long the front door may take to provide `ctx.tui` after startup commits. */
const ACTIVATION_TIMEOUT_MS = 15_000

/** Poll interval while the front door is mounting. */
const ACTIVATION_POLL_MS = 100

/**
 * Locate the front-door entry and report whether it can still activate.
 * @param ctx - Context exposing the Loader service.
 * @returns the entry probe, or `undefined` when the profile has no such row.
 */
function findTuiEntry(ctx: Context): { usable: () => boolean } | undefined {
  const loader = ctx.get('loader')
  if (loader === undefined) return { usable: () => true }
  for (const entry of loader.entries()) {
    if (entry.options.id !== TUI_ROW_ID) continue
    return {
      usable: () => {
        const fiber = entry.fiber
        if (fiber === undefined) return false
        // FAILED, DISPOSED and UNLOADING can never provide the service again.
        return fiber.state === FIBER_PENDING
          || fiber.state === FIBER_LOADING
          || fiber.state === FIBER_ACTIVE
      },
    }
  }
  return undefined
}

export default apply
