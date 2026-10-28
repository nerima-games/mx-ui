/* eslint-disable max-params, max-statements, no-magic-numbers, no-ternary, no-undefined -- Geometry is clearer with direct index arithmetic and absent-region checks. */
import type { InventoryViewModel, SlotRegion } from '../domain/inventory-view-model.js'
import type { InventoryInteractionTarget } from './inventory-view.js'

export type InventoryNavigationDirection = 'down' | 'left' | 'right' | 'up'

type NavigableRegion = Extract<SlotRegion, { readonly kind: 'slots' }>

const FIRST_INDEX = 0
const MINIMUM_COLUMNS = 1

const navigableRegions = (model: InventoryViewModel): ReadonlyArray<NavigableRegion> =>
  model.regions.filter(
    (region): region is NavigableRegion =>
      region.kind === 'slots' && region.slots.length > FIRST_INDEX,
  )


const INVENTORY_SELECTOR = '[data-mx-ui="inventory"]'
const REGION_SELECTOR = '[data-mx-ui="region"]'
const SLOT_SELECTOR = '[data-mx-ui="slot"]'
const HOTBAR_SELECTOR = '[data-mx-ui="hotbar"]'
const CRAFTING_OUTPUT_SELECTOR = '[data-mx-ui="crafting-output"]'
const CRAFTING_OUTCOME_SELECTOR = '[data-mx-ui="crafting-outcome"]'
const REGION_ATTRIBUTE = 'data-region'
const REGION_STATE_ATTRIBUTE = 'data-region-state'
const SLOT_INDEX_ATTRIBUTE = 'data-slot-index'
const CRAFTING_OUTPUT_FOCUS_GROUP = 'crafting-output'
const ELEMENT_NODE_TYPE = 1

type InventoryFocusTarget = Readonly<{ readonly group: string; readonly index: number }>

const isElement = (target: unknown): target is Element =>
  typeof target === 'object' &&
  target !== null &&
  'nodeType' in target &&
  target.nodeType === ELEMENT_NODE_TYPE &&
  'closest' in target &&
  typeof target.closest === 'function'

const focusIndexForSlot = (slot: Element): number | undefined => {
  if (slot.hasAttribute('hidden')) {
    return undefined
  }
  const value = slot.getAttribute(SLOT_INDEX_ATTRIBUTE)
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return undefined
  }
  const index = Number(value)
  return Number.isSafeInteger(index) ? index : undefined
}

const focusTargetForSlot = (slot: Element, index: number) => {
  if (slot.closest(HOTBAR_SELECTOR) !== null) {
    return { group: 'hotbar', index }
  }

  const region = slot.closest(REGION_SELECTOR)
  const inventory = slot.closest(INVENTORY_SELECTOR)
  if (
    region === null ||
    inventory === null ||
    region.closest(INVENTORY_SELECTOR) !== inventory ||
    region.getAttribute(REGION_STATE_ATTRIBUTE) !== 'slots'
  ) {
    return undefined
  }

  const group = region.getAttribute(REGION_ATTRIBUTE)
  if (group === null || group.length === 0) {
    return undefined
  }
  return { group, index }
}

const focusTargetForCraftingOutput = (element: Element) => {
  const output = element.closest(CRAFTING_OUTPUT_SELECTOR)
  if (output === null || output.hasAttribute('hidden')) {
    return undefined
  }

  const inventory = output.closest(INVENTORY_SELECTOR)
  const outcome = output.closest(CRAFTING_OUTCOME_SELECTOR)
  if (
    inventory === null ||
    outcome === null ||
    outcome.closest(INVENTORY_SELECTOR) !== inventory ||
    outcome.getAttribute('data-crafting-state') !== 'match'
  ) {
    return undefined
  }
  return { group: CRAFTING_OUTPUT_FOCUS_GROUP, index: FIRST_INDEX }
}

/** Resolve only focusable members marked by mx-ui's inventory and hotbar DOM. */
export const inventoryFocusTargetForElement = (
  target: unknown,
): InventoryFocusTarget | undefined => {
  if (!isElement(target)) {
    return undefined
  }

  const slot = target.closest(SLOT_SELECTOR)
  if (slot !== null) {
    const index = focusIndexForSlot(slot)
    return index === undefined ? undefined : focusTargetForSlot(slot, index)
  }
  return focusTargetForCraftingOutput(target)
}

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

  for (const [regionIndex, region] of regions.entries()) {
    if (region.id === current.region) {
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
    }
  }
  return current
}
