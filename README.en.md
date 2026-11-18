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

> Português é o idioma principal deste projeto: veja o [README em português](../README.md).

## Install

Requires **Node.js ≥ 24.9** (DSH's own floor) and a real terminal.

```bash
# until the package is on the public registry
git clone git@github.com:<you>/deepseek-harness-tui.git
cd deepseek-harness-tui && corepack enable && pnpm install && pnpm build
cd packages/cli && npm pack && npm install -g ./gblelis-dsh-tui-0.1.0.tgz

# afterwards
npm install -g @gblelis/dsh-tui
```

## Use

```bash
dsh-tui                    # new session
dsh-tui --continue         # newest session recorded in this directory
dsh-tui --resume <id>      # a specific session
dsh-tui --model deepseek-official/deepseek-v4-pro --reasoning-effort high
dsh-tui doctor             # Node, profile, runtime, credentials
```

Credentials resolve like DSH does: `DEEPSEEK_API_KEY`, project `.env`, home `.env`, then
`$DSH_HOME/.credentials.yaml` (shared with Desktop/Web).

Keys: `Enter` send · `Esc` cancel turn · `Ctrl+C` cancel/clear/exit · `Ctrl+D` exit · `Ctrl+O` tool cards ·
`Ctrl+R` reasoning · `Tab` completion · `/help` for everything.

Commands: `/help`, `/model`, `/clear`, `/details`, `/palette`, `/reload`, `/resume`, `/status`, `/exit`,
`/quit`, plus the DSH core commands and `/skill:<name>`.

## How it works

The published package embeds the built bundle. On boot the launcher resolves `$DSH_HOME`, verifies the local
Node and dsh runtime, repairs `profiles/tui` (manifest, user patch layer, embedded bundle copy) and then
execs `node <dsh>/lib/bin.js --profile tui …`. dsh composes `@deepseek-ai/dsh-base` plus our terminal rows,
resolving every `@deepseek-ai/*` import from the installation — there is exactly one copy of the core.

```
launcher (lib/bin.js) ──writes──▶ $DSH_HOME/profiles/tui ──loads──▶ dsh-base + tui bundle
```

## Status

Boot and profile composition are verified against `dsh 0.2.2-rc.5`; the chat surface (streaming, tool cards,
diffs, reasoning, timing, model/permission selection, session resume, `ask_user_question`, `@session`
references) is ported. Pending: headless snapshot + PTY test suites, `/export`, `/permissions`, `/login`,
and the MCP manager row.

Docs (pt-BR): [architecture](../docs/arquitetura.md) · [compatibility](../docs/compatibilidade.md) ·
[parity](../docs/paridade.md) · [provenance](../docs/porting/PROVENANCE.md).

## License

This project is MIT; DSH itself is MIT as well. The TUI code is a port of DeepSeek Harness' first-party
terminal front end (`@deepseek-ai/dsh-tui`, removed upstream in `10bb9cbf4a`, recovered from `7248b5ec8f`),
which declared **BSD-3-Clause**. That ported material stays attributed under BSD-3-Clause, a permissive
license compatible with this repository's MIT terms. Per-file map in
[docs/porting/PROVENANCE.md](../docs/porting/PROVENANCE.md) and [NOTICE.md](../NOTICE.md).
