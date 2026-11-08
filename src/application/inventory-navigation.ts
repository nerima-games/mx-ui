import type {
  FocusNavigationDirection,
  FocusTarget,
  FocusTargetForElement,
} from '@nerima-games/mc-render'
import type { InventoryViewModel, SlotRegion } from '../domain/inventory-view-model.js'
import type { InventoryInteractionTarget } from './inventory-view.js'

export type InventoryNavigationDirection = FocusNavigationDirection

type NavigableRegion = Extract<SlotRegion, { readonly kind: 'slots' }>

const FIRST_INDEX = 0
const MINIMUM_COLUMNS = 1
const FOCUS_STEP_BACKWARD = -1
const FOCUS_STEP_FORWARD = 1

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
const FOCUS_GROUP_ATTRIBUTE = 'data-focus-group'
const FOCUS_INDEX_ATTRIBUTE = 'data-focus-index'
const FOCUS_COLUMNS_ATTRIBUTE = 'data-focus-columns'
const DISABLED_ATTRIBUTE = 'disabled'
const ARIA_DISABLED_ATTRIBUTE = 'aria-disabled'
const HIDDEN_SELECTOR = '[hidden]'
const FOCUS_MEMBER_SELECTOR = `[${FOCUS_GROUP_ATTRIBUTE}][${FOCUS_INDEX_ATTRIBUTE}]`
const ELEMENT_NODE_TYPE = 1

const isElement = (target: unknown): target is Element =>
  typeof target === 'object' &&
  target !== null &&
  'nodeType' in target &&
  target.nodeType === ELEMENT_NODE_TYPE &&
  'closest' in target &&
  typeof target.closest === 'function'

const focusIndexForSlot = (slot: Element): number | undefined => {
  if (slot.hasAttribute('hidden')) {
    return
  }
  const value = slot.getAttribute(SLOT_INDEX_ATTRIBUTE)
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return
  }
  const index = Number(value)
  if (!Number.isSafeInteger(index)) {
    return
  }
  return index
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
    return
  }

  const group = region.getAttribute(REGION_ATTRIBUTE)
  if (group === null || group.length === FIRST_INDEX) {
    return
  }
  return { group, index }
}

const focusTargetForCraftingOutput = (element: Element) => {
  const output = element.closest(CRAFTING_OUTPUT_SELECTOR)
  if (output === null || output.hasAttribute('hidden')) {
    return
  }

  const inventory = output.closest(INVENTORY_SELECTOR)
  const outcome = output.closest(CRAFTING_OUTCOME_SELECTOR)
  if (
    inventory === null ||
    outcome === null ||
    outcome.closest(INVENTORY_SELECTOR) !== inventory ||
    outcome.getAttribute('data-crafting-state') !== 'match'
  ) {
    return
  }
  return { group: CRAFTING_OUTPUT_FOCUS_GROUP, index: FIRST_INDEX }
}

const focusTargetForMember = (member: Element): FocusTarget | undefined => {
  if (member.hasAttribute(DISABLED_ATTRIBUTE) || member.getAttribute(ARIA_DISABLED_ATTRIBUTE) === 'true') {
    return
  }
  const group = member.getAttribute(FOCUS_GROUP_ATTRIBUTE)
  const rawIndex = member.getAttribute(FOCUS_INDEX_ATTRIBUTE)
  if (
    group === null ||
    group.length === FIRST_INDEX ||
    rawIndex === null ||
    !/^(?:0|[1-9]\d*)$/.test(rawIndex)
  ) {
    return
  }
  const index = Number(rawIndex)
  if (!Number.isSafeInteger(index)) {
    return
  }
  return { group, index }
}

const focusTargetForMarkedElement = (element: Element): FocusTarget | undefined => {
  const member = element.closest(FOCUS_MEMBER_SELECTOR)
  if (member === null || member.closest(HIDDEN_SELECTOR) !== null) {
    return
  }
  return focusTargetForMember(member)
}

/** Resolve only focusable members marked by mx-ui's inventory and hotbar DOM. */
export const inventoryFocusTargetForElement = (
  target: unknown,
): FocusTarget | undefined => {
  if (!isElement(target)) {
    return
  }

  const slot = target.closest(SLOT_SELECTOR)
  if (slot !== null) {
    const index = focusIndexForSlot(slot)
    if (typeof index === 'undefined') {
      return
    }
    return focusTargetForSlot(slot, index)
  }
  return focusTargetForCraftingOutput(target)
}

/** Resolve a live mx-ui focus member to mc-render's `{ group, index }` DTO. */
export const focusTargetForElement: FocusTargetForElement = (target) => {
  if (!isElement(target) || target.closest(HIDDEN_SELECTOR) !== null) {
    return
  }
  return focusTargetForMarkedElement(target) ?? inventoryFocusTargetForElement(target)
}

const focusIndex = (element: Element): number | undefined => {
  const value = element.getAttribute(FOCUS_INDEX_ATTRIBUTE)
  if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) {
    return
  }
  const index = Number(value)
  if (!Number.isSafeInteger(index)) {
    return
  }
  return index
}

const focusColumns = (element: Element): number => {
  const rawColumns = element.getAttribute(FOCUS_COLUMNS_ATTRIBUTE)
  if (rawColumns === null || !/^[1-9]\d*$/.test(rawColumns)) {
    return MINIMUM_COLUMNS
  }
  const columns = Number(rawColumns)
  if (!Number.isSafeInteger(columns)) {
    return MINIMUM_COLUMNS
  }
  return columns
}

const focusStep = (direction: FocusNavigationDirection): number => {
  if (direction === 'left' || direction === 'up') {
    return FOCUS_STEP_BACKWARD
  }
  return FOCUS_STEP_FORWARD
}

type FocusMember = Readonly<{ element: Element; index: number }>

const availableFocusMember = (member: Element, group: string): FocusMember | undefined => {
  const index = focusIndex(member)
  if (
    member.getAttribute(FOCUS_GROUP_ATTRIBUTE) !== group ||
    member.closest(HIDDEN_SELECTOR) !== null ||
    member.hasAttribute(DISABLED_ATTRIBUTE) ||
    member.getAttribute(ARIA_DISABLED_ATTRIBUTE) === 'true' ||
    typeof index !== 'number'
  ) {
    return
  }
  return { element: member, index }
}

const memberForTarget = (members: ReadonlyArray<FocusMember>, target: FocusTarget): FocusMember | undefined =>
  members.find((member) => member.index === target.index)

const targetsForRegion = (region: NavigableRegion): Array<InventoryInteractionTarget> =>
  Array.from(region.slots.keys(), (index): InventoryInteractionTarget => ({
    index,
    kind: 'slot',
    region: region.id,
  }))

type FocusCandidateContext = {
  readonly columns: number
  readonly currentColumn: number
  readonly currentRow: number
  readonly horizontal: boolean
  readonly requestedIndex: number
  readonly step: number
}

type FocusCandidate = { readonly element: Element; readonly index: number }

const requestedIndexForDirection = (context: Readonly<{
  index: number
  step: number
  columns: number
  horizontal: boolean
}>): number => {
  if (context.horizontal) {
    return context.index + context.step
  }
  return context.index + context.step * context.columns
}

const focusCandidateContext = (
  current: FocusMember,
  direction: FocusNavigationDirection,
): FocusCandidateContext => {
  const columns = focusColumns(current.element)
  const step = focusStep(direction)
  const horizontal = direction === 'left' || direction === 'right'
  const currentRow = Math.floor(current.index / columns)
  const currentColumn = current.index % columns
  const requestedIndex = requestedIndexForDirection({
    columns,
    horizontal,
    index: current.index,
    step,
  })
  return { columns, currentColumn, currentRow, horizontal, requestedIndex, step }
}

const isBeforeInDirection = (step: number, candidate: number, current: number): boolean => {
  if (step < FIRST_INDEX) {
    return candidate < current
  }
  return candidate > current
}

const focusCandidateFor = (
  member: FocusMember,
  context: FocusCandidateContext,
): FocusCandidate | undefined => {
  const row = Math.floor(member.index / context.columns)
  const column = member.index % context.columns
  if (context.horizontal) {
    if (row !== context.currentRow || !isBeforeInDirection(context.step, column, context.currentColumn)) {
      return
    }
  } else if (
    column !== context.currentColumn ||
    !isBeforeInDirection(context.step, row, context.currentRow)
  ) {
    return
  }
  return { element: member.element, index: member.index }
}

const focusCandidates = (
  members: ReadonlyArray<FocusMember>,
  context: FocusCandidateContext,
): Array<FocusCandidate> =>
  members
    .map((member) => focusCandidateFor(member, context))
    .filter((candidate): candidate is FocusCandidate => typeof candidate !== 'undefined')
    .sort((left, right) => {
      const leftDistance = Math.abs(left.index - context.requestedIndex)
      const rightDistance = Math.abs(right.index - context.requestedIndex)
      return leftDistance - rightDistance
    })

const candidateForDirection = (
  members: ReadonlyArray<FocusMember>,
  current: FocusMember,
  direction: FocusNavigationDirection,
): Element | undefined => {
  const context = focusCandidateContext(current, direction)
  return focusCandidates(members, context)[FIRST_INDEX]?.element
}

const availableFocusMembers = (root: ParentNode, group: string): Array<FocusMember> =>
  Array.from(root.querySelectorAll(FOCUS_MEMBER_SELECTOR))
    .map((member) => availableFocusMember(member, group))
    .filter((member): member is FocusMember => typeof member !== 'undefined')

type FocusGroupPosition = Readonly<{ members: Array<FocusMember>; current: FocusMember }>

const focusGroupPositionForTarget = (root: ParentNode, target: FocusTarget): FocusGroupPosition | undefined => {
  if (
    target.group.length === FIRST_INDEX ||
    !Number.isSafeInteger(target.index) ||
    target.index < FIRST_INDEX
  ) {
    return
  }
  const members = availableFocusMembers(root, target.group)
  const current = memberForTarget(members, target)
  if (typeof current === 'undefined') {
    return
  }
  return { current, members }
}

/** Move focus within a marked DOM group using an intent from mc-render. */
export const moveFocusTarget = (
  root: ParentNode,
  target: FocusTarget,
  direction: FocusNavigationDirection,
): boolean => {
  const position = focusGroupPositionForTarget(root, target)
  if (typeof position === 'undefined') {
    return false
  }
  const next = candidateForDirection(position.members, position.current, direction)
  if (typeof next === 'undefined' || !('focus' in next) || typeof next.focus !== 'function') {
    return false
  }
  next.focus()
  return true
}

export const inventoryTargets = (
  model: InventoryViewModel,
): ReadonlyArray<InventoryInteractionTarget> => {
  const targets = navigableRegions(model).flatMap(targetsForRegion)
  if (model.crafting.kind !== 'match') {
    return targets
  }
  return [...targets, { kind: 'crafting-output' }]
}

export const sameInventoryTarget = (
  left: InventoryInteractionTarget,
  right: InventoryInteractionTarget,
): boolean =>
  left.kind === right.kind &&
  (left.kind === 'crafting-output' ||
    (right.kind === 'slot' && left.region === right.region && left.index === right.index))

const regionColumns = (region: NavigableRegion): number => {
  if (Number.isFinite(region.columns) && region.columns >= MINIMUM_COLUMNS) {
    return Math.floor(region.columns)
  }
  return MINIMUM_COLUMNS
}

const projectedIndex = (region: NavigableRegion, column: number, lastRow: boolean): number => {
  const columns = regionColumns(region)
  let rowStart = FIRST_INDEX
  if (lastRow) {
    rowStart = Math.floor((region.slots.length + FOCUS_STEP_BACKWARD) / columns) * columns
  }
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
  if (typeof region === 'undefined') {
    return current
  }
  return {
    index: projectedIndex(region, FIRST_INDEX, true),
    kind: 'slot',
    region: region.id,
  }
}

const horizontalStep = (direction: 'left' | 'right'): number => {
  if (direction === 'left') {
    return FOCUS_STEP_BACKWARD
  }
  return FOCUS_STEP_FORWARD
}

const isWithinHorizontalRow = (context: Readonly<{
  direction: 'left' | 'right'
  column: number
  delta: number
  columns: number
}>): boolean => {
  if (context.direction === 'left') {
    return context.column > FIRST_INDEX
  }
  return context.column + context.delta < context.columns
}

const moveHorizontally = (
  current: Extract<InventoryInteractionTarget, { readonly kind: 'slot' }>,
  direction: 'left' | 'right',
  geometry: Readonly<{ columns: number; slotCount: number }>,
): InventoryInteractionTarget => {
  const delta = horizontalStep(direction)
  const column = current.index % geometry.columns
  const destination = current.index + delta
  if (!isWithinHorizontalRow({ column, columns: geometry.columns, delta, direction })) {
    return current
  }
  if (destination < FIRST_INDEX || destination >= geometry.slotCount) {
    return current
  }
  return { ...current, index: destination }
}

const moveVertically = (context: Readonly<{
  current: Extract<InventoryInteractionTarget, { readonly kind: 'slot' }>
  direction: InventoryNavigationDirection
  columns: number
  slotCount: number
}>): InventoryInteractionTarget | undefined => {
  if (context.direction === 'up' && context.current.index >= context.columns) {
    return { ...context.current, index: context.current.index - context.columns }
  }
  if (context.direction === 'down' && context.current.index + context.columns < context.slotCount) {
    return { ...context.current, index: context.current.index + context.columns }
  }
  return
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

const moveAcrossRegionEdge = (context: Readonly<{
  model: InventoryViewModel
  regions: ReadonlyArray<NavigableRegion>
  current: Extract<InventoryInteractionTarget, { readonly kind: 'slot' }>
  regionIndex: number
  column: number
  direction: 'down' | 'up'
}>): InventoryInteractionTarget => {
  const adjacent = adjacentRegion(context.regions, context.regionIndex, context.direction)
  if (typeof adjacent !== 'undefined') {
    return {
      index: projectedIndex(adjacent, context.column, context.direction === 'up'),
      kind: 'slot',
      region: adjacent.id,
    }
  }
  if (context.direction === 'down' && context.model.crafting.kind === 'match') {
    return { kind: 'crafting-output' }
  }
  return context.current
}

const moveFromRegion = (context: Readonly<{
  model: InventoryViewModel
  regions: ReadonlyArray<NavigableRegion>
  current: Extract<InventoryInteractionTarget, { readonly kind: 'slot' }>
  regionIndex: number
  region: NavigableRegion
  direction: InventoryNavigationDirection
}>): InventoryInteractionTarget => {
  const { current, direction, model, region, regionIndex, regions } = context
  const columns = regionColumns(region)
  const column = current.index % columns
  if (direction === 'left' || direction === 'right') {
    return moveHorizontally(current, direction, { columns, slotCount: region.slots.length })
  }
  const verticalTarget = moveVertically({
    columns,
    current,
    direction,
    slotCount: region.slots.length,
  })
  if (typeof verticalTarget !== 'undefined') {
    return verticalTarget
  }
  return moveAcrossRegionEdge({ column, current, direction, model, regionIndex, regions })
}

type CurrentInventoryPosition =
  | Readonly<{
      kind: 'crafting-output'
      current: Extract<InventoryInteractionTarget, { readonly kind: 'crafting-output' }>
    }>
  | Readonly<{
      kind: 'slot'
      current: Extract<InventoryInteractionTarget, { readonly kind: 'slot' }>
      region: NavigableRegion
      regionIndex: number
    }>

const moveCurrentTarget = (context: Readonly<{
  model: InventoryViewModel
  regions: ReadonlyArray<NavigableRegion>
  position: CurrentInventoryPosition
  direction: InventoryNavigationDirection
}>): InventoryInteractionTarget => {
  const { direction, model, position, regions } = context
  if (position.kind === 'crafting-output') {
    return moveFromOutput(regions, position.current, direction)
  }
  return moveFromRegion({
    current: position.current,
    direction,
    model,
    region: position.region,
    regionIndex: position.regionIndex,
    regions,
  })
}

const requestedInventoryPosition = (
  model: InventoryViewModel,
  requested: InventoryInteractionTarget,
  regions: ReadonlyArray<NavigableRegion>,
): CurrentInventoryPosition | undefined => {
  if (requested.kind === 'crafting-output') {
    if (model.crafting.kind === 'match') {
      return { current: requested, kind: 'crafting-output' }
    }
    return
  }
  const match = Array.from(regions.entries()).find(([, region]) =>
    requested.region === region.id &&
    Number.isSafeInteger(requested.index) &&
    requested.index >= FIRST_INDEX &&
    requested.index < region.slots.length,
  )
  if (typeof match === 'undefined') {
    return
  }
  const [regionIndex, region] = match
  return { current: requested, kind: 'slot', region, regionIndex }
}

const currentInventoryPosition = (
  model: InventoryViewModel,
  requested: InventoryInteractionTarget,
  regions: ReadonlyArray<NavigableRegion>,
): CurrentInventoryPosition | undefined => {
  const requestedPosition = requestedInventoryPosition(model, requested, regions)
  if (typeof requestedPosition !== 'undefined') {
    return requestedPosition
  }
  const firstRegion = regions[FIRST_INDEX]
  if (typeof firstRegion !== 'undefined') {
    return {
      current: { index: FIRST_INDEX, kind: 'slot', region: firstRegion.id },
      kind: 'slot',
      region: firstRegion,
      regionIndex: FIRST_INDEX,
    }
  }
  if (model.crafting.kind === 'match') {
    return { current: { kind: 'crafting-output' }, kind: 'crafting-output' }
  }
  return
}

/** Move through the inventory's published region geometry without owning input events. */
export const moveInventoryTarget = (
  model: InventoryViewModel,
  requested: InventoryInteractionTarget,
  direction: InventoryNavigationDirection,
): InventoryInteractionTarget => {
  const regions = navigableRegions(model)
  const position = currentInventoryPosition(model, requested, regions)
  if (typeof position === 'undefined') {
    return requested
  }
  return moveCurrentTarget({ direction, model, position, regions })
}
