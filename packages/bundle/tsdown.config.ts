import { defineConfig } from 'tsdown'

/**
 * The bundle is copied into a dsh profile as a self-contained directory:
 * every helper it imports (pi-tui's patched build, diff, saxes) is inlined,
 * while `@deepseek-ai/*` stays external so the profile resolves the running
 * dsh installation's single core copy (never a duplicate).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    startup: 'src/startup.ts',
    'prompt-service': 'src/prompt-service.ts',
    // Test-only terminal seam, inserted by an explicit `--patch` overlay; it is
    // never part of the normal boot path.
    'testing/capture-terminal': 'src/testing/capture-terminal.ts',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  external: [/^@deepseek-ai\//, /^node:/],
})
