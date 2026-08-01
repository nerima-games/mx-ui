import { type SlotView, slotView } from './hud-view-model'

export const ANVIL_SLOT_IDS = ['primary-input', 'secondary-input', 'output'] as const

export type AnvilSlotId = (typeof ANVIL_SLOT_IDS)[number]

export const ANVIL_OPERATION_TARGETS = [...ANVIL_SLOT_IDS, 'name'] as const

export type AnvilOperationTarget = (typeof ANVIL_OPERATION_TARGETS)[number]

/** Mc-sim-independent inventory data needed to draw one anvil slot. */
export type AnvilSlotSnapshot = {
  readonly itemId: string
  readonly count: number
  /** 0-1, or `undefined` for an item with no durability. */
  readonly durability?: number
}

/** A host-owned snapshot of the complete anvil operation. */
export type AnvilSnapshot = {
  readonly primaryInput: AnvilSlotSnapshot | undefined
  readonly secondaryInput: AnvilSlotSnapshot | undefined
  readonly output: AnvilSlotSnapshot | undefined
  readonly name: string
  readonly levelCost: number
  readonly rejectionReason: string | undefined
}

export type AnvilSlotView = SlotView & {
  readonly id: AnvilSlotId
}

export type AnvilViewModel = {
  readonly slots: ReadonlyArray<AnvilSlotView>
  readonly name: string
  readonly levelCost: number
  readonly rejectionReason: string | undefined
}

const safeLevelCost = (cost: number): number =>
  Number.isFinite(cost) ? Math.max(0, Math.trunc(cost)) : 0

const projectSlot = (
  id: AnvilSlotId,
  index: number,
  snapshot: AnvilSlotSnapshot | undefined,
): AnvilSlotView =>
  Object.freeze({
    id,
    ...slotView(
      snapshot === undefined ? undefined : { ...snapshot, durability: snapshot.durability },
      index,
      -1,
    ),
  })

/** Purely derives the immutable presentation state for an anvil screen. */
export const anvilViewModel = (snapshot: AnvilSnapshot): AnvilViewModel => {
  const slots = Object.freeze([
    projectSlot('primary-input', 0, snapshot.primaryInput),
    projectSlot('secondary-input', 1, snapshot.secondaryInput),
    projectSlot('output', 2, snapshot.output),
  ])

  return Object.freeze({
    levelCost: safeLevelCost(snapshot.levelCost),
    name: snapshot.name,
    rejectionReason: snapshot.rejectionReason,
    slots,
  })
}
