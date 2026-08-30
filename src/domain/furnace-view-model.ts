import { type HotbarSlotSnapshot, type SlotView, slotView } from './hud-view-model.js'

export const FURNACE_SLOT_IDS = ['input', 'fuel', 'output'] as const

export type FurnaceSlotId = (typeof FURNACE_SLOT_IDS)[number]

/** Mc-sim-independent inventory data needed to draw one furnace slot. */
export type FurnaceSlotSnapshot = {
  readonly itemId: string
  readonly count: number
}

/** A host-owned furnace snapshot. Progress values are normalized to 0-1. */
export type FurnaceSnapshot = {
  readonly input: FurnaceSlotSnapshot | undefined
  readonly fuel: FurnaceSlotSnapshot | undefined
  readonly output: FurnaceSlotSnapshot | undefined
  readonly cookProgress: number
  readonly burnProgress: number
}

export type FurnaceSlotView = SlotView & {
  readonly id: FurnaceSlotId
}

export type FurnaceViewModel = {
  readonly slots: ReadonlyArray<FurnaceSlotView>
  readonly cookProgressPercent: number
  readonly burnProgressPercent: number
}

const ZERO = 0
const ONE = 1
const FULL_PERCENT = 100
/** Passed as `slotView`'s `selectedIndex` for a region with no cursor of its own. */
const NO_SELECTION = -1
const INPUT_INDEX = 0
const FUEL_INDEX = 1
const OUTPUT_INDEX = 2

const normalizedPercent = (progress: number): number => {
  if (!Number.isFinite(progress)) {
    return ZERO
  }
  return Math.round(Math.min(Math.max(progress, ZERO), ONE) * FULL_PERCENT)
}

/** Furnace slots never carry durability; `durability` stays absent by omission. */
const withHotbarShape = (
  snapshot: FurnaceSlotSnapshot,
  durability?: number,
): HotbarSlotSnapshot => ({
  ...snapshot,
  durability,
})

const toHotbarSlot = (
  snapshot: FurnaceSlotSnapshot | undefined,
): HotbarSlotSnapshot | undefined => {
  if (typeof snapshot === 'undefined') {
    return snapshot
  }
  return withHotbarShape(snapshot)
}

const projectSlot = (
  id: FurnaceSlotId,
  index: number,
  snapshot: FurnaceSlotSnapshot | undefined,
): FurnaceSlotView =>
  Object.freeze({
    id,
    ...slotView(toHotbarSlot(snapshot), index, NO_SELECTION),
  })

/** Purely derives the immutable presentation state for a furnace screen. */
export const furnaceViewModel = (snapshot: FurnaceSnapshot): FurnaceViewModel => {
  const slots = Object.freeze([
    projectSlot('input', INPUT_INDEX, snapshot.input),
    projectSlot('fuel', FUEL_INDEX, snapshot.fuel),
    projectSlot('output', OUTPUT_INDEX, snapshot.output),
  ])

  return Object.freeze({
    burnProgressPercent: normalizedPercent(snapshot.burnProgress),
    cookProgressPercent: normalizedPercent(snapshot.cookProgress),
    slots,
  })
}
