import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_REGISTRY_BYTES,
  UPDATE_CHECK_TTL_MS,
  checkForUpdate,
  classifyUpdate,
  compareVersions,
  describeVerdict,
  fetchChannels,
  formatUpdateSummary,
  isFresh,
  updateCachePath,
  updateNotice,
} from '../src/update-check.ts'

const home = (): string => mkdtempSync(join(tmpdir(), 'dsh-update-'))
const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

describe('compareVersions', () => {
  it('orders stable releases and prereleases like npm', () => {
    expect(compareVersions('0.2.2-rc.5', '0.2.2')).toBe(-1)
    expect(compareVersions('0.2.2', '0.2.2-rc.5')).toBe(1)
    expect(compareVersions('0.2.2-rc.5', '0.2.2-rc.10')).toBe(-1)
    expect(compareVersions('0.2.2-rc.10', '0.2.2-rc.5')).toBe(1)
    expect(compareVersions('0.2.3-alpha.2', '0.2.2-rc.5')).toBe(1)
    expect(compareVersions('0.2.2-rc.5', '0.2.2-rc.5')).toBe(0)
  })

  it('treats unparsable text as equal', () => {
    expect(compareVersions('nonsense', '0.2.2')).toBe(0)
  })
})

describe('classifyUpdate', () => {
  it('reports being behind a newer stable release', () => {
    expect(classifyUpdate('0.2.2-rc.5', { latest: '0.2.2-rc.9' })).toBe('behind')
    expect(classifyUpdate('0.2.2-rc.5', { latest: '0.2.3' })).toBe('behind')
  })

  it('reports a newer prerelease when stable is current', () => {
    // The real upstream state on 2026-11-23: latest = rc.5, alpha = 0.2.3-alpha.2.
    expect(classifyUpdate('0.2.2-rc.5', { latest: '0.2.2-rc.5', alpha: '0.2.3-alpha.2' }))
      .toBe('prerelease-available')
  })

  it('reports current when nothing is newer', () => {
    expect(classifyUpdate('0.2.2-rc.5', { latest: '0.2.2-rc.5' })).toBe('current')
    expect(classifyUpdate('0.2.3', { latest: '0.2.2-rc.5', alpha: '0.2.3-alpha.2' })).toBe('current')
  })

  it('reports unknown without a stable channel', () => {
    expect(classifyUpdate('0.2.2-rc.5', { alpha: '0.2.3-alpha.2' })).toBe('unknown')
  })

  it('reports unknown when the runtime version cannot be parsed', () => {
    expect(classifyUpdate('unknown', { latest: '0.2.2-rc.5' })).toBe('unknown')
  })
})

describe('updateNotice', () => {
  const status = (channels: { latest?: string; alpha?: string }) => ({
    checkedAt: 1_700_000_000_000,
    channels,
    source: 'test',
    cached: false,
  })

  it('warns when a newer stable release is published', () => {
    const notice = updateNotice(status({ latest: '0.2.3' }), '0.2.2-rc.5')
    expect(notice?.severity).toBe('warning')
    expect(notice?.text).toContain('newer dsh is published (0.2.3)')
    expect(notice?.text).toContain('this session runs 0.2.2-rc.5')
  })

  it('mentions a published prerelease without warning', () => {
    const notice = updateNotice(status({ latest: '0.2.2-rc.5', alpha: '0.2.3-alpha.2' }), '0.2.2-rc.5')
    expect(notice?.severity).toBe('info')
    expect(notice?.text).toContain('alpha channel')
    expect(notice?.text).toContain('--dsh-bin')
  })

  it('stays silent when the runtime is current', () => {
    expect(updateNotice(status({ latest: '0.2.2-rc.5' }), '0.2.2-rc.5')).toBeUndefined()
  })
})

describe('formatUpdateSummary', () => {
  it('lists the runtime, both channels and the check time', () => {
    const lines = formatUpdateSummary({
      checkedAt: Date.UTC(2026, 10, 23, 12, 0),
      channels: { latest: '0.2.2-rc.5', alpha: '0.2.3-alpha.2' },
      source: 'test',
      cached: true,
    }, '0.2.2-rc.5')
    const text = lines.join('\n')
    expect(text).toContain('dsh runtime: 0.2.2-rc.5')
    expect(text).toContain('published latest: 0.2.2-rc.5')
    expect(text).toContain('published alpha: 0.2.3-alpha.2')
    expect(text).toContain('(cached)')
    expect(text).toContain('prerelease')
  })

  it('prints the upgrade command when behind', () => {
    const lines = formatUpdateSummary({
      checkedAt: 0,
      channels: { latest: '0.2.9' },
      source: 'test',
      cached: false,
    }, '0.2.2-rc.5')
    expect(lines.join('\n')).toContain('npm install -g @gblelis/dsh-tui@latest')
  })

  it('describes every verdict in words', () => {
    for (const verdict of ['behind', 'prerelease-available', 'current', 'unknown'] as const) {
      expect(describeVerdict(verdict).length).toBeGreaterThan(0)
    }
  })
})

describe('fetchChannels', () => {
  it('keeps the tracked channels and drops junk', async () => {
    const channels = await fetchChannels(async () => jsonResponse({
      latest: '0.2.2-rc.5',
      alpha: '0.2.3-alpha.2',
      beta: 'ignored',
      next: 42,
    }))
    expect(channels).toEqual({ latest: '0.2.2-rc.5', alpha: '0.2.3-alpha.2' })
  })

  it('refuses an answer larger than the accepted bound', async () => {
    const huge = JSON.stringify({ latest: '0.2.2-rc.5', alpha: 'x'.repeat(MAX_REGISTRY_BYTES + 32) })
    await expect(fetchChannels(async () => new Response(huge, { headers: { 'content-type': 'application/json' } }))).rejects.toThrow('exceeded')
  })

  it('rejects a declared oversized answer before reading it', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': String(MAX_REGISTRY_BYTES + 1), 'content-type': 'application/json' },
    })
    await expect(fetchChannels(async () => response)).rejects.toThrow('declared')
  })

  it('rejects a non-JSON or failing answer', async () => {
    await expect(fetchChannels(async () => jsonResponse({}, 500))).rejects.toThrow('HTTP 500')
    await expect(fetchChannels(async () => jsonResponse({ next: 'x' }))).rejects.toThrow('no latest channel')
    await expect(fetchChannels(async () => new Response('{}', { headers: { 'content-type': 'text/html' } })))
      .rejects.toThrow('not JSON')
  })

  it('refuses a non-https endpoint outside loopback', async () => {
    await expect(fetchChannels(async () => jsonResponse({ latest: '0.2.2-rc.5' }), 'http://registry.example/d'))
      .rejects.toThrow('non-https')
  })
})

describe('checkForUpdate', () => {
  it('fetches once, caches, and answers from the cache while fresh', async () => {
    const dir = home()
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return jsonResponse({ latest: '0.2.3', alpha: '0.2.3-alpha.2' })
    }) as typeof fetch

    const first = await checkForUpdate({ home: dir, fetchImpl, now: 1_000 })
    expect(first).toMatchObject({ cached: false, channels: { latest: '0.2.3' } })
    expect(calls).toBe(1)

    const second = await checkForUpdate({ home: dir, fetchImpl, now: 1_000 + 60_000 })
    expect(second).toMatchObject({ cached: true })
    expect(calls).toBe(1)
  })

  it('refreshes past the TTL and when asked', async () => {
    const dir = home()
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return jsonResponse({ latest: calls === 1 ? '0.2.2-rc.5' : '0.2.9' })
    }) as typeof fetch

    await checkForUpdate({ home: dir, fetchImpl, now: 0 })
    const stale = await checkForUpdate({ home: dir, fetchImpl, now: UPDATE_CHECK_TTL_MS + 1 })
    expect(stale?.channels.latest).toBe('0.2.9')
    await checkForUpdate({ home: dir, fetchImpl, now: 10, refresh: true })
    expect(calls).toBe(3)
  })

  it('falls back to the cached answer when the network fails', async () => {
    const dir = home()
    await checkForUpdate({
      home: dir,
      now: 0,
      fetchImpl: (async () => jsonResponse({ latest: '0.2.2-rc.5' })) as typeof fetch,
    })
    const offline = await checkForUpdate({
      home: dir,
      now: UPDATE_CHECK_TTL_MS + 5,
      fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
    })
    expect(offline?.cached).toBe(true)
    expect(offline?.channels.latest).toBe('0.2.2-rc.5')
  })

  it('returns nothing when the network fails with no cache', async () => {
    const dir = home()
    const status = await checkForUpdate({
      home: dir,
      fetchImpl: (async () => { throw new Error('offline') }) as typeof fetch,
    })
    expect(status).toBeUndefined()
  })

  it('ignores a damaged cache file', async () => {
    const dir = home()
    mkdirSync(dirname(updateCachePath(dir)), { recursive: true })
    writeFileSync(updateCachePath(dir), '{ not json')
    const status = await checkForUpdate({
      home: dir,
      fetchImpl: (async () => jsonResponse({ latest: '0.2.2-rc.5' })) as typeof fetch,
    })
    expect(status?.cached).toBe(false)
  })

  it('survives an unwritable cache directory', async () => {
    const status = await checkForUpdate({
      home: '/proc/definitely-not-writable',
      fetchImpl: (async () => jsonResponse({ latest: '0.2.2-rc.5' })) as typeof fetch,
    })
    expect(status?.cached).toBe(false)
  })
})

describe('isFresh', () => {
  it('rejects future timestamps and old records', () => {
    expect(isFresh({ checkedAt: 5_000, channels: {} }, 1_000)).toBe(false)
    expect(isFresh({ checkedAt: 0, channels: {} }, UPDATE_CHECK_TTL_MS)).toBe(false)
    expect(isFresh({ checkedAt: 0, channels: {} }, UPDATE_CHECK_TTL_MS - 1)).toBe(true)
  })
})
