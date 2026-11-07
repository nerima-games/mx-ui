import { describe, expect, it } from 'vitest'
import type { HarnessEnvironment, ScenarioContext } from '../../apps/browser-harness/scenario-types'
import { STATION_SCENARIOS } from '../../apps/browser-harness/scenarios/stations'
import { fakeDocument, fakeElement } from '../fake-dom'

const SCREENS = [
  'furnace',
  'brewing',
  'anvil',
  'enchanting-table',
  'chest-storage',
  'trade',
] as const

const EXPECTED_SCENARIO_IDS = [
  'furnace/empty',
  'furnace/fuel-only',
  'furnace/input-ready',
  'furnace/insufficient-fuel',
  'furnace/in-progress',
  'furnace/output-ready',
  'furnace/progress-clamped',
  'furnace/non-finite-progress',
  'furnace/stack-count-boundaries',
  'furnace/zero-stack-count',
  'brewing/empty',
  'brewing/ready',
  'brewing/in-progress',
  'brewing/completed-output',
  'brewing/no-fuel',
  'brewing/one-bottle',
  'brewing/three-bottles',
  'brewing/max-fuel-and-stack',
  'anvil/empty',
  'anvil/repairable',
  'anvil/rename',
  'anvil/one-character-rename',
  'anvil/name-text-boundaries',
  'anvil/output-ready',
  'anvil/rejected-too-expensive',
  'anvil/negative-cost-normalized',
  'anvil/large-stack-count',
  'enchanting-table/empty',
  'enchanting-table/three-offers',
  'enchanting-table/lapis-rejection-message',
  'enchanting-table/experience-rejection-message',
  'enchanting-table/cost-normalization',
  'enchanting-table/stack-count-boundaries',
  'chest-storage/empty',
  'chest-storage/populated-regions',
  'chest-storage/full',
  'chest-storage/cursor-holds-item',
  'chest-storage/stack-count-boundaries',
  'chest-storage/slot-capacity-boundary',
  'trade/no-offers',
  'trade/available',
  'trade/unavailable',
  'trade/different-profession',
  'trade/out-of-stock',
  'trade/multiple-offers',
  'trade/quantity-boundaries',
  'trade/status-text-boundaries',
] as const

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

const makeContext = (): ScenarioContext => {
  const factory = fakeDocument()
  return {
    factory,
    host: factory.createElement('main'),
    environment: ENVIRONMENT,
    time: 0,
    emitIntent: () => undefined,
  }
}

const emulateRootTextContentClearing = (root: ReturnType<typeof fakeElement>): void => {
  // FakeElement records textContent writes but does not remove descendants like a browser does.
  let { textContent } = root
  Object.defineProperty(root, 'textContent', {
    configurable: true,
    get: () => textContent,
    set: (value: string | null) => {
      textContent = value ?? ''
      if (textContent === '') {
        root.children.splice(0)
      }
    },
  })
}

describe('station scenario catalog', () => {
  it('registers the complete, stable station scenario set', () => {
    expect(STATION_SCENARIOS.map(({ screen, id }) => `${screen}/${id}`)).toStrictEqual(
      EXPECTED_SCENARIO_IDS,
    )
    expect([...new Set(STATION_SCENARIOS.map(({ screen }) => screen))]).toStrictEqual(SCREENS)

    for (const screen of SCREENS) {
      const defaults = STATION_SCENARIOS.filter((scenario) => scenario.screen === screen && scenario.isDefault)
      expect(defaults.map(({ screen: defaultScreen, id }) => `${defaultScreen}/${id}`)).toHaveLength(1)
    }
  })

  for (const scenario of STATION_SCENARIOS) {
    it(`mounts ${scenario.screen}/${scenario.id} into one non-empty host and disposes`, () => {
      expect(scenario.title.trim()).not.toBe('')
      expect(scenario.surface.trim()).not.toBe('')

      const context = makeContext()
      const mount = scenario.mount(context)
      const host = fakeElement(context.host)
      const root = fakeElement(mount.root)

      expect(host.children).toHaveLength(1)
      expect(host.children[0]).toBe(root)
      expect(root.attributes.has('data-mx-ui')).toBe(true)
      expect(root.children.length).toBeGreaterThan(0)
      expect(() => mount.setTime(0)).not.toThrow()
      const listenersBeforeDispose = root.listenersInTree()
      if (['brewing', 'enchanting-table', 'trade'].includes(scenario.screen)) {
        expect(listenersBeforeDispose.length).toBeGreaterThan(0)
      }
      emulateRootTextContentClearing(root)
      mount.dispose()
      expect(root.textContent).toBe('')
      expect(root.children).toHaveLength(0)
      expect(root.listenersInTree()).toStrictEqual([])
    })
  }
})
