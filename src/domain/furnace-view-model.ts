import { slotView, type SlotView } from './hud-view-model'

export const FURNACE_SLOT_IDS = ['input', 'fuel', 'output'] as const

export type FurnaceSlotId = (typeof FURNACE_SLOT_IDS)[number]

/** mc-sim-independent inventory data needed to draw one furnace slot. */
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

const normalizedPercent = (progress: number): number => {
  if (!Number.isFinite(progress)) {
    return 0
  }
  return Math.round(Math.min(Math.max(progress, 0), 1) * 100)
}

const projectSlot = (
  id: FurnaceSlotId,
  index: number,
  snapshot: FurnaceSlotSnapshot | undefined,
): FurnaceSlotView =>
  Object.freeze({
    id,
    ...slotView(
      snapshot === undefined ? undefined : { ...snapshot, durability: undefined },
      index,
      -1,
    ),
  })

/** Purely derives the immutable presentation state for a furnace screen. */
export const furnaceViewModel = (snapshot: FurnaceSnapshot): FurnaceViewModel => {
  const slots = Object.freeze([
    projectSlot('input', 0, snapshot.input),
    projectSlot('fuel', 1, snapshot.fuel),
    projectSlot('output', 2, snapshot.output),
  ])

  return Object.freeze({
    slots,
    cookProgressPercent: normalizedPercent(snapshot.cookProgress),
    burnProgressPercent: normalizedPercent(snapshot.burnProgress),
  })
}
