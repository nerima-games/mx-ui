/**
 * The gate that keeps mx-ui from reaching past its two parents.
 *
 * plan.md §5.3 rejects splitting mx-ui by screen — 「DOMのみでCIが軽く、プレビューは
 * 複数エントリで既に独立起動できる。利得ゼロ」 — which means this repository will
 * hold every screen the game has. A single repository containing all of the UI
 * is one import away from being a repository that depends on all of the game,
 * and these assertions are what stops that.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  allowedDirectDependencies,
  checkDeclaredDependencies,
  checkPolicyConfiguration,
  classifyImport,
  findBannedTimeSources,
  isToolingOrTestPath,
  REPOSITORY_POLICY,
  type DeclaredDependencies,
  type PolicyView,
} from '../scripts/check-dependency-whitelist'

const SHIPPED = 'stages/registration.ts'
const TOOLING = 'test/some.test.ts'

const declared = (
  dependencies: ReadonlyArray<string>,
  devDependencies: ReadonlyArray<string> = [],
): DeclaredDependencies => ({
  dependencies: new Set(dependencies),
  devDependencies: new Set(devDependencies),
})

const REAL_DEPENDENCIES = declared([
  '@nerima-games/mc-kernel',
  '@nerima-games/mc-sim',
  '@nerima-games/mc-audio',
])

/**
 * The same 16-repository roster, read as if this gate were installed in another
 * repository.
 *
 * Every copy of `check-dependency-whitelist.ts` carries the whole graph, so a
 * mistake in a row belonging to somebody else is invisible from this seat — the
 * import check only ever consults `thisPackage`'s row. Re-seating the policy is
 * how those rows get exercised at all.
 */
const seatOf = (thisPackage: string): PolicyView => ({
  thisPackage,
  dependencyGraph: REPOSITORY_POLICY.dependencyGraph,
  aliases: REPOSITORY_POLICY.aliases,
})

describe('mx-ui dependency policy', () => {
  it.effect('declares exactly the parents plan.md §3.13 gives it: sim and audio', () =>
    Effect.sync(() => {
      expect(REPOSITORY_POLICY.thisPackage).toBe('@nerima-games/mx-ui')
      expect([...allowedDirectDependencies()].sort()).toStrictEqual([
        '@nerima-games/mc-audio',
        '@nerima-games/mc-sim',
      ])
    }),
  )

  it.effect('carries the complete 16-repository roster, so cycle detection can see the whole organisation', () =>
    Effect.sync(() => {
      expect(REPOSITORY_POLICY.dependencyGraph.size).toBe(16)
      expect(checkPolicyConfiguration()).toStrictEqual([])
    }),
  )

  it.effect('mc-audio is a parent for exactly one reason: the caption event stream', () =>
    Effect.sync(() => {
      // plan.md §3.13: 「sim / audio(字幕購読)」. mx-ui does not play sounds; it
      // subscribes to CaptionEventStream (§4.3) so that a player who cannot hear
      // still sees what the game is saying.
      expect(
        classifyImport(
          {
            importedPackage: '@nerima-games/mc-audio',
            filePath: SHIPPED,
            line: 1,
            isToolingOrTest: false,
          },
          REAL_DEPENDENCIES,
        ),
      ).toBeUndefined()
    }),
  )
})

describe('§2.3-1: zero dependency edges between experience modules', () => {
  const SIBLINGS = [
    '@nerima-games/mx-gameplay',
    '@nerima-games/mx-redstone',
    '@nerima-games/mx-multiplayer',
  ] as const

  it.effect('REGRESSION: no experience module names another experience module in the graph', () =>
    Effect.sync(() => {
      const experienceModules = ['@nerima-games/mx-ui', ...SIBLINGS] as ReadonlyArray<string>

      for (const module of experienceModules) {
        const parents = REPOSITORY_POLICY.dependencyGraph.get(module) ?? new Set<string>()
        for (const parent of parents) {
          expect(experienceModules).not.toContain(parent)
        }
      }
    }),
  )

  it.effect('REGRESSION: importing mx-gameplay, mx-redstone or mx-multiplayer is rejected outright', () =>
    Effect.sync(() => {
      for (const sibling of SIBLINGS) {
        const violation = classifyImport(
          { importedPackage: sibling, filePath: SHIPPED, line: 1, isToolingOrTest: false },
          REAL_DEPENDENCIES,
        )
        expect(violation?.rule).toBe('not-whitelisted')
        // The inventory screen wants to know what mining dropped. It asks
        // mc-sim's InventoryService, which is where mx-gameplay put it.
        expect(violation?.message).toContain('not a direct dependency')
      }
    }),
  )
})

describe('no transitive closure', () => {
  it.effect('REGRESSION: mx-ui may NOT import mc-worldgen just because mc-sim does', () =>
    Effect.sync(() => {
      // A world-selection screen listing saved worlds is the tempting case. It
      // asks mc-sim, not mc-worldgen and not mc-save.
      const violation = classifyImport(
        {
          importedPackage: '@nerima-games/mc-worldgen',
          filePath: SHIPPED,
          line: 12,
          isToolingOrTest: false,
        },
        REAL_DEPENDENCIES,
      )

      expect(violation?.rule).toBe('transitive-import')
      expect(violation?.message).toContain(
        '@nerima-games/mx-ui -> @nerima-games/mc-sim -> @nerima-games/mc-worldgen',
      )
    }),
  )

  it.effect('REGRESSION: mc-save and mc-physics are equally out of reach', () =>
    Effect.sync(() => {
      for (const reached of ['@nerima-games/mc-save', '@nerima-games/mc-physics']) {
        const violation = classifyImport(
          { importedPackage: reached, filePath: SHIPPED, line: 1, isToolingOrTest: false },
          REAL_DEPENDENCIES,
        )
        expect(violation?.rule).toBe('transitive-import')
      }
    }),
  )

  it.effect('REGRESSION: mc-render is not a parent, even though mx-ui and mc-render share a screen', () =>
    Effect.sync(() => {
      // plan.md §2.3-2 puts the runtime input service in mc-render. mx-ui's
      // key-remapping SCREEN is here; the bindings themselves are mc-render's,
      // and they reach mx-ui through mc-sim's settings state.
      const violation = classifyImport(
        {
          importedPackage: '@nerima-games/mc-render',
          filePath: SHIPPED,
          line: 1,
          isToolingOrTest: false,
        },
        REAL_DEPENDENCIES,
      )
      expect(violation?.rule).toBe('not-whitelisted')
    }),
  )

  it.effect('both declared parents ARE importable from shipped source', () =>
    Effect.sync(() => {
      for (const parent of allowedDirectDependencies()) {
        expect(
          classifyImport(
            { importedPackage: parent, filePath: SHIPPED, line: 1, isToolingOrTest: false },
            REAL_DEPENDENCIES,
          ),
        ).toBeUndefined()
      }
    }),
  )

  it.effect('mc-kernel is importable without appearing in any allowlist, but must still be declared', () =>
    Effect.sync(() => {
      expect(
        classifyImport(
          {
            importedPackage: '@nerima-games/mc-kernel',
            filePath: SHIPPED,
            line: 1,
            isToolingOrTest: false,
          },
          REAL_DEPENDENCIES,
        ),
      ).toBeUndefined()

      expect(
        classifyImport(
          {
            importedPackage: '@nerima-games/mc-kernel',
            filePath: SHIPPED,
            line: 1,
            isToolingOrTest: false,
          },
          declared([]),
        )?.rule,
      ).toBe('undeclared-dependency')
    }),
  )
})

describe('§2.3-2: mc-playground-kit is devDependency-only', () => {
  const KIT = '@nerima-games/mc-playground-kit'

  it.effect('mx-ui needs no kit at all — its previews boot from the DOM alone', () =>
    Effect.sync(() => {
      // plan.md §3.13: 「kit 不要(DOMのみで起動)」. mx-ui therefore declares kit
      // nowhere; the rules below still hold, because the rule is org-wide.
      expect(allowedDirectDependencies().has(KIT)).toBe(false)
    }),
  )

  it.effect('REGRESSION: kit in "dependencies" would still be an error here, because the rule is org-wide', () =>
    Effect.sync(() => {
      const violations = checkDeclaredDependencies(declared([KIT]))
      expect(violations).toHaveLength(1)
      expect(violations[0]?.rule).toBe('dev-only-package-in-dependencies')
      expect(violations[0]?.message).toContain('delete input handling')
    }),
  )

  it.effect('REGRESSION: importing kit from shipped source is an error even if it is declared correctly', () =>
    Effect.sync(() => {
      const violation = classifyImport(
        { importedPackage: KIT, filePath: SHIPPED, line: 1, isToolingOrTest: false },
        declared([], [KIT]),
      )
      expect(violation?.rule).toBe('dev-only-package-in-shipped-source')
    }),
  )

  it.effect('kit remains allowed from tooling, should a preview ever want a world behind it', () =>
    Effect.sync(() => {
      expect(checkDeclaredDependencies(declared([], [KIT]))).toStrictEqual([])
      expect(
        classifyImport(
          { importedPackage: KIT, filePath: TOOLING, line: 1, isToolingOrTest: true },
          declared([], [KIT]),
        ),
      ).toBeUndefined()
    }),
  )

  it.effect('REGRESSION: `stages/` counts as shipped source, not as tooling', () =>
    Effect.sync(() => {
      expect(isToolingOrTestPath('stages/registration.ts')).toBe(false)
      expect(isToolingOrTestPath('domain/hud-view-model.ts')).toBe(false)
      expect(isToolingOrTestPath('index.ts')).toBe(false)
      expect(isToolingOrTestPath('test/view-model.test.ts')).toBe(true)
      expect(isToolingOrTestPath('scripts/check-dependency-whitelist.ts')).toBe(true)
    }),
  )
})

describe('§4.3: the clock is injected, never read from a global', () => {
  it.effect('REGRESSION: Date.now(), new Date() and performance.now() are all rejected', () =>
    Effect.sync(() => {
      // This matters more in mx-ui than anywhere else, because a UI is full of
      // things that want to know the time: caption expiry, toast fades, the
      // autosave indicator, the FPS counter.
      const source = [
        'const a = Date.now()',
        'const b = new Date()',
        'const c = performance.now()',
      ].join('\n')

      const violations = findBannedTimeSources(source, SHIPPED)
      expect(violations.map((violation) => violation.line)).toStrictEqual([1, 2, 3])
      expect(violations.every((violation) => violation.rule === 'banned-time-source')).toBe(true)
    }),
  )

  it.effect('a mention of Date.now() inside a comment or a string is not a violation', () =>
    Effect.sync(() => {
      const source = ['// Date.now() is banned', "const message = 'Date.now()'"].join('\n')
      expect(findBannedTimeSources(source, SHIPPED)).toStrictEqual([])
    }),
  )
})

describe('the roster, read from the seat of another repository', () => {
  it.effect('REGRESSION: seated in mx-gameplay, importing mx-ui is rejected — the zero-edge rule is symmetric', () =>
    Effect.sync(() => {
      // This is the direction that matters for the canonical example: mining
      // must not reach into the hotbar UI any more than the hotbar UI may reach
      // into mining.
      const violation = classifyImport(
        {
          importedPackage: '@nerima-games/mx-ui',
          filePath: SHIPPED,
          line: 1,
          isToolingOrTest: false,
        },
        declared(['@nerima-games/mx-ui']),
        seatOf('@nerima-games/mx-gameplay'),
      )
      expect(violation?.rule).toBe('not-whitelisted')
    }),
  )

  it.effect('mc-compose IS allowed to import mx-ui — it is the one repository that may', () =>
    Effect.sync(() => {
      expect(
        classifyImport(
          {
            importedPackage: '@nerima-games/mx-ui',
            filePath: SHIPPED,
            line: 1,
            isToolingOrTest: false,
          },
          declared(['@nerima-games/mx-ui']),
          seatOf('@nerima-games/mc-compose'),
        ),
      ).toBeUndefined()
    }),
  )

  it.effect('REGRESSION: mc-render owns the input service and reaches mc-sim; mx-ui does neither', () =>
    Effect.sync(() => {
      // plan.md §2.3-2. mc-render may import mc-sim directly; mx-ui may import
      // mc-sim too, but may NOT import mc-render — so the key bindings mx-ui's
      // remapping screen edits travel through mc-sim's settings state.
      expect(
        classifyImport(
          {
            importedPackage: '@nerima-games/mc-sim',
            filePath: SHIPPED,
            line: 1,
            isToolingOrTest: false,
          },
          declared(['@nerima-games/mc-sim']),
          seatOf('@nerima-games/mc-render'),
        ),
      ).toBeUndefined()
    }),
  )
})
