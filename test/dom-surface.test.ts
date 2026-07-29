/**
 * The proof that `application/dom-surface.ts` describes the REAL DOM.
 *
 * Two halves, and neither is redundant:
 *
 *   1. A real `Document`, `HTMLElement`, `HTMLCanvasElement` and `SVGElement`
 *      satisfy the surface WITHOUT A CAST — checked by compiling
 *      `test/fixtures/dom-surface.ts` against the real `lib.dom.d.ts`.
 *   2. `domain/` still cannot reach a document — checked by the import graph.
 *      `domain/hud-view-model.ts` promised it: 「When the DOM layer arrives it
 *      goes in a sibling module that imports this one, never the other way
 *      round」, and the whole of `environment: 'node'` rests on it.
 *
 * The pattern is mc-render's (`mc-render/test/browser-input-adapter.test.ts`),
 * which needed half (1) because its build project has no DOM. This repository's
 * build project HAS the DOM lib, so the fixture also compiles in-project — and
 * the test still exists, because it is the gate that keeps working if somebody
 * narrows the lib, and because "compiles in a project that also has our own
 * types" is a weaker statement than "compiles against nothing but lib.dom".
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import ts from 'typescript'
import { fakeDocument, FakeElement } from './fake-dom'
import type { DomAttributeTarget, DomElement, DomElementFactory } from '../application/dom-surface'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('REGRESSION: the DOM surface is a real subset of the real DOM', () => {
  it.effect(
    'a real Document, HTMLElement, HTMLCanvasElement and SVGElement satisfy it without a cast',
    () =>
      Effect.sync(() => {
        // Three of the four shapes do not compile when written the natural way;
        // `test/fixtures/dom-surface.ts` records which three and why. None of
        // those regressions is visible to `pnpm typecheck` if the fixture is
        // edited to match a narrowed surface, which is why the fixture asserts
        // the DIRECTION that bites — a built element into a real `appendChild`,
        // and a real element into the surface's.
        const fixture = path.join(repositoryRoot, 'test', 'fixtures', 'dom-surface.ts')
        const program = ts.createProgram({
          rootNames: [fixture],
          options: {
            noEmit: true,
            strict: true,
            exactOptionalPropertyTypes: true,
            noUncheckedIndexedAccess: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            moduleDetection: ts.ModuleDetectionKind.Force,
            skipLibCheck: true,
            types: [],
            // THE POINT OF THE TEST: the real thing, not a hand-written stub.
            lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
          },
        })

        const diagnostics = [
          ...program.getSemanticDiagnostics(),
          ...program.getSyntacticDiagnostics(),
        ].filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)

        expect(
          diagnostics.map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
          ),
        ).toStrictEqual([])
      }),
    30_000,
  )

  it.effect('the fake document satisfies the same types the browser does, also without a cast', () =>
    Effect.sync(() => {
      // The other end of the same claim. If the fake needed
      // `as unknown as HTMLElement` then every rendering test below would be
      // measuring the cast rather than the renderer — and a browser and the fake
      // could drift apart with nothing to notice.
      const factory: DomElementFactory = fakeDocument()
      const element: DomElement = factory.createElement('div')
      const attributeTarget: DomAttributeTarget = factory.createElement('canvas')

      element.setAttribute('data-mx-ui', 'probe')
      element.style.setProperty('--mx-ui-heart', '#e02828')
      element.textContent = 'text'
      attributeTarget.setAttribute('data-color-vision', 'protanopia')

      expect(element).toBeInstanceOf(FakeElement)
    }),
  )

  it('REGRESSION: events exist only on the explicit native-control boundary', async () => {
    const source = await readFile(path.join(repositoryRoot, 'application', 'dom-surface.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '')
    expect(code.includes('export type DomInteractiveElement')).toBe(true)
    expect(code.match(/addEventListener/gu)?.length).toBe(1)
    expect(code.includes('removeEventListener')).toBe(false)
    expect(code.includes("createElement(tagName: 'button'): DomInteractiveElement")).toBe(true)
    expect(code.includes("createElement(tagName: 'input'): DomInputElement")).toBe(true)
    expect(code.includes('keydown')).toBe(false)
  })
})

describe('REGRESSION: domain/ still cannot reach a document', () => {
  it('every domain module is free of DOM references and of application imports', async () => {
    // `domain/hud-view-model.ts`: 「There is no `document` reference anywhere in
    // this file and there must not be one. When the DOM layer arrives it goes in
    // a sibling module that imports this one, never the other way round」.
    //
    // The direction is the whole reason `environment: 'node'` is affordable and
    // the reason the palette's guarantee is arithmetic. `lib.DOM` is on for
    // every project here, so nothing but this test enforces it.
    const domainDir = path.join(repositoryRoot, 'domain')
    const files = (await readdir(domainDir)).filter((name) => name.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)

    for (const name of files) {
      const source = await readFile(path.join(domainDir, name), 'utf8')
      const imports = [...source.matchAll(/from\s+'([^']+)'/gu)].map((match) => match[1])
      expect(imports.filter((specifier) => specifier?.includes('application'))).toStrictEqual([])
      // Comments in `domain/palette.ts` and `domain/accessibility.ts` discuss
      // stylesheets at length, so this looks for CODE: a bare global read.
      const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '')
      expect(/\bdocument\s*\./u.test(code)).toBe(false)
      expect(/\bwindow\s*\./u.test(code)).toBe(false)
    }
  })
})
