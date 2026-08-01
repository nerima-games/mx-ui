/* eslint-disable max-params, max-statements, no-magic-numbers, no-ternary, no-undefined -- Geometry is clearer with direct index arithmetic and absent-region checks. */
import type { InventoryViewModel, SlotRegion } from '../domain/inventory-view-model'
import type { InventoryInteractionTarget } from './inventory-view'

export type InventoryNavigationDirection = 'down' | 'left' | 'right' | 'up'

type NavigableRegion = Extract<SlotRegion, { readonly kind: 'slots' }>

const FIRST_INDEX = 0
const MINIMUM_COLUMNS = 1

const navigableRegions = (model: InventoryViewModel): ReadonlyArray<NavigableRegion> =>
  model.regions.filter(
    (region): region is NavigableRegion =>
      region.kind === 'slots' && region.slots.length > FIRST_INDEX,
  )

export const inventoryTargets = (
  model: InventoryViewModel,
): ReadonlyArray<InventoryInteractionTarget> => {
  const targets: Array<InventoryInteractionTarget> = []
  for (const region of navigableRegions(model)) {
    for (const index of region.slots.keys()) {
      targets.push({ index, kind: 'slot', region: region.id })
    }
  }
  if (model.crafting.kind === 'match') {
    targets.push({ kind: 'crafting-output' })
  }
  return targets
}

export const sameInventoryTarget = (
  left: InventoryInteractionTarget,
  right: InventoryInteractionTarget,
): boolean =>
  left.kind === right.kind &&
  (left.kind === 'crafting-output' ||
    (right.kind === 'slot' && left.region === right.region && left.index === right.index))

const regionColumns = (region: NavigableRegion): number =>
  Number.isFinite(region.columns) && region.columns >= MINIMUM_COLUMNS
    ? Math.floor(region.columns)
    : MINIMUM_COLUMNS

const projectedIndex = (region: NavigableRegion, column: number, lastRow: boolean): number => {
  const columns = regionColumns(region)
  const rowStart = lastRow
    ? Math.floor((region.slots.length - 1) / columns) * columns
    : FIRST_INDEX
  return Math.min(rowStart + column, region.slots.length - MINIMUM_COLUMNS)
}

const moveFromOutput = (
  regions: ReadonlyArray<NavigableRegion>,
  current: InventoryInteractionTarget,
  direction: InventoryNavigationDirection,
): InventoryInteractionTarget => {
  if (direction !== 'up' && direction !== 'left') {
    return current
  }
  const region = regions.at(-MINIMUM_COLUMNS)
  if (region === undefined) {
    return current
  }
  return {
    index: projectedIndex(region, FIRST_INDEX, true),
    kind: 'slot',
    region: region.id,
  }
}

const moveHorizontally = (
  current: Extract<InventoryInteractionTarget, { readonly kind: 'slot' }>,
  direction: 'left' | 'right',
  columns: number,
  slotCount: number,
): InventoryInteractionTarget => {
  const delta = direction === 'left' ? -MINIMUM_COLUMNS : MINIMUM_COLUMNS
  const column = current.index % columns
  const destination = current.index + delta
  const withinRow = direction === 'left' ? column > FIRST_INDEX : column + delta < columns
  if (!withinRow || destination < FIRST_INDEX || destination >= slotCount) {
    return current
  }
  return { ...current, index: destination }
}

const adjacentRegion = (
  regions: ReadonlyArray<NavigableRegion>,
  regionIndex: number,
  direction: 'down' | 'up',
): NavigableRegion | undefined => {
  if (direction === 'up') {
    return regions[regionIndex - MINIMUM_COLUMNS]
  }
  return regions[regionIndex + MINIMUM_COLUMNS]
}

/** Move through the inventory's published region geometry without owning input events. */
export const moveInventoryTarget = (
  model: InventoryViewModel,
  requested: InventoryInteractionTarget,
  direction: InventoryNavigationDirection,
): InventoryInteractionTarget => {
  const regions = navigableRegions(model)
  const targets = inventoryTargets(model)
  const current = targets.find((target) => sameInventoryTarget(target, requested)) ?? targets[0]
  if (current === undefined) {
    return requested
  }

  if (current.kind === 'crafting-output') {
    return moveFromOutput(regions, current, direction)
  }

  const regionIndex = regions.findIndex((region) => region.id === current.region)
  const region = regions[regionIndex]
  if (region === undefined) {
    return current
  }
  const columns = regionColumns(region)
  const column = current.index % columns

  if (direction === 'left' || direction === 'right') {
    return moveHorizontally(current, direction, columns, region.slots.length)
  }
  if (direction === 'up' && current.index >= columns) {
    return { ...current, index: current.index - columns }
  }
  if (direction === 'down' && current.index + columns < region.slots.length) {
    return { ...current, index: current.index + columns }
  }

  const adjacent = adjacentRegion(regions, regionIndex, direction)
  if (adjacent !== undefined) {
    return {
      index: projectedIndex(adjacent, column, direction === 'up'),
      kind: 'slot',
      region: adjacent.id,
    }
  }
  if (direction === 'down' && model.crafting.kind === 'match') {
    return { kind: 'crafting-output' }
  }
  return current
}
