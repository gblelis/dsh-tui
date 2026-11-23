/**
 * Launcher behavior that must never regress: range checking, argument
 * dispatch, and the profile's bundle-layer merge. These are pure functions, so
 * the suite needs no dsh runtime and no terminal.
 */

import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion, satisfiesRange } from '../src/launcher/semver.ts'
import { parseInvocation } from '../src/launcher/main.ts'
import { mergeBundles, artifactHash } from '../src/launcher/profile.ts'
import { BUNDLE_PACKAGE, PROFILE_BUNDLES } from '../src/launcher/constants.ts'

describe('semver gate', () => {
  it('parses prerelease versions', () => {
    expect(parseVersion('v0.2.2-rc.5')).toEqual({ major: 0, minor: 2, patch: 2, prerelease: ['rc', '5'] })
    expect(parseVersion('nonsense')).toBeUndefined()
  })

  it('orders prereleases below their release', () => {
    expect(compareVersions('0.2.2-rc.5', '0.2.2')).toBe(-1)
    expect(compareVersions('0.2.2-rc.5', '0.2.2-rc.6')).toBe(-1)
    expect(compareVersions('0.2.3', '0.2.2')).toBe(1)
    expect(compareVersions('0.2.2-rc.5', '0.2.2-rc.5')).toBe(0)
  })

  it('admits the whole 0.2 line above the floor for the caret range', () => {
    expect(satisfiesRange('0.2.2-rc.5', '^0.2.2-rc.5')).toBe(true)
    expect(satisfiesRange('0.2.2', '^0.2.2-rc.5')).toBe(true)
    expect(satisfiesRange('0.2.9', '^0.2.2-rc.5')).toBe(true)
    expect(satisfiesRange('0.2.1', '^0.2.2-rc.5')).toBe(false)
    expect(satisfiesRange('0.3.0', '^0.2.2-rc.5')).toBe(false)
    expect(satisfiesRange('1.0.0', '^0.2.2-rc.5')).toBe(false)
  })

  it('checks the Node floor', () => {
    expect(satisfiesRange('v24.9.0', '>=24.9.0')).toBe(true)
    expect(satisfiesRange('v26.13.0', '>=24.9.0')).toBe(true)
    expect(satisfiesRange('v22.23.4', '>=24.9.0')).toBe(false)
  })
})

describe('argument dispatch', () => {
  it('defaults to run with every app flag forwarded', () => {
    const invocation = parseInvocation(['--resume', 'abc', '--model', 'deepseek-official/deepseek-v4-pro'])
    expect(invocation.command).toBe('run')
    expect(invocation.rest).toEqual(['--resume', 'abc', '--model', 'deepseek-official/deepseek-v4-pro'])
  })

  it('consumes launcher flags only before the app arguments', () => {
    const invocation = parseInvocation(['--home', '/tmp/home', '--dsh-bin', '/x/bin.js', 'doctor'])
    expect(invocation.command).toBe('doctor')
    expect(invocation.home).toBe('/tmp/home')
    expect(invocation.dshBin).toBe('/x/bin.js')
  })

  it('treats everything after -- as app arguments', () => {
    const invocation = parseInvocation(['--', '--home', '/not-mine', '--json'])
    expect(invocation.command).toBe('run')
    expect(invocation.home).toBeUndefined()
    expect(invocation.rest).toEqual(['--home', '/not-mine', '--json'])
  })

  it('admits either supported release line', () => {
    const range = '^0.2.2-rc.5 || ^0.2.3-alpha.2'
    expect(satisfiesRange('0.2.2-rc.5', range)).toBe(true)
    expect(satisfiesRange('0.2.2', range)).toBe(true)
    expect(satisfiesRange('0.2.3-alpha.2', range)).toBe(true)
    expect(satisfiesRange('0.2.3-rc.1', range)).toBe(true)
    // Alternatives do not widen the floor into unrelated lines.
    expect(satisfiesRange('0.2.4-alpha.1', range)).toBe(false)
    expect(satisfiesRange('0.3.0-alpha.1', range)).toBe(false)
  })

  it('refuses a prerelease from a different release line', () => {
    // npm's rule: a prerelease only matches a range that names a prerelease of
    // the same major.minor.patch. 0.2.3-alpha.2 is a different, breaking line.
    expect(satisfiesRange('0.2.3-alpha.2', '^0.2.2-rc.5')).toBe(false)
    expect(satisfiesRange('0.2.3-alpha.1', '^0.2.2-rc.5')).toBe(false)
    expect(satisfiesRange('0.3.0-rc.1', '^0.2.2-rc.5')).toBe(false)
  })

  it('admits the pinned release and its own prereleases', () => {
    expect(satisfiesRange('0.2.2-rc.5', '^0.2.2-rc.5')).toBe(true)
    expect(satisfiesRange('0.2.2-rc.6', '^0.2.2-rc.5')).toBe(true)
    expect(satisfiesRange('0.2.2', '^0.2.2-rc.5')).toBe(true)
  })

  it('refuses a prerelease against a stable floor', () => {
    expect(satisfiesRange('26.0.0-rc.1', '>=24.9.0')).toBe(false)
    expect(satisfiesRange('26.13.0', '>=24.9.0')).toBe(true)
  })

  it('maps help and version aliases', () => {
    expect(parseInvocation(['-h']).command).toBe('help')
    expect(parseInvocation(['--help']).command).toBe('help')
    expect(parseInvocation(['-v']).command).toBe('version')
    expect(parseInvocation(['--version']).command).toBe('version')
  })

  it('rejects unknown positional commands instead of guessing', () => {
    expect(() => parseInvocation(['frobnicate'])).toThrow(/unknown command/u)
  })

  it('requires a value for path flags', () => {
    expect(() => parseInvocation(['--home'])).toThrow(/requires a directory/u)
    expect(() => parseInvocation(['--dsh-bin'])).toThrow(/requires a path/u)
  })
})

describe('profile bundle merge', () => {
  it('creates the required order for a fresh profile', () => {
    const merged = mergeBundles(undefined)
    expect(merged.bundles).toEqual([...PROFILE_BUNDLES])
    expect(merged.changed).toBe(true)
  })

  it('keeps base first and the terminal bundle second', () => {
    const merged = mergeBundles([BUNDLE_PACKAGE, '@deepseek-ai/dsh-base'])
    expect(merged.bundles).toEqual([...PROFILE_BUNDLES])
    expect(merged.changed).toBe(true)
  })

  it('preserves user bundles after the required layers', () => {
    const merged = mergeBundles(['@deepseek-ai/dsh-base', '@acme/dsh-extra', BUNDLE_PACKAGE])
    expect(merged.bundles).toEqual(['@deepseek-ai/dsh-base', BUNDLE_PACKAGE, '@acme/dsh-extra'])
  })

  it('reports no change for an already-correct profile', () => {
    const merged = mergeBundles([...PROFILE_BUNDLES])
    expect(merged.changed).toBe(false)
  })
})

describe('artifact hash', () => {
  it('is order-independent and content-sensitive', () => {
    const a = { path: 'a.js', content: Buffer.from('a') }
    const b = { path: 'b.js', content: Buffer.from('b') }
    expect(artifactHash([a, b])).toBe(artifactHash([b, a]))
    expect(artifactHash([a, b])).not.toBe(artifactHash([a, { path: 'b.js', content: Buffer.from('c') }]))
    expect(artifactHash([{ path: 'a.js', content: Buffer.from('a') }]))
      .toMatch(/^[0-9a-f]{64}$/u)
  })
})
