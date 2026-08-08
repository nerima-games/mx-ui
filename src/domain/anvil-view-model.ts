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

const ZERO = 0
const NO_SELECTION_INDEX = -1
const PRIMARY_INPUT_SLOT_INDEX = 0
const SECONDARY_INPUT_SLOT_INDEX = 1
const OUTPUT_SLOT_INDEX = 2

const safeLevelCost = (cost: number): number => {
  if (Number.isFinite(cost)) {
    return Math.max(ZERO, Math.trunc(cost))
  }
  return ZERO
}

// No explicit return type: an inferred structural type (`durability` PRESENT
// And nullable) is what `slotView`'s `HotbarSlotSnapshot` parameter wants.
// Annotating this `AnvilSlotSnapshot` (`durability` OPTIONAL) would make the
// Call below fail — `exactOptionalPropertyTypes` treats "optional" and
// "present but nullable" as different contracts.
const cloneSlotSnapshot = (snapshot: AnvilSlotSnapshot | undefined) => {
  if (typeof snapshot === 'undefined') {
    return
  }
  return { ...snapshot, durability: snapshot.durability }
}

const projectSlot = (
  id: AnvilSlotId,
  index: number,
  snapshot: AnvilSlotSnapshot | undefined,
): AnvilSlotView =>
  Object.freeze({
    id,
    ...slotView(cloneSlotSnapshot(snapshot), index, NO_SELECTION_INDEX),
  })

/** Purely derives the immutable presentation state for an anvil screen. */
export const anvilViewModel = (snapshot: AnvilSnapshot): AnvilViewModel => {
  const slots = Object.freeze([
    projectSlot('primary-input', PRIMARY_INPUT_SLOT_INDEX, snapshot.primaryInput),
    projectSlot('secondary-input', SECONDARY_INPUT_SLOT_INDEX, snapshot.secondaryInput),
    projectSlot('output', OUTPUT_SLOT_INDEX, snapshot.output),
  ])

  return Object.freeze({
    levelCost: safeLevelCost(snapshot.levelCost),
    name: snapshot.name,
    rejectionReason: snapshot.rejectionReason,
    slots,
  })
}
