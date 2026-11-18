# @gblelis/dsh-tui

Interactive terminal front end (TUI) for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

```bash
npm install -g @gblelis/dsh-tui
dsh-tui
```

Requires Node.js ≥ 24.9 and a real terminal. On first run it installs the `tui` profile under
`$DSH_HOME/profiles` (copying the embedded bundle, no package manager involved), then boots the
pinned `@deepseek-ai/dsh` runtime with that profile.

- `dsh-tui --continue` / `--resume <id>` / `--new` — session selection
- `dsh-tui doctor` — diagnose Node, the profile, the runtime, and credentials
- `dsh-tui install|sync` — repair the profile
- `/model`, `/status`, `/resume`, `/help` — inside the TUI; `Tab` completes

Full documentation, keybindings, architecture notes, and the compatibility policy (this release
targets dsh `^0.2.2-rc.5`) live in the repository README. Sessions are ordinary DSH V4 session
files, shared with the official Desktop and Web surfaces.
