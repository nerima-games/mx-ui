/**
 * The browser gate — and it is NOT part of `pnpm verify`.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS OUTSIDE `verify`, AND WHAT THE PRECEDENT IS
 * ---------------------------------------------------------------------------
 *
 * `pnpm verify` is 「CI と同じ内容」 (`docs/testing.md` §1) and CI has no browser
 * binary. Putting this suite in it would make the repository's headline gate
 * depend on a 180 MB download and a working Chromium, which turns the ordinary
 * failure 「somebody has not run `playwright install`」 into a red build that says
 * nothing about the code.
 *
 * The precedent is mc-compose's `check:roster`, which is a real gate with a real
 * script and is deliberately absent from that repository's `verify` line for the
 * same shape of reason. `pnpm test:coverage` is the precedent inside THIS
 * repository: `docs/testing.md` §1 records it as 「`verify` には含まれない」 and
 * §5 explains itself rather than assuming.
 *
 * So: a gate that documents its own environment requirement, named in
 * `docs/testing.md` §7, run with `pnpm test:browser`.
 *
 * ---------------------------------------------------------------------------
 * WHY SwiftShader WHEN mx-ui HAS NO WebGL
 * ---------------------------------------------------------------------------
 *
 * The reference's `playwright.config.ts` passes `--use-angle=swiftshader`
 * because its suite renders a WebGL world with no GPU available
 * (`docs/e2e-triage.md` §0 records the flag as part of the environment). mx-ui
 * has no canvas — `application/dom-surface.ts` has no `createElementNS` and the
 * daltonisation filter is markup belonging to whoever owns the canvas, which is
 * mc-render (DN-UI-1a). So the flag is not carried over out of imitation.
 *
 * It is carried over because THE PIXELS ARE THE DELIVERABLE. `palette-pixels.spec.ts`
 * asserts that a scrim over a mid-grey page composites to a specific triple, and
 * a colour read back from a screenshot is a function of the rasteriser that drew
 * it. Pinning the software rasteriser is what makes that number the same on a
 * developer's machine, on an Apple GPU, and in a container with none — which is
 * the difference between a measurement and an anecdote.
 */
import { defineConfig, devices } from '@playwright/test'

/** Kept in one place: `test-browser/harness.ts` builds every URL from it. */
export const HARNESS_PORT = 5182

const config: ReturnType<typeof defineConfig> = defineConfig({
  testDir: './test-browser',
  testMatch: '**/*.spec.ts',
  // 30s rather than the reference's 60s. Its timeout budgets a WebGL world
  // booting, a menu appearing and a `waitForReady`; this harness mounts seven
  // screens out of pure functions and sets an attribute, so a run that needs
  // thirty seconds is a run that has hung.
  timeout: 30_000,
  // NO RETRY, and this differs from the reference on purpose. Its single retry
  // absorbs 「parallel game instances can starve the render loop and drop
  // synthetic key presses」 — a real flake source with a real cause. Nothing here
  // is timing-dependent: there is no game loop, no input, and no animation the
  // assertions read. A retry would only hide a genuine intermittent failure, and
  // the first one deserves to be looked at rather than absorbed.
  retries: 0,
  workers: 1,
  forbidOnly: true,

  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${String(HARNESS_PORT)}`,
    // The desktop default. Every geometry assertion sets its own viewport, and
    // the two it sets are `docs/e2e-triage.md`'s: 320x568 and 390x844.
    viewport: { width: 1280, height: 720 },
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // The reference disables background throttling because its suite waits
        // on a frame loop. There is no loop here; the flags below are kept
        // because a throttled renderer can defer a paint, and a deferred paint
        // is a screenshot of the wrong thing.
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'pnpm preview:browser',
    url: `http://localhost:${String(HARNESS_PORT)}`,
    // FALSE, matching the reference, and the reason is not hypothetical: while
    // this harness was being written it came up on 5181 and a sibling
    // repository's dev server took the same port, so the page that answered was
    // titled 「mc-compose — composed frame」. `reuseExistingServer: true` is
    // exactly how a suite ends up green against another repository's
    // application. `strictPort` in the vite config is the other half.
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})

export default config
