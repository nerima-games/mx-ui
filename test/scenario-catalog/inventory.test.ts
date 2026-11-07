import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { itemStack } from '@nerima-games/mc-sim'
import { StackCount } from '@nerima-games/mc-kernel'
import { DEFAULT_HARNESS_STATE } from '../../apps/browser-harness/url-state'
import { INVENTORY_SCENARIOS } from '../../apps/browser-harness/scenarios/inventory'
import { fakeDocument, fakeElement } from '../fake-dom'

const EXPECTED_SCENARIO_IDS = [
  'regions-known',
  'crafting-match',
  'crafting-no-match',
  'crafting-unknown',
  'unknown-region',
  'cursor-stack',
  'stack-zero-empty',
  'stack-one',
  'stack-64',
  'stack-99',
  'stack-100-rejected',
  'accessibility-name-role-state',
]

const mountScenario = (id: string) => {
  const scenario = INVENTORY_SCENARIOS.find((entry) => entry.id === id)
  if (scenario === undefined) {
    throw new Error(`Missing inventory scenario: ${id}`)
  }
  const factory = fakeDocument()
  const host = fakeElement(factory.createElement('div'))
  const mount = scenario.mount({ factory, host, environment: DEFAULT_HARNESS_STATE, time: 0, emitIntent: () => undefined })
  return { factory, mount, root: fakeElement(mount.root) }
}

describe('inventory scenario catalog', () => {
  it('registers each requested state under a stable inventory scenario id', () => {
    const ids = INVENTORY_SCENARIOS.map((scenario) => scenario.id)
    expect(ids).toStrictEqual(EXPECTED_SCENARIO_IDS)
    expect(new Set(ids).size).toBe(EXPECTED_SCENARIO_IDS.length)
    expect(INVENTORY_SCENARIOS.every((scenario) => scenario.screen === 'inventory')).toBe(true)
    expect(INVENTORY_SCENARIOS.every((scenario) => scenario.isDefault === false)).toBe(true)
    expect(INVENTORY_SCENARIOS.every((scenario) => scenario.title.trim().length > 0)).toBe(true)
  })

  it('mounts every scenario into a non-empty inventory root without listeners', () => {
    for (const scenario of INVENTORY_SCENARIOS) {
      const factory = fakeDocument()
      const host = fakeElement(factory.createElement('div'))
      const mounted = scenario.mount({ factory, host, environment: DEFAULT_HARNESS_STATE, time: 0, emitIntent: () => undefined })
      const root = fakeElement(mounted.root)

      expect(root.attributes.get('data-mx-ui')).toBe('inventory')
      expect(root.findAll('data-mx-ui', 'region')).toHaveLength(5)
      expect(root.children.length).toBeGreaterThan(0)
      expect(root.listenersInTree()).toStrictEqual([])
      mounted.dispose()
    }
  })

  it('keeps the five known regions distinct from an unknown region', () => {
    const known = mountScenario('regions-known').root
    for (const region of ['hotbar', 'main', 'armour', 'offhand', 'crafting-grid']) {
      expect(known.find('data-region', region)?.attributes.get('data-region-state')).toBe('slots')
    }

    const unknown = mountScenario('unknown-region').root
    const armour = unknown.find('data-region', 'armour')
    expect(armour?.attributes.get('data-region-state')).toBe('unknown')
    expect(armour?.find('data-mx-ui', 'region-note')?.textContent).toContain('armour rack')
  })

  it('represents the crafting tri-state and explains unknown visibly', () => {
    expect(
      mountScenario('crafting-match').root
        .find('data-mx-ui', 'crafting-outcome')
        ?.attributes.get('data-crafting-state'),
    ).toBe('match')
    expect(
      mountScenario('crafting-no-match').root
        .find('data-mx-ui', 'crafting-outcome')
        ?.attributes.get('data-crafting-state'),
    ).toBe('no-match')

    const unknown = mountScenario('crafting-unknown').root
    expect(unknown.find('data-mx-ui', 'crafting-outcome')?.attributes.get('data-crafting-state')).toBe(
      'unknown',
    )
    expect(unknown.find('data-inventory-scenario-note', '')?.textContent).toContain('unknown')
    expect(unknown.find('data-mx-ui', 'crafting-output')?.attributes.get('hidden')).toBe('')
  })

  it('shows cursor and accessible inventory names, roles, and states', () => {
    const cursor = mountScenario('cursor-stack').root
    expect(cursor.find('data-mx-ui', 'carried')?.attributes.get('role')).toBe('status')
    expect(cursor.find('data-mx-ui', 'carried')?.attributes.get('aria-label')).toBe(
      'Carried item, stone, 64',
    )

    const accessible = mountScenario('accessibility-name-role-state').root
    const hotbarSlot = accessible.find('aria-label', 'hotbar slot 1, stone, 64')
    expect(hotbarSlot?.attributes.get('role')).toBe('button')
    expect(hotbarSlot?.attributes.get('aria-disabled')).toBe('false')
    expect(hotbarSlot?.attributes.get('tabindex')).toBe('0')

    const craftingOutput = accessible.find('data-mx-ui', 'crafting-output')
    expect(craftingOutput?.attributes.get('role')).toBe('button')
    expect(craftingOutput?.attributes.get('aria-label')).toBe('Crafting output, no matching recipe')
    expect(craftingOutput?.attributes.get('aria-disabled')).toBe('true')
    expect(accessible.find('data-mx-ui', 'inventory-status')?.textContent).toContain('crafting has no match')
  })

  it('renders valid stack counts and names invalid boundaries without casting them', () => {
    const firstSlot = (id: string) =>
      mountScenario(id).root.find('data-region', 'hotbar')?.findAll('data-mx-ui', 'slot')[0]

    expect(firstSlot('stack-zero-empty')?.find('data-mx-ui', 'slot-item')?.textContent).toBe('')
    expect(mountScenario('stack-zero-empty').root.find('data-inventory-scenario-note', '')?.textContent).toContain(
      'Count 0',
    )
    expect(firstSlot('stack-one')?.find('data-mx-ui', 'slot-item')?.textContent).toBe('stone')
    expect(firstSlot('stack-one')?.find('data-mx-ui', 'slot-count')?.textContent).toBe('')
    expect(firstSlot('stack-64')?.find('data-mx-ui', 'slot-count')?.textContent).toBe('64')
    expect(firstSlot('stack-99')?.find('data-mx-ui', 'slot-item')?.textContent).toBe('')
    expect(mountScenario('stack-99').root.find('data-inventory-scenario-note', '')?.textContent).toContain(
      'StackCount accepts 99',
    )
    expect(mountScenario('stack-100-rejected').root.find('data-inventory-scenario-note', '')?.textContent).toContain('Count 100 is rejected')

    expect(Result.isSuccess(StackCount.result(99))).toBe(true)
    expect(Result.isFailure(itemStack('stone', 99))).toBe(true)
    for (const count of [0, 100, 128]) {
      expect(Result.isFailure(StackCount.result(count))).toBe(true)
    }
  })
})
