import { defineConfig } from 'vitest/config'

export default defineConfig({
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
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: '50%',
        minForks: 1,
        isolate: true,
        singleFork: false,
      },
    },
    include: ['test/**/*.{test,spec}.ts'],
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
      include: ['index.ts', 'domain/**/*.ts', 'stages/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.config.ts', '**/*.test.ts', '**/*.spec.ts'],
      all: true,
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // NO THRESHOLD YET — deliberate.
      //
      // The reference repository (takeokunn/ts-minecraft) enforces 99% on
      // branches/functions/lines/statements. A threshold on a skeleton would be
      // meaningless: it would be trivially satisfied by a handful of type-only
      // modules and would say nothing about the real implementation.
      //
      // Coverage is collected and reported (`pnpm test:coverage`) so the number
      // is always visible. The 99% gate is turned on — here and in the CI
      // workflow — when this repository reaches its completion criteria.
      //
      //   thresholds: { branches: 99, functions: 99, lines: 99, statements: 99 },
    },
  },
  esbuild: {
    target: 'node22',
    format: 'esm',
    platform: 'node',
  },
})
