/**
 * The harness's dev server.
 *
 * Vite and nothing else — no plugin, no framework, no PostCSS. `index.html`
 * loads `main.ts` directly and vite's only job is to turn TypeScript into
 * something a browser will execute. `package.json` points `main` and `exports`
 * at `.ts` source (`docs/versioning.md` §4 is the record of what that costs a
 * consumer), so a bundler is what makes this repository loadable in a browser at
 * all today.
 *
 * `root` is this directory, so page URLs stay under the harness. `fs.allow`
 * admits the harness and `src/` imports without exposing repository metadata.
 */
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const snapshotRoot = fileURLToPath(new URL('../../test-browser/ui-baselines.spec.ts-snapshots/', import.meta.url))
const harnessPort = Number(process.env['HARNESS_PORT'] ?? '5182')

const config: ReturnType<typeof defineConfig> = defineConfig({
  root: here,
  optimizeDeps: {
    include: ['@nerima-games/mc-kernel/domain/game-mode', '@nerima-games/mc-kernel/domain/settings', 'effect'],
  },
  server: {
    // Fail on a collision instead of silently serving another app.
    port: harnessPort,
    strictPort: true,
    fs: { allow: [here, sourceRoot, snapshotRoot] },
  },
  // No `build` target. This is a dev harness and there is nothing to publish:
  // `docs/testing.md` §4 3 is met by `apps/preview-screens/`, and a `dist/` here
  // would be a second, unshipped artefact for `pnpm check:deps` and
  // `package.json#files` to disagree about.
  appType: 'mpa',
})

export default config
