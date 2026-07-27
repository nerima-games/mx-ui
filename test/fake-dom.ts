/**
 * A document, in ninety lines, with a mutation counter.
 *
 * NOT A TEST — a helper the DOM tests build on. It exists because
 * `vitest.config.ts` runs `environment: 'node'` and that is a decision rather
 * than a default (`docs/testing.md` §2): jsdom would add seconds to every run of
 * a suite that is currently milliseconds, and would answer none of the questions
 * these tests ask. The questions are "did the palette token reach the element",
 * "how many mutations did an unchanged re-render perform" and "was a listener
 * attached" — jsdom can answer the first and is actively unhelpful for the
 * second, because it has no way to report that nothing happened.
 *
 * The reason this fake is TRUSTWORTHY is `test/dom-surface.test.ts`: it
 * implements `DomElementFactory` and `DomElement` with no cast, and a real
 * `Document` and `HTMLElement` satisfy those same types with no cast, proved by
 * compiling `test/fixtures/dom-surface.ts` against the real `lib.dom.d.ts`. A
 * fake that needed `as unknown as HTMLElement` would prove nothing about a
 * browser — it would prove things about the cast.
 *
 * `addEventListener` is here and is NOT part of the surface. That is
 * deliberate: the fake is deliberately MORE capable than the surface, so that
 * "the renderer attached no listener" is an observation about the renderer
 * rather than about what the fake was able to record.
 */
import type { DomElement, DomElementFactory, DomNode, DomStyle } from '../application/dom-surface'

/** Every write the renderer performed, in order. */
export type Mutation = {
  readonly kind: 'text' | 'attribute' | 'removeAttribute' | 'style' | 'removeStyle' | 'append' | 'listener'
  readonly target: FakeElement
  readonly name: string
  readonly value: string | undefined
}

/**
 * `Mutation`s and `FakeElement`s are CYCLIC, and that makes them unsafe to hand
 * to a matcher directly. Project through here first.
 *
 * A `Mutation` holds its `target`; a `FakeElement` holds the shared `log`; the
 * log holds every `Mutation`. Vitest only walks the graph when an assertion
 * FAILS, so `expect(factory.since(before)).toStrictEqual([])` is green and
 * harmless right up to the moment a stray write appears -- and then the reporter
 * follows the cycle, exhausts the heap, and kills the runner. The regression
 * test reports nothing on the one day it fires, which is worse than not having
 * it: a suite that dies looks like infrastructure trouble, not like the write it
 * was built to name.
 *
 * `kind:name` is what these assertions actually mean ("nothing was written",
 * "only the tabindex moved"), so nothing is lost by comparing the projection.
 * The element identity was never the claim.
 *
 * `listenersInTree()` returns `ReadonlyArray<string>` and is already safe;
 * `findAll()` returns `FakeElement`s and is NOT -- compare its length, or map it
 * to attributes, but do not deep-equal it.
 */
export const writeNames = (mutations: ReadonlyArray<Mutation>): ReadonlyArray<string> =>
  mutations.map((mutation) => `${mutation.kind}:${mutation.name}`)

export type FakeDocument = DomElementFactory & {
  readonly mutations: Array<Mutation>
  readonly created: Array<FakeElement>
  /** Mutations recorded since the last `mark()`. */
  mark: () => number
  since: (from: number) => ReadonlyArray<Mutation>
}

export class FakeStyle implements DomStyle {
  readonly properties = new Map<string, string>()

  constructor(private readonly owner: FakeElement) {}

  setProperty(property: string, value: string): void {
    this.properties.set(property, value)
    this.owner.record('style', property, value)
  }

  removeProperty(property: string): void {
    this.properties.delete(property)
    this.owner.record('removeStyle', property, undefined)
  }
}

export class FakeElement implements DomElement {
  readonly nodeType = 1
  readonly tagName: string
  readonly children: Array<FakeElement> = []
  readonly attributes = new Map<string, string>()
  readonly listeners: Array<string> = []
  readonly style: FakeStyle
  private text = ''

  constructor(tagName: string, private readonly log: Array<Mutation>) {
    this.tagName = tagName
    this.style = new FakeStyle(this)
  }

  record(kind: Mutation['kind'], name: string, value: string | undefined): void {
    this.log.push({ kind, target: this, name, value })
  }

  get textContent(): string {
    return this.text
  }

  set textContent(value: string | null) {
    this.text = value ?? ''
    // A real `textContent` write destroys and recreates the text node whatever
    // the value was, which is why `writeText` compares first and why this
    // records unconditionally.
    this.record('text', 'textContent', this.text)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    this.record('attribute', name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
    this.record('removeAttribute', name, undefined)
  }

  appendChild(child: DomNode): unknown {
    const element = child as FakeElement
    this.children.push(element)
    this.record('append', element.tagName, undefined)
    return element
  }

  /** NOT in `application/dom-surface.ts`. Present so its absence is observable. */
  addEventListener(type: string): void {
    this.listeners.push(type)
    this.record('listener', type, undefined)
  }

  /** Depth-first, self included. */
  *walk(): Generator<FakeElement> {
    yield this
    for (const child of this.children) {
      yield* child.walk()
    }
  }

  find(attribute: string, value: string): FakeElement | undefined {
    for (const element of this.walk()) {
      if (element.attributes.get(attribute) === value) {
        return element
      }
    }
    return undefined
  }

  findAll(attribute: string, value: string): ReadonlyArray<FakeElement> {
    const found: Array<FakeElement> = []
    for (const element of this.walk()) {
      if (element.attributes.get(attribute) === value) {
        found.push(element)
      }
    }
    return found
  }

  listenersInTree(): ReadonlyArray<string> {
    const all: Array<string> = []
    for (const element of this.walk()) {
      all.push(...element.listeners)
    }
    return all
  }
}

export const fakeDocument = (): FakeDocument => {
  const mutations: Array<Mutation> = []
  const created: Array<FakeElement> = []

  return {
    mutations,
    created,
    createElement: (tagName: string): DomElement => {
      const element = new FakeElement(tagName, mutations)
      created.push(element)
      return element
    },
    mark: (): number => mutations.length,
    since: (from: number): ReadonlyArray<Mutation> => mutations.slice(from),
  }
}
