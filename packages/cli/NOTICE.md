# Notices and third-party attribution

`@gblelis/dsh-tui` is an independent, unofficial terminal front end for DeepSeek Harness.
It is not published, sponsored, or endorsed by DeepSeek.

This package contains no DeepSeek Harness source code. It ships a launcher plus a small
Cordis bundle that composes the published `@deepseek-ai/dsh` runtime (installed as a
dependency and loaded from the user's own dsh installation).

## DeepSeek Harness (upstream)

- Project: DeepSeek Harness — <https://github.com/deepseek-ai/deepseek-harness>
- License: MIT
- Relationship: never modified. The bundle only uses published plugin contracts and the
  same session files the official surfaces use.

## Ported terminal front end

The terminal front end inside `bundle/` is a port of DeepSeek Harness' first-party TUI
package (`@deepseek-ai/dsh-tui`), removed upstream in commit `10bb9cbf4a` and recovered
from its parent `7248b5ec8f`. That package declared:

```
Copyright (c) DeepSeek
License: BSD-3-Clause
```

The ported material remains attributed under BSD-3-Clause, a permissive license compatible
with this package's MIT terms. A per-file map lives in the repository:
docs/porting/PROVENANCE.md.

## Bundled dependencies

| Package | License | Notes |
|---|---|---|
| `@earendil-works/pi-tui` | MIT | terminal renderer; a build-time patch adds editor prompt/frame options and fixes `wordWrapLine` |
| `diff` | BSD-3-Clause | unified diff rendering in tool cards |
| `saxes` | ISC | tolerant XML parsing for legacy tool output |
| `marked` | MIT | transitive dependency of pi-tui |
| `get-east-asian-width` | MIT | transitive dependency of pi-tui |
