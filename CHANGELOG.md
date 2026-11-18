# Changelog

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
