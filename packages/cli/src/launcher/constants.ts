/**
 * Facts shared by every launcher command: the published identity of this
 * package, the profile it owns, and the dsh runtime range it is built against.
 * @module @gblelis/dsh-tui/launcher/constants
 */

/** Published CLI package name. */
export const CLI_PACKAGE = '@gblelis/dsh-tui'

/** Version stamped into the generated bundle manifest by the build. */
export const BUNDLE_PACKAGE = '@gblelis/dsh-tui-bundle'

/**
 * The dsh runtime range this build targets. The bundle's own `engines.dsh`
 * carries the same range; this copy lets the launcher fail early with a better
 * message than a silently skipped bundle row.
 */
export const DSH_COMPAT_RANGE = '^0.2.2-rc.5 || ^0.2.3-alpha.2'

/** Profile name this front end owns under `$DSH_HOME/profiles`. */
export const PROFILE_NAME = 'tui'

/** Bundle layer order: dsh's base composition, then the terminal front door. */
export const PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', BUNDLE_PACKAGE] as const

/** Directory (inside the profile) holding the copied bundle package. */
export const PROFILE_MODULE_DIR = `node_modules/${BUNDLE_PACKAGE}`

/** Launcher-private state inside the profile: install stamps and diagnostics. */
export const PROFILE_STATE_DIR = '.dsh-tui'
