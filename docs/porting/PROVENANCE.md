# Provenance of the ported terminal front end

This file maps the terminal UI in `packages/bundle/src` to its upstream origin, records what was rewritten
for the published DSH API, and states the license terms that apply to the ported material.

## Origin

| Fact | Value |
| --- | --- |
| Project | DeepSeek Harness — <https://github.com/deepseek-ai/deepseek-harness> |
| Package | `@deepseek-ai/dsh-tui` (`packages/ui/tui`) |
| License of that package | **BSD-3-Clause**, `Copyright (c) DeepSeek` |
| Last commit containing it | `7248b5ec8f` (its parent; the package was deleted in `10bb9cbf4a`) |
| This project's license | MIT (see `LICENSE`) |
| Compatibility target | `@deepseek-ai/dsh` `0.2.2-rc.5` (tag `dsh-v0.2.2-rc.5`, commit `9c2670d3bce5275e0d1610272958121af87787bb`) |

The ported material retains its BSD-3-Clause attribution (see `NOTICE.md`); MIT and BSD-3-Clause are
permissive and compatible, so the combined work is distributed under this repository's MIT license with the
original notice preserved.

The upstream sources were **not modified**: the checkout at `upstream/deepseek-harness` is a read-only
reference (git submodule) pinned to the release this project supports.

## File map

`L` = lifted with small edits, `P` = ported (structure kept, APIs updated), `N` = new in this project.

| This repository | Upstream file | Kind | Notes |
| --- | --- | --- | --- |
| `src/index.ts` | `packages/ui/tui/src/index.ts` | P | plugin entry, event wiring, transcript/editor composition |
| `src/config.ts` | `src/config.ts` | L | schemastery config + launcher-only fields (`sessionId`, `resumeSessionId`, `continueSession`, `provider`, `model`, `reasoningEffort`, `permissionMode`, `initialSkill`, `showWelcome`) |
| `src/prompt-service.ts` | `src/prompt.ts` | L | service renamed `tui-prompt` / `ctx.tuiPrompt` |
| `src/runtime.ts` | `src/runtime.ts` | L | `TuiRuntime` boundary |
| `src/chat/helpers.ts` | `src/chat/helpers.ts` | P | added `scrubbedParentEnv` for the git probe |
| `src/chat/tokens.ts` | `src/chat/tokens.ts` | L | token/cache accounting |
| `src/chat/timing.ts` | `src/chat/timing.ts` | L | per-phase timing from durable streams |
| `src/chat/model-command.ts` | `src/chat/model-command.ts` | P | `agent.model.current/select`, `ctx.agentDefaultModel` |
| `src/chat/questions.ts` | `src/chat/questions.ts` | P | waterfall `user-questions/request` adapted to `dsh-user-questions` types |
| `src/chat/resume.ts` | `src/chat/resume.ts` | P | `sessionQuery.readSession/listSessions`, `sessionPersistence.stat`, `readTitleSnapshots` |
| `src/chat/autocomplete.ts` | `src/chat/autocomplete.ts` | L | command/file/session completion |
| `src/chat/file-autocomplete.ts` | `src/chat/file-autocomplete.ts` | L | filesystem walk with ignore rules |
| `src/chat/channel.ts` | `src/chat/channel.ts` | L | render channel |
| `src/chat/skill-invocation.ts` | `src/chat/skill-invocation.ts` | P | `SkillRegistry` API, `/skill:<name>` parsing |
| `src/components/theme.ts` | `src/components/theme.ts` | L | SGR role table, palette, truecolor detection |
| `src/components/text.ts` | `src/components/text.ts` | L | width/escape helpers |
| `src/components/content.ts` | `src/components/content.ts` | P | `ToolResultMessage` no longer nests a `tool-result` block |
| `src/components/transcript.ts` | `src/components/transcript.ts` | P | cards, diffs, streaming buffer, todo panel |
| `src/components/dialogs.ts` | `src/components/dialogs.ts` | P | model/details/resume/question dialogs |
| `src/components/xml-tool-output.ts` | `src/components/xml-tool-output.ts` | L | tolerant XML rendering of tool output |
| `src/extension/types.ts` | `src/extension/types.ts` | P | `TuiService` shape |
| `src/extension/overlay-manager.ts` | `src/extension/overlay-manager.ts` | L | overlay/focus stack |
| `src/startup.ts` | — | N | flags via `@deepseek-ai/dsh-cmdline`, `tuiStartup` service, activation guard |
| `src/session-open.ts` | — | N | session identity (`--resume`/`--continue`/`--session-id`), adopt/create, permission preset |
| `cordis.patch.yml` | `packages/ui/tui/cordis.patch.yml` (equivalent rows) | P | persona, session index, `tui-startup`/`tui-prompt`/`tui`, `tool-ask-user`, `session-reference`, `tmux-context` |
| `patches/@earendil-works__pi-tui@0.80.7.patch` | — | N | editor `frame`/`prompt` options, `wordWrapLine` recursion fix |

Everything else (`packages/cli/**`, `scripts/**`, docs, workflows) is new work.

## API adaptations applied during the port

The upstream TUI called APIs that no longer exist in `0.2.2-rc.5`. Each of these was rewritten, not shimmed:

### Agents and turns

- `ctx.agents.create/resume` return `AgentHandle { agent, dispose }`; the TUI owns the agent of the
  invocation and disposes it on exit.
- `createAgent`/`resume` were replaced by `ctx.agents.*`; `installModelSelection` is called by the front
  door in `setup`, not by the UI.
- Inbox events are `agent/inbox/claimed`, `agent/inbox/inserted`, `agent/inbox/discarded` (payloads carry
  `agent`, `message`, and `turn` where relevant). `agent/prompt-submit`, `agent/inbox/dequeue` and
  `agent/inbox/discard` do not exist.
- Steering while running: `agent.status === 'running'` plus `agent.inject`/`agent.followup` instead of
  `acceptsNextStep`.
- `agent-loop/config-start-failed` is gone; the startup guard covers the "UI row never activated" case.
- Model target listeners (`AgentLlmTarget*`, `installAgentLlmTarget`) were removed; the TUI reads
  `agent.model.current()` and reacts to `agent/created`/`status` instead.

### Sessions

- `eventAt`, `snapshotEvents`, `ownEvents` are deprecated and prohibited for new production code. The UI
  now loads history with `ctx.sessionQuery.readSession(id)` → `{ session, inheritedEventCount, events }`.
- `sessionPersistence.locate()` became `stat(id).location?.path` (+ revision), used for activity ordering.
- Session titles come from batched `readTitleSnapshots(ids, signal)` (`{status, value: {title}}`), not from
  a projection cache.
- Compaction is a session event (`compaction/start|summary|end|prune`) with `{ turn: number|null }`; the old
  `compact/start|end` no longer exists.
- `ToolResultMessage` carries `content` and `isError` directly; there is no nested `tool-result` block.
- `TurnEndReasonMap` covers `completed|aborted{reason}|blocked|error{error}|max-tokens|interrupted|forked`.

### Services and seams

- Commands: `ctx.commands.register(...)` + `ctx.commands.execute(agent, line, attachments, signal)`.
- Questions: a waterfall listener on `ctx.on('user-questions/request', (request, next) => …)`, answering
  with `AskUserQuestionAnswer` items (`{id, selected, custom}`) or `UserQuestionError`.
- Session references: `ctx.sessionReferenceResolver.prepare(agent, content, references, route, signal)`
  and `listCandidates(agent, query, limit, signal)`; `formatSessionReferenceMention` for display.
- Skills: `ctx.skills.list/snapshot/get`.
- Permissions: `ctx.permissionPresets.resolve/set`.
- Assistant streaming: the durable `assistant/message.data.stream` expands via `expandedAssistantStream`
  (`chunk.time`, `chunk.chunk: StreamChunk`); the transient `assistant/chunk` event is gone.
- `assertNever`/`JsonValue` moved to `@deepseek-ai/dsh-util-values`; `TodoItem` to
  `@deepseek-ai/dsh-tool-todo`.

## Composition changes (new work)

The old TUI was an app. This project turns it into an **out-of-tree bundle**:

1. `startup.ts` parses `--resume`, `--continue`, `--new`, `--session-id`, `--model`,
   `--reasoning-effort`, `--permission-mode`, `--no-welcome` through the dsh cmdline parser (so `--help`
   lists them), publishes them as `ctx.tuiStartup`, and arms an activation guard.
2. `session-open.ts` resolves session identity and owns adopt-vs-create, including refusing subagent and
   foreign-`cwd` sessions.
3. The plugin waits for the loader to settle (`ctx.get('loader')?.await()`) before creating the agent — a
   hard requirement with the current composition, where creating an agent inside `apply` deadlocks the
   settle it needs.
4. `mountTui` reports failures through the runtime boundary (stderr + exit 1) instead of leaving a silent
   process.

## Testing

- `packages/bundle/tests` covers ported pure logic: prompt templates, token accounting, timing buckets
  (durable + live), status formatting, skill parsing, config defaults.
- `packages/cli/tests` covers launcher behavior: semver gate, argument dispatch, profile bundle merge,
  artifact hashing.
- `scripts/verify-compat.ts` revalidates the port against the pinned DSH installation.
- Planned (roadmap): `@xterm/headless` screen snapshots and `node-pty` end-to-end runs, the same strategy
  the upstream TUI used (`tests/snapshots`, `DSH_SNAPSHOT=refresh`).

## Updating this port

When the pinned release moves, the adaptation list above is the checklist: every bullet is an API that was
renamed or reshaped once already. Run `pnpm compat` and `pnpm typecheck` after the bump; the compat script
fails first when a plugin row or an import no longer resolves.
