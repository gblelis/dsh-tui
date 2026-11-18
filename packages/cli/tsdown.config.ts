import { defineConfig } from 'tsdown'

/**
 * The CLI ships as one bundled file: Node builtins stay external, the launcher
 * modules are inlined, and anything resolved at runtime (the dsh installation)
 * is reached through the filesystem instead of the module graph.
 */
export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  fixedExtension: false,
  dts: false,
  clean: true,
})
