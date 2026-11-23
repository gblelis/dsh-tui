/**
 * Build-time embedding: copies the compiled bundle package into
 * `packages/cli/bundle/` with a content-addressed manifest, so the published
 * CLI is a single self-contained artifact that needs no package manager inside
 * `$DSH_HOME`.
 * @module @gblelis/dsh-tui/scripts/embed-bundle
 */

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const bundleRoot = join(cliRoot, '..', 'bundle')
const outDir = join(cliRoot, 'bundle')

/** The bundle package manifest written into the artifact. */
async function manifestJson(version: string): Promise<string> {
  return `${JSON.stringify({
    name: '@gblelis/dsh-tui-bundle',
    version,
    description: 'Terminal front end for DeepSeek Harness (embedded by @gblelis/dsh-tui)',
    type: 'module',
    license: 'MIT',
    exports: {
      '.': './lib/index.js',
      './startup': './lib/startup.js',
      './prompt': './lib/prompt-service.js',
      './testing': './lib/testing/capture-terminal.js',
      './package.json': './package.json',
    },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    engines: { node: '>=24.9.0', dsh: '^0.2.2-rc.5 || ^0.2.3-alpha.2' },
  }, undefined, 2)}\n`
}

/** Recursively list files under one directory, package-relative. */
async function listFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'tests') continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else out.push(relative(root, path).split(sep).join('/'))
    }
  }
  await walk(root)
  return out.sort((left, right) => left.localeCompare(right))
}

/** Deterministic digest over the exact bytes shipped. */
async function hash(files: readonly string[]): Promise<string> {
  const digest = createHash('sha256')
  for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
    digest.update(file)
    digest.update('\0')
    digest.update(await readFile(join(outDir, ...file.split('/'))))
    digest.update('\0')
  }
  return digest.digest('hex')
}

const pkg: unknown = JSON.parse(await readFile(join(bundleRoot, 'package.json'), 'utf8'))
const version = (pkg as { version?: unknown }).version
if (typeof version !== 'string') throw new Error('packages/bundle/package.json has no version')

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const libFiles = await listFiles(join(bundleRoot, 'lib'))
if (libFiles.length === 0) {
  throw new Error(`packages/bundle/lib is empty: run \`pnpm --filter @gblelis/dsh-tui-bundle build\` first`)
}
for (const file of libFiles) {
  const target = join(outDir, 'lib', ...file.split('/'))
  await mkdir(dirname(target), { recursive: true })
  await copyFile(join(bundleRoot, 'lib', ...file.split('/')), target)
}
// The patch is the bundle's identity; copy it verbatim beside the build output.
const patchName = 'cordis.patch.yml'
await copyFile(join(bundleRoot, patchName), join(outDir, patchName))

// LICENSE is copied from the repository root so the published tarball can
// never drift from the project's actual license text.
await copyFile(join(cliRoot, '..', '..', 'LICENSE'), join(cliRoot, 'LICENSE'))

const files = ['package.json', patchName, ...libFiles.map(file => `lib/${file}`)]
await writeFile(join(outDir, 'package.json'), await manifestJson(version))
const digest = await hash(files)
await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify({ version, hash: digest, files }, undefined, 2)}\n`)
process.stdout.write(`embedded ${files.length} files · @gblelis/dsh-tui-bundle@${version} · sha256 ${digest.slice(0, 12)}…\n`)
