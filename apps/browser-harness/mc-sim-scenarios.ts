import { Effect } from 'effect'
import { INVENTORY_SLOT_COUNT, makeInventoryService } from '@nerima-games/mc-sim'
import { createInventoryView, type InventoryInteractionView } from '../../src/application/inventory-view'
import {
  emptyInventorySnapshot,
  inventoryViewModel,
} from '../../src/domain/inventory-view-model'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from './scenario-types'
import { INVENTORY_SCENARIOS as BASE_INVENTORY_SCENARIOS } from './scenarios/inventory'

const noTime = (): void => undefined

const mountMcSimInventory = (context: ScenarioContext): ScenarioMount => {
  const service = Effect.runSync(makeInventoryService())
  const view = createInventoryView(context.factory, context.host)
  const controls = context.factory.createElement('div')
  controls.setAttribute('data-mc-sim-controls', '')
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', 'mc-sim inventory intents')
  view.root.appendChild(controls)

  const addStoneButton = context.factory.createElement('button')
  addStoneButton.setAttribute('type', 'button')
  addStoneButton.setAttribute('data-mc-sim-intent', 'add-stone')
  addStoneButton.textContent = 'Add two stone'
  controls.appendChild(addStoneButton)

  const rejectInvalidSlotButton = context.factory.createElement('button')
  rejectInvalidSlotButton.setAttribute('type', 'button')
  rejectInvalidSlotButton.setAttribute('data-mc-sim-intent', 'invalid-slot')
  rejectInvalidSlotButton.textContent = 'Try invalid slot'
  controls.appendChild(rejectInvalidSlotButton)

  let status = 'mc-sim ready.'
  const interaction: InventoryInteractionView = {
    focused: { kind: 'slot', region: 'hotbar', index: 0 },
    status,
  }
  let model = inventoryViewModel(emptyInventorySnapshot)

  const render = (): void => {
    const inventory = Effect.runSync(service.snapshot)
    model = inventoryViewModel({ ...emptyInventorySnapshot, inventory })
    view.render(model, {
      ...interaction,
      status,
    })
  }

  const addStone = (): void => {
    const leftover = Effect.runSync(service.add('stone', 2))
    status = `mc-sim accepted: added two stone; ${String(leftover)} leftover.`
    render()
  }

  const rejectInvalidSlot = (): void => {
    const { _tag: resultTag } = Effect.runSync(service.click({
      _tag: 'LeftClick',
      carried: undefined,
      slotIndex: INVENTORY_SLOT_COUNT,
    }))
    status = resultTag === 'InvalidSlot'
      ? 'mc-sim rejected intent: InvalidSlot.'
      : `mc-sim returned ${resultTag}.`
    render()
  }

  addStoneButton.addEventListener('click', addStone)
  rejectInvalidSlotButton.addEventListener('click', rejectInvalidSlot)
  render()

  return {
    root: view.root,
    setTime: noTime,
    viewModel: () => model,
    dispose: () => {
      addStoneButton.removeEventListener?.('click', addStone)
      rejectInvalidSlotButton.removeEventListener?.('click', rejectInvalidSlot)
      view.root.textContent = ''
    },
  }
}

export const MC_SIM_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  {
    id: 'mc-sim-roundtrip',
    isDefault: false,
    mount: mountMcSimInventory,
    screen: 'inventory',
    surface: 'Inventory',
    title: 'mc-sim inventory round trip',
  },
]

export const INVENTORY_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  ...BASE_INVENTORY_SCENARIOS,
  ...MC_SIM_SCENARIOS,
]
