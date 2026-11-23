# @gblelis/dsh-tui

Interactive terminal front end (TUI) for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —
the same core, tools and session format, straight in your terminal. No server, no browser.

```bash
npm install -g @gblelis/dsh-tui
dsh-tui
```

Requires Node.js ≥ 24.9 and a real terminal. On first run it installs the `tui` profile under
`$DSH_HOME/profiles` (copying the embedded bundle, no package manager involved), then boots the pinned
`@deepseek-ai/dsh` runtime with that profile.

## What you get

- Full chat: streaming, transcript, tool cards, diffs, reasoning, per-phase timing.
- Sessions shared with Desktop/Web (same V4 files): `--continue`, `--resume [id]`, `--session-id`, `/resume`.
- Model and reasoning control: `/model`, `--model`, `--reasoning-effort`.
- Permissions: `--permission-mode`, in-session `/permissions`, `ask_user_question`, `@session` references.
- `/export [path]` (Markdown transcript), `/login` (masked key), `/status`, `/help`, `/palette`.
- **Release awareness**: warns in the transcript when a newer dsh is published, and `/update` shows the
  installed runtime, the `latest`/`alpha` channels and what to do. `dsh-tui doctor` carries the same fact.
- Any provider supported by DSH's multi-provider adapter, configured in your patch layer.

## Launcher commands

```
dsh-tui                     # new session
dsh-tui --continue          # newest session in this directory
dsh-tui --resume <id>       # a specific session
dsh-tui doctor              # Node, home, profile, bundle hash, runtime, release, terminal, credentials
dsh-tui install | sync      # create / repair the profile
dsh-tui version | profile | runtime | print
```

Inside the TUI: `/help` lists shortcuts and commands; `Tab` completes commands, files and `@session`
references.

## Compatibility

This release targets `@deepseek-ai/dsh` `^0.2.2-rc.5 || ^0.2.3-alpha.2`. The launcher refuses to boot a
runtime outside that range (and the bundle declares the same `engines.dsh`), so a mismatch is a clear error
instead of a half-composed tree. `dsh-tui doctor` reports the running runtime and its origin.

## Docs

Architecture, compatibility policy, parity matrix, security notes and the porting provenance live in the
repository: <https://github.com/gblelis/dsh-tui>.

MIT. The terminal code is a port of DeepSeek Harness's first-party TUI (BSD-3-Clause), attributed in
`NOTICE.md`.
