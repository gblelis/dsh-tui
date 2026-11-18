# Notices and third-party attribution

`dsh-tui` is an independent, unofficial terminal front end for DeepSeek Harness.
It is not published, sponsored, or endorsed by DeepSeek.

## DeepSeek Harness (upstream)

- Project: DeepSeek Harness — <https://github.com/deepseek-ai/deepseek-harness>
- License: MIT (see [upstream/deepseek-harness/LICENSE](upstream/deepseek-harness/LICENSE))
- Relationship: this repository never modifies the upstream sources. It composes
  the published `@deepseek-ai/dsh` runtime as an out-of-tree Cordis bundle and
  reuses the upstream plugin contracts. The upstream tree is vendored only as a
  git submodule pinned to the release this project supports, for reference and
  compatibility checks.

## Ported terminal front end

The interactive terminal front end in `packages/bundle/src` is a port of the
first-party TUI package that shipped in DeepSeek Harness until 2026-08-04 and was
then removed upstream (`packages/ui/tui`, deleted in commit `10bb9cbf4a`;
recovered from its parent `7248b5ec8f`). At the time of removal that package
declared:

```
Copyright (c) DeepSeek
License: BSD-3-Clause
```

Files ported from it keep a provenance header and are mapped in
[docs/porting/PROVENANCE.md](docs/porting/PROVENANCE.md). The port is distributed
under this repository's MIT license, with the original BSD-3-Clause terms honored
for the ported material (both licenses are permissive and compatible).

## pi-tui

- Package: `@earendil-works/pi-tui@0.80.7`
- License: MIT
- Usage: terminal renderer and component library, vendored into the built bundle.
  A maintenance patch (`patches/@earendil-works__pi-tui@0.80.7.patch`) adds the
  editor prompt/frame options used by the input line and fixes an infinite
  recursion in `wordWrapLine`; the patch is applied at build time only.

## Other bundled dependencies

| Package | License | Notes |
|---|---|---|
| `diff` | BSD-3-Clause | unified diff rendering in tool cards |
| `saxes` | ISC | tolerant XML parsing for legacy tool output |
| `marked` | MIT | transitive dependency of pi-tui |
| `get-east-asian-width` | MIT | transitive dependency of pi-tui |

The full dependency license list of a published tarball can be regenerated with
`pnpm licenses list --prod` from a clean checkout.
