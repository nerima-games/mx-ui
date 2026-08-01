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
      include: ['src/index.ts', 'src/domain/**/*.ts', 'src/application/**/*.ts', 'src/stages/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.config.ts', '**/*.test.ts', '**/*.spec.ts'],
      all: true,
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // THE 99% GATE, ON. `docs/testing.md` §6.
      //
      // This block used to explain why there was NO threshold: a number imposed
      // on a skeleton is trivially satisfied by type-only modules and says
      // nothing about the implementation. That argument was about the skeleton
      // and it has expired — `domain/` now carries the view models, the caption
      // queue, the modal stack and the palette's own accessibility survey, and
      // `application/` carries seven renderers over a DOM surface this
      // repository defines.
      //
      // It is 99 rather than the measured 99.76 because the gate exists to catch
      // a REGRESSION. A threshold pinned to the current number turns every
      // unrelated refactor into a red build, which teaches people to lower the
      // number instead of writing the test.
      //
      // THE `exclude` LIST HAS FOUR ENTRIES AND ALL FOUR ARE FILE PATTERNS, not
      // source files. Nothing in `domain/`, `application/` or `stages/` is
      // excluded and nothing was added here to reach this number — including
      // `application/dom-surface.ts`, which reports 0/0/0/0 because it is
      // declarations only. It does not need excluding: a file with no statements
      // contributes 0/0 to the totals, so the row reads 0% and the headline is
      // unaffected. (mc-kernel and mx-redstone DO exclude their equivalent, to
      // keep the report free of a red row nobody should act on. Two defensible
      // answers; this one keeps the exclude list empty of source files, which is
      // the property that matters when somebody is tempted to add a fifth.)
      //
      // ONE BRANCH ARM IS UNCOVERED, in `application/hud-view.ts`: a
      // `HudViewModel` whose `hotbar` is shorter than the nine cells the view
      // built. `hudViewModel` always produces exactly nine, so nothing in this
      // repository can reach it; the type is published and says only
      // `ReadonlyArray<SlotView>`, so a consumer assembling one by hand can.
      // Covering it would mean bypassing the only producer, which teaches the
      // next reader that the producer can be short. The reason is written at the
      // call site and in docs/testing.md §6-2, and it is 0.24% of the branches.
      thresholds: { branches: 99, functions: 99, lines: 99, statements: 99 },
    },
  },
  esbuild: {
    target: 'node24',
    format: 'esm',
    platform: 'node',
  },
})
