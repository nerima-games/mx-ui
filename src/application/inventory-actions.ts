import type { InventoryInteractionTarget } from './inventory-view.js'
import type { RegionId } from '../domain/inventory-view-model.js'

export const EQUIPMENT_SLOT_IDS = ['head', 'chest', 'legs', 'feet', 'offhand'] as const

export type EquipmentSlotId = (typeof EQUIPMENT_SLOT_IDS)[number]

export type InventoryActionTarget =
  | {
      readonly kind: 'slot'
      readonly region: Exclude<RegionId, 'armour' | 'offhand'>
      readonly index: number
    }
  | { readonly kind: 'equipment-slot'; readonly slot: EquipmentSlotId }
  | { readonly kind: 'crafting-output' }

export type InventoryDragTarget = Exclude<
  InventoryActionTarget,
  { readonly kind: 'crafting-output' }
>

export type InventoryAction =
  | { readonly kind: 'click'; readonly target: InventoryActionTarget }
  | { readonly kind: 'shift-click'; readonly target: InventoryActionTarget }
  | {
      readonly kind: 'drag'
      readonly source: InventoryDragTarget
      readonly target: InventoryDragTarget
    }

export type InventoryActionState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'rejected'
      readonly action: InventoryAction
      readonly reason: string
    }

const ARMOUR_SLOT_BY_INDEX: ReadonlyArray<EquipmentSlotId> = [
  'head',
  'chest',
  'legs',
  'feet',
]
const OFFHAND_SLOT_INDEX = 0

const armourActionTarget = (index: number): InventoryActionTarget | null => {
  const slot = ARMOUR_SLOT_BY_INDEX[index]
  if (!slot) {
    return null
  }
  return { kind: 'equipment-slot', slot }
}

/** Convert the renderer's region-local coordinates into a host-facing action target. */
export const inventoryActionTarget = (
  target: InventoryInteractionTarget,
): InventoryActionTarget | null => {
  if (target.kind === 'crafting-output') {
    return target
  }
  if (target.region === 'armour') {
    return armourActionTarget(target.index)
  }
  if (target.region === 'offhand') {
    if (target.index !== OFFHAND_SLOT_INDEX) {
      return null
    }
    return { kind: 'equipment-slot', slot: 'offhand' }
  }
  return { index: target.index, kind: 'slot', region: target.region }
}

export const inventoryActionStatus = (state: InventoryActionState): string => {
  if (state.kind === 'rejected') {
    return state.reason
  }
  return ''
}
