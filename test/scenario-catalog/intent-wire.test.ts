import { JSDOM } from 'jsdom'
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCENARIO_REGISTRY } from '../../apps/browser-harness/scenario-registry'
import type {
  HarnessEnvironment,
  ScenarioContext,
  ScenarioDefinition,
} from '../../apps/browser-harness/scenario-types'

const ENVIRONMENT: HarnessEnvironment = {
  motion: 'full',
  cvd: 'off',
  width: 1280,
  height: 720,
  safe: 0,
  dpr: 1,
  textScale: 100,
  contrast: 'normal',
  background: 'mid',
}

const INTENT_CONTROL_SELECTORS: Readonly<Record<string, string>> = {
  brewing: '[data-brewing-operation="insert-selected-item"]',
  'enchanting-table': '[data-mx-ui="enchanting-offer"]:not(:disabled)',
  onboarding: '[data-onboarding-action="OpenHowToPlay"]',
  pause: '[data-pause-action="save-and-quit-to-title"]',
  trade: '[data-mx-ui="trade-close"]',
}

const expectedIntentFor = (scenario: ScenarioDefinition, control: HTMLButtonElement): unknown => {
  switch (scenario.screen) {
    case 'brewing': return { _tag: 'InsertSelectedItem' }
    case 'enchanting-table': {
      const target = control.getAttribute('data-operation-target')
      if (target === null) {
        throw new Error('intent wiring spec: enchanting offer has no operation target')
      }
      return target
    }
    case 'onboarding': return { _tag: 'OpenHowToPlay' }
    case 'pause': return { type: 'save-and-quit-to-title' }
    case 'trade': return { _tag: 'CloseTradeUi' }
    default: throw new Error(`intent wiring spec: no expected intent for ${scenario.screen}`)
  }
}

let currentDom: JSDOM | undefined = undefined

const openDocument = (): Document => {
  currentDom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  vi.stubGlobal('document', currentDom.window.document)
  vi.stubGlobal('window', currentDom.window)
  return currentDom.window.document
}

afterEach(() => {
  currentDom?.window.close()
  currentDom = undefined
  vi.unstubAllGlobals()
})

describe('scenario intent and view-model wiring', () => {
  // Catches any registered mount that leaves the diagnostics view-model panel unsupported.
  it('provides a view-model accessor for every registered scenario mount', () => {
    const document = openDocument()
    let mountedScenarios = 0

    for (const scenario of SCENARIO_REGISTRY) {
      const host = document.createElement('div')
      const context: ScenarioContext = {
        factory: document,
        host,
        environment: ENVIRONMENT,
        time: 0,
        emitIntent: () => undefined,
        runSync: Effect.runSync,
      }
      const mount = scenario.mount(context)
      mountedScenarios += 1
      expect(host.childNodes.length, `${scenario.screen}/${scenario.id}`).toBeGreaterThan(0)
      expect(mount.viewModel, `${scenario.screen}/${scenario.id}`).toBeTypeOf('function')
      mount.dispose()
    }

    expect(mountedScenarios).toBeGreaterThan(0)
  })

  // Catches real view callbacks left as no-ops instead of forwarding their control payloads.
  it('forwards controls from every registered scenario with an available intent control', () => {
    const document = openDocument()
    let emittedScenarioCount = 0

    for (const scenario of SCENARIO_REGISTRY) {
      const host = document.createElement('div')
      const emitted: unknown[] = []
      const context: ScenarioContext = {
        factory: document,
        host,
        environment: ENVIRONMENT,
        time: 0,
        emitIntent: (intent) => emitted.push(intent),
        runSync: Effect.runSync,
      }
      const mount = scenario.mount(context)
      const selector = INTENT_CONTROL_SELECTORS[scenario.screen]
      const control = selector === undefined ? null : host.querySelector<HTMLButtonElement>(selector)
      if (control !== null && !control.disabled) {
        emittedScenarioCount += 1
        control.click()
        expect(emitted, `${scenario.screen}/${scenario.id}`).toStrictEqual([
          expectedIntentFor(scenario, control),
        ])
      }
      mount.dispose()
    }

    expect(emittedScenarioCount).toBeGreaterThan(0)
  })
})
