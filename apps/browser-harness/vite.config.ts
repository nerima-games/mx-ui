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
 * `root` is this directory rather than the repository root, so the served page
 * is `/` and nothing outside `apps/browser-harness/` is addressable as a URL.
 * `fs.allow` then re-admits exactly the two directories the entry imports —
 * vite refuses to serve files above `root` otherwise, and `domain/` and
 * `application/` are above it.
 */
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const config: ReturnType<typeof defineConfig> = defineConfig({
  root: here,
  server: {
    // 5182, and the two numbers it is avoiding are both real.
    //
    // The reference's `playwright.config.ts` serves its own dev app on 5180, and
    // mc-compose's browser entry point took 5181 while this file was being
    // written — an actual collision, caught because this harness came up first
    // and the page that answered was titled 「mc-compose — composed frame」.
    //
    // `strictPort` is what turned that into a visible failure rather than a
    // silent hop to the next free port, which is the same call
    // `docs/e2e-triage.md` §0 records for the reference's own server. A harness
    // that quietly moves is a harness whose Playwright `baseURL` is pointing at
    // whatever else happens to be listening — and the failure mode is a suite
    // that passes against another repository's application.
    port: 5182,
    strictPort: true,
    fs: { allow: [repositoryRoot] },
  },
  // No `build` target. This is a dev harness and there is nothing to publish:
  // `docs/testing.md` §4 3 is met by `apps/preview-screens/`, and a `dist/` here
  // would be a second, unshipped artefact for `pnpm check:deps` and
  // `package.json#files` to disagree about.
  appType: 'mpa',
})

export default config
