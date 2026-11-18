/**
 * Narrow semantic-version range check for the launcher's compatibility gate.
 *
 * The launcher only needs `^0.2.2-rc.5` and `>=24.9.0`, so this module
 * implements exactly the subset it uses instead of carrying a full semver
 * implementation into the CLI.
 * @module @gblelis/dsh-tui/launcher/semver
 */

/** One parsed version. */
export interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** Dot-separated prerelease identifiers; empty for a stable release. */
  readonly prerelease: readonly string[]
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u

/**
 * Parse a version string.
 * @param value - version text such as `0.2.2-rc.5`.
 * @returns the parsed version, or `undefined` when the text is not a version.
 */
export function parseVersion(value: string): ParsedVersion | undefined {
  const match = VERSION.exec(value.trim())
  if (match === null) return undefined
  const [, major, minor, patch, prerelease] = match
  if (major === undefined || minor === undefined || patch === undefined) return undefined
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
  }
}

/** Compare two prerelease identifier lists: `-1` lower, `1` higher, `0` equal. */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  // A stable release sorts above any prerelease of the same number.
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a === b) continue
    const numericA = /^\d+$/u.test(a)
    const numericB = /^\d+$/u.test(b)
    if (numericA && numericB) return Number(a) < Number(b) ? -1 : 1
    // Numeric identifiers always sort below alphanumeric ones.
    if (numericA) return -1
    if (numericB) return 1
    return a < b ? -1 : 1
  }
  return 0
}

/**
 * Compare two versions by release ordering.
 * @param left - first version text.
 * @param right - second version text.
 * @returns `-1`, `0`, or `1`; unparsable text compares as equal.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return 0
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * Whether a version satisfies an exact, caret, or minimum range.
 *
 * Supported forms: `^x.y.z[-pre]`, `>=x.y.z[-pre]`, and a bare version for an
 * exact match. Anything else returns `false` so an unknown policy fails closed.
 * @param version - installed version text.
 * @param range - supported range text.
 * @returns whether the version is acceptable.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const installed = parseVersion(version)
  if (installed === undefined) return false
  const text = range.trim()
  if (text.startsWith('>=')) {
    return compareVersions(version, text.slice(2)) >= 0
  }
  if (text.startsWith('^')) {
    const floor = parseVersion(text.slice(1))
    if (floor === undefined) return false
    if (compareVersions(version, text.slice(1)) < 0) return false
    // Caret on 0.x pins the minor: `^0.2.2` admits 0.2.x (with any
    // prerelease ordering above the floor) and nothing from 0.3 onward.
    if (floor.major === 0) {
      return installed.major === 0 && installed.minor === floor.minor
    }
    return installed.major === floor.major
  }
  return compareVersions(version, text) === 0
}
