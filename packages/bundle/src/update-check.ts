/**
 * Upstream release awareness: tells the TUI whether the DeepSeek Harness
 * runtime it boots is behind the versions published on npm.
 *
 * The check is deliberately cheap and non-blocking: one registry request for
 * the package's dist-tags, cached under `$DSH_HOME/cache` for
 * {@link UPDATE_CHECK_TTL_MS}, and never on the path that draws the first
 * frame. A failure is itself a value — offline machines keep working and the
 * last successful answer keeps reporting.
 * @module @gblelis/dsh-tui-bundle/update-check
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Registry document naming the published channels for one package. */
export const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'

/** How long a successful check is trusted before another request is made. */
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000

/** Network budget for the registry request; a slow registry must not queue up. */
export const UPDATE_CHECK_TIMEOUT_MS = 2500

/** Channels the check reports, most relevant first. */
export const TRACKED_CHANNELS = ['latest', 'alpha'] as const

/** One tracked channel. */
export type UpdateChannel = typeof TRACKED_CHANNELS[number]

/** Published version per channel. */
export type ChannelVersions = Partial<Record<UpdateChannel, string>>

/** What one check learned, as persisted in the cache file. */
export interface UpdateCheckRecord {
  /** Epoch milliseconds of the successful request. */
  readonly checkedAt: number
  /** Version each channel pointed at, in registry order. */
  readonly channels: ChannelVersions
}

/** A check result together with where it came from. */
export interface UpdateStatus extends UpdateCheckRecord {
  /** Registry URL consulted, for the `/update` detail line. */
  readonly source: string
  /** Whether the record was served from the cache instead of the network. */
  readonly cached: boolean
}

/** How the running runtime compares with what is published. */
export type UpdateVerdict =
  /** The running runtime is the newest stable release. */
  | 'current'
  /** A newer stable release is published; this build targets an older line. */
  | 'behind'
  /** The running runtime is stable-latest, but a newer prerelease exists. */
  | 'prerelease-available'
  /** Nothing published is newer. */
  | 'unknown'

/** Path of the cache file for one harness home. */
export function updateCachePath(home: string): string {
  return join(home, 'cache', 'dsh-tui', 'update-check.json')
}

/**
 * Parse a version, keeping the prerelease identifiers so ordering matches npm.
 * @param value - Version text such as `0.2.2-rc.5`.
 * @returns Parsed parts, or `undefined` when the text is not a version.
 */
export function parseVersion(value: string): {
  major: number
  minor: number
  patch: number
  prerelease: readonly string[]
} | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value.trim())
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

/**
 * Compare two versions by release ordering (a stable release outranks its own
 * prereleases, numeric identifiers outrank alphanumeric ones).
 * @param left - First version.
 * @param right - Second version.
 * @returns Negative when `left` is older, positive when newer, `0` when equal
 *   or unparsable.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return 0
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const one = a.prerelease[index]
    const two = b.prerelease[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    if (one === two) continue
    const numericOne = /^\d+$/u.test(one)
    const numericTwo = /^\d+$/u.test(two)
    if (numericOne && numericTwo) return Number(one) < Number(two) ? -1 : 1
    if (numericOne) return -1
    if (numericTwo) return 1
    return one < two ? -1 : 1
  }
  return 0
}

/**
 * Compare the running runtime with the published channels.
 * @param current - Runtime version this process boots.
 * @param channels - Versions the registry reports.
 * @returns The verdict used to decide whether anything is shown.
 */
export function classifyUpdate(current: string, channels: ChannelVersions): UpdateVerdict {
  const latest = channels.latest
  if (latest === undefined) return 'unknown'
  if (compareVersions(current, latest) < 0) return 'behind'
  const alpha = channels.alpha
  if (alpha !== undefined && compareVersions(current, alpha) < 0) return 'prerelease-available'
  return 'current'
}

/**
 * Keep only string versions for channels this build understands.
 * @param value - Parsed registry JSON.
 * @returns The channel map, dropping anything unexpected.
 */
export function readChannels(value: unknown): ChannelVersions {
  if (value === null || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  const channels: ChannelVersions = {}
  for (const channel of TRACKED_CHANNELS) {
    const version = record[channel]
    if (typeof version === 'string' && parseVersion(version) !== undefined) channels[channel] = version
  }
  return channels
}

/**
 * Ask the registry which versions are published.
 * @param fetchImpl - Fetch implementation (injected so tests never touch the network).
 * @returns The published channels; throws when the request fails or answers non-JSON.
 */
export async function fetchChannels(
  fetchImpl: typeof fetch = fetch,
  url: string = DIST_TAGS_URL,
): Promise<ChannelVersions> {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`registry answered HTTP ${String(response.status)}`)
  const channels = readChannels(await response.json())
  if (channels.latest === undefined) throw new Error('the registry answer carried no latest channel')
  return channels
}

/**
 * Read the cached record, ignoring damage rather than failing the caller.
 * @param home - Harness home directory.
 * @returns The record, or `undefined` when absent or unreadable.
 */
export async function readCachedUpdate(home: string): Promise<UpdateCheckRecord | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(updateCachePath(home), 'utf8'))
    if (value === null || typeof value !== 'object') return undefined
    const record = value as { checkedAt?: unknown; channels?: unknown }
    if (typeof record.checkedAt !== 'number') return undefined
    return { checkedAt: record.checkedAt, channels: readChannels(record.channels) }
  } catch {
    return undefined
  }
}

/**
 * Persist a successful check. A cache that cannot be written (read-only home)
 * is not an error: the answer still reaches the screen.
 * @param home - Harness home directory.
 * @param record - What to store.
 */
export async function writeCachedUpdate(home: string, record: UpdateCheckRecord): Promise<void> {
  const path = updateCachePath(home)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(record, undefined, 2)}\n`, 'utf8')
  } catch {
    // Non-fatal by design.
  }
}

/** Whether a record is still young enough to answer without a request. */
export function isFresh(record: UpdateCheckRecord, now: number): boolean {
  const age = now - record.checkedAt
  return age >= 0 && age < UPDATE_CHECK_TTL_MS
}

/**
 * Resolve the status, consulting the network only when the cache is stale.
 * @param options - Home directory, clock, fetch implementation, and whether the
 *   caller insists on a fresh answer.
 * @returns The status, or `undefined` when nothing could be learned.
 */
export async function checkForUpdate(options: {
  home: string
  now?: number
  refresh?: boolean
  fetchImpl?: typeof fetch
  url?: string
}): Promise<UpdateStatus | undefined> {
  const url = options.url ?? DIST_TAGS_URL
  const now = options.now ?? Date.now()
  const cached = await readCachedUpdate(options.home)
  if (cached !== undefined && options.refresh !== true && isFresh(cached, now)) {
    return { ...cached, source: url, cached: true }
  }
  try {
    const channels = await fetchChannels(options.fetchImpl ?? fetch, url)
    const record: UpdateCheckRecord = { checkedAt: now, channels }
    await writeCachedUpdate(options.home, record)
    return { ...record, source: url, cached: false }
  } catch {
    // Offline or a broken registry: the last good answer still describes the
    // published channels, it is just older than the TTL.
    return cached === undefined ? undefined : { ...cached, source: url, cached: true }
  }
}

/** Plain-text summary shown by `/update`, one fact per line. */
export function formatUpdateSummary(status: UpdateStatus, current: string): string[] {
  const verdict = classifyUpdate(current, status.channels)
  const lines = [`dsh runtime: ${current}`]
  lines.push(`published latest: ${status.channels.latest ?? 'unknown'}`)
  if (status.channels.alpha !== undefined) lines.push(`published alpha: ${status.channels.alpha}`)
  lines.push(`checked: ${new Date(status.checkedAt).toLocaleString()}${status.cached ? ' (cached)' : ''}`)
  lines.push(`channel: ${describeVerdict(verdict)}`)
  if (verdict === 'behind' || verdict === 'prerelease-available') {
    lines.push('upgrade: npm install -g @gblelis/dsh-tui@latest')
  }
  return lines
}

/** One sentence describing how this build compares with what is published. */
export function describeVerdict(verdict: UpdateVerdict): string {
  switch (verdict) {
    case 'behind': return 'a newer stable release is published; this build targets an older line'
    case 'prerelease-available': return 'current on the stable channel; a newer prerelease is published'
    case 'current': return 'current on every published channel'
    case 'unknown': return 'the registry answer carried no comparable version'
  }
}

/**
 * The transcript notice for a verdict, or `undefined` when nothing is worth
 * interrupting the session for.
 * @param status - Latest check result.
 * @param current - Runtime version this process boots.
 * @returns The notice text and its severity.
 */
export function updateNotice(
  status: UpdateStatus,
  current: string,
): { text: string; severity: 'info' | 'warning' } | undefined {
  const verdict = classifyUpdate(current, status.channels)
  const latest = status.channels.latest
  const alpha = status.channels.alpha
  if (verdict === 'behind' && latest !== undefined) {
    return {
      text: `A newer dsh is published (${latest}); this session runs ${current}. `
        + 'Upgrade with npm install -g @gblelis/dsh-tui@latest, then /update to recheck.',
      severity: 'warning',
    }
  }
  if (verdict === 'prerelease-available' && alpha !== undefined) {
    return {
      text: `dsh ${current} is current on the stable channel; ${alpha} is published on the alpha channel. `
        + 'This build also supports that line if you point it at the runtime (--dsh-bin). Run /update for details.',
      severity: 'info',
    }
  }
  return undefined
}
