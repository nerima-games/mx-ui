import { defineConfig } from 'vitest/config'

const config: ReturnType<typeof defineConfig> = defineConfig({
  test: {
    // 'node', in the DOM repository, on purpose.
    //
    // Everything in domain/ is pure state derivation, so a DOM is dead weight
    // for it and jsdom would add seconds to every run. The screens that DO need
    // a document get their own environment when they are written — either a
    // per-file `// @vitest-environment jsdom` pragma or a second project entry.
    //
    // Whichever it is, that suite must be written with plain `it` +
    // `Effect.runPromise`, NOT `it.effect`: the reference implementation
    // established that `Effect.fork` + `Deferred.await` inside `it.effect`
    // deadlocks when the thing being awaited is resolved by a DOM event
    // listener. See docs/testing.md and docs/design-notes.md (DN-UI-2).
    environment: 'node',
    globals: false,
    // vitest 4 flattened the old `poolOptions.forks.{maxForks,minForks,isolate,
    // singleFork}` shape to top-level options (org toolchain freeze). `minForks`
    // has no replacement — vitest 4 no longer exposes a worker-pool floor.
    // `fileParallelism: true` below is what `singleFork: false` used to say.
    pool: 'forks',
    isolate: true,
    maxWorkers: '50%',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.git/**'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    slowTestThreshold: 300,
    fileParallelism: true,
    sequence: {
      seed: 0,
      hooks: 'stack',
    },
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      enabled: false,
      include: ['src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.config.ts', '**/*.test.ts', '**/*.spec.ts'],
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // THE 100% GATE (org toolchain freeze, Wave 0). `docs/testing.md` §5-6.
      //
      // THE `exclude` LIST HAS FOUR ENTRIES AND ALL FOUR ARE FILE PATTERNS, not
      // source files. Nothing in `domain/`, `application/` or `stages/` is
      // excluded and nothing was added here to reach this number — including
      // `application/dom-surface.ts`, which reports 0/0/0/0 because it is
      // declarations only. It does not need excluding: a file with no statements
      // contributes 0/0 to the totals, so the row reads 0% and the headline is
      // unaffected.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
  esbuild: {
    target: 'node24',
    format: 'esm',
    platform: 'node',
  },
})

export default config
