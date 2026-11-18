# dsh-tui — DeepSeek Harness in your terminal

A **TUI** (terminal user interface) front end for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
The official DSH ships Desktop and Web only; the Web surface needs an HTTP server, which makes remote access
awkward. `dsh-tui` runs the **same DSH core** — same agents, same tools, same session files — in a plain
terminal, with no server and no browser.

- One binary, one command: `dsh-tui`.
- **Shared core, not a fork**: the CLI installs a DSH *profile* that loads `@deepseek-ai/dsh-base` and adds
  only a terminal layer.
- **Compatible by construction**: the bundle declares `engines.dsh` and compiles against published DSH APIs,
  so tracking upstream is a dependency bump, not a rewrite.

> Portuguese is this project's primary language: see the [README in Portuguese](README.md). The docs under
> `docs/` are written in Portuguese.

## Install

Requires **Node.js ≥ 24.9** (DSH's own floor) and a real terminal.

```bash
# after the first public release
npm install -g @gblelis/dsh-tui

# from a checkout, before that
git clone git@github.com:<you>/deepseek-harness-tui.git
cd deepseek-harness-tui && corepack enable && pnpm install && pnpm build
cd packages/cli && npm pack && npm install -g ./gblelis-dsh-tui-0.1.0.tgz
```

The package ships one launcher plus the embedded bundle; it installs `@deepseek-ai/dsh` itself, so the first
run already has a runtime. `dsh-tui install` prepares `$DSH_HOME/profiles/tui` explicitly if you prefer.

## Use

```bash
dsh-tui                    # new session
dsh-tui --continue         # newest session recorded in this directory
dsh-tui --resume <id>      # a specific session
dsh-tui --resume           # pick from this workspace's sessions
dsh-tui --model deepseek-official/deepseek-v4-pro --reasoning-effort high
dsh-tui --permission-mode workspace-write
dsh-tui doctor             # Node, profile, runtime, credentials
dsh-tui runtime --json     # the dsh build this launcher boots
```

Credentials resolve like DSH does: `DEEPSEEK_API_KEY`, project `.env`, home `.env`, then
`$DSH_HOME/.credentials.yaml` (shared with Desktop/Web). You can also store a key from inside the TUI with
`/login`; it never appears in the transcript.

Keys: `Enter` send · `Shift/Alt+Enter` newline · `Esc` cancel turn · `Ctrl+C` cancel/clear/exit ·
`Ctrl+D` exit · `Ctrl+O` tool cards · `Ctrl+R` reasoning · `Ctrl+L` redraw · `Tab` completion · `/help` for
everything.

Commands: `/help`, `/model`, `/permissions`, `/login`, `/export`, `/clear`, `/details`, `/palette`,
`/reload`, `/resume`, `/status`, `/exit`, `/quit`, plus the DSH core commands and `/skill:<name>`.

MCP servers use the same `@deepseek-ai/dsh-mcp-client` rows as any DSH app; add them to your profile's user
patch layer (see `docs/plugins.md`). The TUI starts even when a server is unreachable.

## How it works

The published package embeds the built bundle. On boot the launcher resolves `$DSH_HOME`, verifies the local
Node and dsh runtime, repairs `profiles/tui` (manifest, user patch layer, embedded bundle copy) and then
execs `node <dsh>/lib/bin.js --profile tui …`. dsh composes `@deepseek-ai/dsh-base` plus our terminal rows,
resolving every `@deepseek-ai/*` import from the installation — there is exactly one copy of the core.

```
launcher (lib/bin.js) ──writes──▶ $DSH_HOME/profiles/tui ──loads──▶ dsh-base + tui bundle
```

The bundle never imports `@deepseek-ai/*` values at runtime: every core package is a peer resolved from the
installation, which is what keeps upgrades to a `pnpm install` away.

## Status

Verified against `dsh 0.2.2-rc.5`. The chat surface is ported in full: streaming, transcript with markdown
and diffs, collapsible tool cards, reasoning, per-phase timing, token/cache footer, `/model`,
`/permissions`, `/resume`, `/status`, `/export`, `/login`, `ask_user_question`, `@session` references,
skills and `/skill:`, prompt history, file/command autocomplete.

| Gate | What it proves |
| --- | --- |
| `pnpm test` | pure behaviour plus committed golden screens (dialog and diff layout) |
| `pnpm compat` | 11 API/version checks against the pinned dsh |
| `pnpm verify:package` | the tarball that would be published |
| `pnpm smoke:screen` | the profile composes and the TUI renders headlessly |
| `pnpm smoke:chat` | prompt → stream → real tool card → `/export` → `/permissions` → `/login` → resume |
| `pnpm smoke:install` | `npm pack` → `npm install -g` → boot of the installed binary |
| `tests/pty.spec.ts` | boot under a real PTY (`script(1)`), auto-skipped where none exists |

Docs (pt-BR): [architecture](docs/arquitetura.md) · [installation](docs/instalacao.md) ·
[compatibility](docs/compatibilidade.md) · [parity](docs/paridade.md) · [plugins](docs/plugins.md) ·
[release](docs/publicacao.md) · [provenance](docs/porting/PROVENANCE.md).

## License

This project is MIT; DSH itself is MIT as well. The TUI code is a port of DeepSeek Harness' first-party
terminal front end (`@deepseek-ai/dsh-tui`, removed upstream in `10bb9cbf4a`, recovered from `7248b5ec8f`),
which declared **BSD-3-Clause**. That ported material stays attributed under BSD-3-Clause, a permissive
license compatible with this repository's MIT terms. Per-file map in
[docs/porting/PROVENANCE.md](docs/porting/PROVENANCE.md) and [NOTICE.md](NOTICE.md).
