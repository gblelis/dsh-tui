# Changelog

## 0.2.1 — 2026-11-23

### Added

- **Upstream release awareness**: the TUI asks npm which `@deepseek-ai/dsh` versions are published
  (cached for a day under `$DSH_HOME/cache/dsh-tui`), warns in the transcript when this build trails the
  stable channel, mentions a newer alpha without nagging, and exposes the full picture through `/update`.
  `dsh-tui doctor` gained a `dsh release` row that reads the same cache without touching the network.
  Disable with `--no-update-check` / `DSH_TUI_NO_UPDATE_CHECK=1`.

### Changed

- **Two supported release lines**: the bundle and the launcher now accept `^0.2.2-rc.5 || ^0.2.3-alpha.2`.
  The Cordis 4.2 alpha removed `ctx.root` in favour of the global `Symbol.for('cordis.root')`; the
  shutdown path reads the symbol and falls back to the property, so one build serves both. A real boot
  against dsh `0.2.3-alpha.2` was verified (welcome panel, prompt, input). The development pin stays on
  the stable release: the alpha ships alpha vendored loader/hmr/schemastery and requires
  Node `^24.22.3 || >=26.13.1`.

### Security

- **Audit pass**: untrusted text is escaped in every field the welcome panel reads from the session
  (title, id, cwd), `/export` writes mode `0600` and refuses a symlink target, the release cache writes
  atomically with `0600`, the registry answer is bounded to 64 KiB, must be JSON and must be https with
  no redirect, forged `todo/write` payloads are dropped instead of crashing the renderer, and the tool
  XML tree stops at 24 levels.
- **Bundle integrity**: the boot path now re-hashes the installed copy (~3 ms) instead of trusting
  `stamp.json`; `sync` rewrites unconditionally; the manifest's file list is validated against `..`,
  absolute and Windows paths before being used as a write destination, and the swap happens through a
  staging directory plus one `rename`, so an interrupted copy never leaves a half-installed package.
- **Release supply chain**: `prepublishOnly` only re-verifies (nothing rebuilds after the gates), the
  workflow publishes the exact tarball that passed the install smoke, GitHub Actions are pinned by
  commit SHA, and the GitHub release is created with `gh` instead of a third-party action inside the
  job that holds the npm token and OIDC permission.
- **Drift gate fixed**: `verify:package` compared the bundle manifest with itself and never with the CLI
  version, and `scripts/` was outside the typecheck; both are fixed, and the checker now also rejects
  files in `bundle/` that the manifest does not hash.
- See `docs/seguranca.md` for the threat model, the reachability analysis of the 10 transitive
  advisories (all unused by this profile) and the accepted risks.

### Fixed

- **Prerelease admission**: `^0.2.2-rc.5` alone no longer admits `0.2.3-alpha.2`. npm's rule — a prerelease
  matches only a range naming a prerelease of the same `major.minor.patch` — is now implemented, so a
  runtime from an unnamed line is refused with an actionable message instead of booting a profile the
  bundle cannot compose.

## 0.2.0 — 2026-11-23

### Added

- **Startup panel**: a bordered welcome card above the transcript with the active model/effort, directory
  and git branch, permission preset, session id and the keys worth knowing. It centres on wide terminals,
  falls back to a two-line header below 46 columns, and is skipped by `--no-welcome`.
- **Ruled composer and richer footer**: the editor draws its horizontal frame, and the footer prompt gained
  the active permission preset (`${permission}`) whenever it differs from the `workspace-write` default, so
  less restrictive modes are visible without opening `/permissions`.
- **Provider guide** (`docs/providers.md`): how to add catalog and custom providers through the DSH
  `llm-pi-ai` adapter, including copying a route configured in the Web profile and using
  `apiKeyEnv`/`.credentials.yaml` for keys.
- Unit tests for `WelcomeComponent` (layout, narrow fallback, live state, tagline) and a committed golden
  screen for the panel.

### Changed

- `dsh-tui version` reads the launcher and bundle versions from their manifests instead of a
  hand-maintained constant, and `pnpm verify:package` now fails when the embedded bundle version drifts
  from the published one.

### Fixed

- `--no-welcome` was parsed but had no effect on the renderer; the flag now selects the compact header.

## 0.1.0 — first end-to-end build

Terminal front end for DeepSeek Harness, shipped as one npm package
(`@gblelis/dsh-tui`) that installs a DSH profile and boots the pinned runtime.

### Added

- **Launcher** (`lib/bin.js`, Node only): resolves `$DSH_HOME`, validates Node ≥ 24.9 and the dsh runtime
  range, installs/repairs `profiles/tui` (manifest, user patch layer, embedded bundle copy with content
  stamp), and `exec`s `dsh --profile tui`. Subcommands: `install`, `sync`, `doctor`, `profile`, `runtime`,
  `version`, `print`, `help`; flags `--home`, `--dsh-bin`, `--json`.
- **Bundle** (embedded, never published separately): `dsh-base` plus terminal rows — `tui-startup`
  (flags, `tuiStartup` service, activation guard), `tui-prompt` (template interpolation), `tui` (the
  interface), `tool-ask-user`, `session-reference`, `tmux-context`; persona and in-memory session index.
- **TUI** ported to the published `0.2.2-rc.5` API: streaming transcript, tool cards with diffs, reasoning
  toggle, per-phase timing, token/context footer, multiline editor with history and completion, model and
  permission selection, session resume picker, question dialogs, `/skill:` invocation.
- **`/export [path]`**: write the session as a Markdown transcript (human messages, replies, tool calls and
  results; synthetic model-only context omitted) with collision-safe default file names.
- **`/permissions [preset]`**: selector overlay that marks the active preset and switches it through the
  session's durable knob setters, plus a direct argument form for scripting.
- **Golden screens**: committed snapshots for the permission selector, the masked `/login` prompt, the
  transcript-details dialog and both diff shapes; drifting layout now fails CI with a reviewable diff.
- **Diff renderer tests**: the transcript's `renderDiff` is unit-covered for new files, exact edits, the
  approximate fallback, and the trailing-newline terminator rule.
- **Tool-card smoke**: the chat smoke's second turn scripts a real `bash` call through the mock model, so the
  rendered card (header, command, output, exit status) is asserted end to end; the scripted title request is
  disabled so it cannot consume the tool-call entry.
- **Release**: `docs/publicacao.md` documents the version bump, gates, tag-triggered publish with provenance,
  and the manual path; `prepublishOnly` rebuilds the workspace so the tarball is never stale.
- **Install smoke**: `pnpm smoke:install` packs the CLI, installs the tarball with npm into a clean prefix and
  boots the installed binary, so the published artifact is verified as a user receives it.
- **Parity audit + missing rows**: compared the Web profile against the CLI composition and mounted the host
  capabilities that were only available on Web/Desktop: `time-context` (current date/time), scheduled tasks
  (`schedule` + `schedule_*` tools), per-subagent model selection/discovery
  (`modelSelection`/`modelDiscovery` + `list_subagent_models` + the host preference row), and the bundled
  `dsh-doc` skill through `skill-filesystem.customSkillDirs`. The remaining Web-only gaps (agent presets,
  `present`, Office kit, workspace registry, UI surfaces) are documented in `docs/paridade.md`.
- **`/login`**: masked prompt that stores the DeepSeek API key through the credentials service (the same
  store the Web Models page writes); the secret never enters the transcript.
- **MCP servers**: documented `@deepseek-ai/dsh-mcp-client` rows in the user patch layer (stdio and
  Streamable HTTP); the boot stays up when a server is unreachable.
- **Sessions**: new (`session-<uuid>`), `--continue`, `--resume <id>`, `--session-id`, `/resume` handoff;
  adopts existing V4 sessions and refuses subagent or foreign-`cwd` sessions with a clear message.
- **Verification**: unit suites (launcher semantics, tokens, timing, prompt templates, config), a headless
  screen smoke that boots the real profile and asserts the rendered screen (`pnpm smoke:screen`), a chat
  smoke that types a prompt against a local Messages-compatible server and asserts the streamed reply in
  the transcript (`pnpm smoke:chat`), the compatibility gate (`pnpm compat`, 11 checks) and the package
  gate (`pnpm verify:package`).
- **Docs**: pt-BR README plus architecture, installation, compatibility, parity, keybindings, plugins and
  troubleshooting guides; English README and port provenance map.

### Known gaps

- PTY-based tests and richer screen snapshots (tool cards, diffs, dialogs) are not in the repository yet.
- `/export`, `/permissions`, `/login`, and the MCP manager row are not wired.
- The published name `@gblelis/dsh-tui` and its scope are provisional until the first `npm publish`.
