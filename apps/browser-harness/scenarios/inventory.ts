import { Result } from 'effect'
import { itemStack as makeItemStack, type ItemStack } from '@nerima-games/mc-sim'
import { createInventoryView, type InventoryInteractionView } from '../../../src/application/inventory-view'
import {
  emptyInventorySnapshot,
  inventoryViewModel,
  type CraftingSnapshot,
  type InventorySnapshot,
} from '../../../src/domain/inventory-view-model'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from '../scenario-types'

const noTime = (): void => undefined

const stack = (count: number): ItemStack => {
  const result = makeItemStack('stone', count)
  if (Result.isSuccess(result)) {
    return result.success
  }
  throw new Error(`browser-harness: cannot build stone stack of ${String(count)}`)
}

const crafting = (result: CraftingSnapshot['result']): CraftingSnapshot => ({
  gridWidth: 2,
  grid: [stack(1), undefined, undefined, undefined],
  result,
})

const knownRegionsSnapshot = (): InventorySnapshot => {
  const slots = [...emptyInventorySnapshot.inventory.slots]
  slots[0] = stack(64)
  slots[9] = stack(1)
  return {
    ...emptyInventorySnapshot,
    armour: [stack(1)],
    crafting: crafting({ _tag: 'Match', output: stack(1) }),
    inventory: { slots },
    offhand: stack(1),
  }
}

const snapshotWithHotbarCount = (count: number | undefined): InventorySnapshot => {
  const snapshot = knownRegionsSnapshot()
  const slots = [...snapshot.inventory.slots]
  slots[0] = typeof count === 'undefined' ? undefined : stack(count)
  return { ...snapshot, inventory: { slots } }
}

const withInteraction = (status: string): InventoryInteractionView => ({
  focused: { kind: 'slot', region: 'hotbar', index: 0 },
  status,
})

const mountInventory = (
  context: ScenarioContext,
  snapshot: InventorySnapshot,
  options: {
    readonly interaction?: InventoryInteractionView
    readonly note?: string
  } = {},
): ScenarioMount => {
  const view = createInventoryView(context.factory, context.host)
  const model = inventoryViewModel(snapshot)
  view.render(model, options.interaction)
  if (options.note !== undefined) {
    const note = context.factory.createElement('p')
    note.setAttribute('data-inventory-scenario-note', '')
    note.setAttribute('role', 'note')
    note.textContent = options.note
    view.root.appendChild(note)
  }
  return { root: view.root, setTime: noTime, dispose: noTime, viewModel: () => model }
}

const scenario = (
  id: string,
  title: string,
  mount: ScenarioDefinition['mount'],
): ScenarioDefinition => ({
  id,
  isDefault: false,
  mount,
  screen: 'inventory',
  surface: 'Inventory and crafting',
  title,
})

export const INVENTORY_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  scenario('regions-known', 'All five regions populated', (context) =>
    mountInventory(context, knownRegionsSnapshot()),
  ),
  scenario('crafting-match', 'Crafting result: match', (context) =>
    mountInventory(context, knownRegionsSnapshot()),
  ),
  scenario('crafting-no-match', 'Crafting result: no match', (context) =>
    mountInventory(context, {
      ...knownRegionsSnapshot(),
      crafting: crafting({ _tag: 'NoMatch' }),
    }),
  ),
  scenario('crafting-unknown', 'Crafting result: unknown', (context) =>
    mountInventory(
      context,
      {
        ...knownRegionsSnapshot(),
        crafting: crafting(undefined),
      },
      { note: 'Crafting result: unknown. The host has not supplied a result.' },
    ),
  ),
  scenario('unknown-region', 'Armour region: unknown', (context) =>
    mountInventory(context, { ...knownRegionsSnapshot(), armour: undefined }),
  ),
  scenario('cursor-stack', 'Cursor carries a stack', (context) =>
    mountInventory(
      context,
      { ...knownRegionsSnapshot(), carried: stack(64) },
      { interaction: withInteraction('Cursor holds stone, 64.') },
    ),
  ),
  scenario('stack-zero-empty', 'Stack count 0: empty slot', (context) =>
    mountInventory(
      context,
      snapshotWithHotbarCount(undefined),
      { note: 'Count 0 represents an empty slot; zero-count stacks are rejected.' },
    ),
  ),
  scenario('stack-one', 'Stack count 1', (context) =>
    mountInventory(context, snapshotWithHotbarCount(1)),
  ),
  scenario('stack-64', 'Stack count 64', (context) =>
    mountInventory(context, snapshotWithHotbarCount(64)),
  ),
  scenario('stack-99', 'StackCount 99: no current item supports it', (context) =>
    mountInventory(
      context,
      snapshotWithHotbarCount(undefined),
      { note: 'StackCount accepts 99, but no current item has a stack limit of 99; no 99-item stack is rendered.' },
    ),
  ),
  scenario('stack-100-rejected', 'Stack count 100: rejected', (context) =>
    mountInventory(
      context,
      snapshotWithHotbarCount(undefined),
      { note: 'Count 100 is rejected; StackCount accepts integers from 1 through 99.' },
    ),
  ),
  scenario('accessibility-name-role-state', 'Accessibility name, role, and state', (context) =>
    mountInventory(
      context,
      {
        ...knownRegionsSnapshot(),
        carried: stack(12),
        crafting: crafting({ _tag: 'NoMatch' }),
      },
      { interaction: withInteraction('Hotbar slot 1 focused; crafting has no match.') },
    ),
  ),
]
