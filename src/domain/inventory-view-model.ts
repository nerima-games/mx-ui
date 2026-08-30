/**
 * The inventory and crafting screens: a pure function from state to layout.
 *
 * ---------------------------------------------------------------------------
 * The boundary, stated once
 * ---------------------------------------------------------------------------
 *
 * plan.md §2.3-1: mc-sim owns the nouns, mx-ui owns the presentation. So:
 *
 * | mc-sim owns                      | mx-ui owns                              |
 * | -------------------------------- | --------------------------------------- |
 * | whether two stacks merge         | whether the screen highlights the target |
 * | whether a grid matches a recipe  | where the output square is drawn         |
 * | the 36 slots and what is in them | that 9 of them are a hotbar and 27 a grid |
 *
 * There is no `canStack` and no `matchRecipe` in this file and there must never
 * be one. Both answers arrive in the snapshot; this module PROJECTS them, and
 * when they are absent it says so rather than computing a plausible substitute.
 *
 * ---------------------------------------------------------------------------
 * `Inventory` / `Slot` / `ItemStack` are `@nerima-games/mc-sim`'s, imported
 * directly (Wave 1, W1-M7)
 * ---------------------------------------------------------------------------
 *
 * This module used to carry a hand-written copy of these three types, from
 * before mc-sim was published. `count` is `StackCount` there — a branded,
 * mc-kernel-owned integer clamped per item's stack limit — and this module
 * never brands one itself; every `ItemStack` it handles either arrived from a
 * snapshot mc-sim built, or (in `slotSnapshotOf`) has its count read into the
 * plain `number` `HotbarSlotSnapshot` expects, which a `StackCount` widens
 * into without help. `durability` still does not exist in mc-sim's
 * `ItemStack` (`{ item, count }` only) — mx-ui's `HotbarSlotSnapshot` carries
 * it as its own field, and `slotSnapshotOf` remains the one place that
 * attaches it.
 */
import {
  HOTBAR_SLOT_COUNT,
  type HotbarSlotSnapshot,
  type SlotView,
  slotView,
} from './hud-view-model.js'
import { INVENTORY_SLOT_COUNT, type Inventory, type ItemStack, type Slot } from '@nerima-games/mc-sim'

export { INVENTORY_SLOT_COUNT }

// ---------------------------------------------------------------------------
// What mx-ui owns: the layout
// ---------------------------------------------------------------------------

/**
 * The 36 slots, split.
 *
 * mc-sim hands over a FLAT array and says nothing about shape, which is
 * correct: "nine of these are a hotbar" is a fact about a screen, not about an
 * inventory. The split is therefore mx-ui's, and these three constants are the
 * only place it is stated.
 */
export const INVENTORY_MAIN_COLUMNS = 9
export const INVENTORY_MAIN_ROWS = 3
export const INVENTORY_MAIN_SLOT_COUNT: number = INVENTORY_MAIN_COLUMNS * INVENTORY_MAIN_ROWS

// ---------------------------------------------------------------------------
// The snapshot this screen reads
// ---------------------------------------------------------------------------

/**
 * The crafting grid, as mc-sim would hand it over.
 *
 * `gridWidth` is carried rather than assumed so that the player's 2x2 and a
 * crafting table's 3x3 are ONE projection with a different number in it. Two
 * functions for two grid sizes would be two derivations of one thing, which is
 * the mistake DN-UI-7c is the record of.
 */
export type CraftingSnapshot = {
  readonly gridWidth: number
  readonly grid: ReadonlyArray<Slot>
  /**
   * Mc-sim's answer to "does this grid make anything".
   *
   * `undefined` means MC-SIM HAS NOT ANSWERED. It does not mean "no recipe
   * matches" — that is `{ _tag: 'NoMatch' }` — and the difference is the whole
   * reason this field is three-valued. mc-sim can preview recipes now, but a
   * host may still omit that answer for a frame or container. The screen has to
   * be able to say "I do not know" without drawing an empty output square,
   * which would claim that a preview definitely found no match.
   */
  readonly result: CraftingResultSnapshot | undefined
}

export type CraftingResultSnapshot =
  | { readonly _tag: 'Match'; readonly output: ItemStack }
  | { readonly _tag: 'NoMatch' }

/**
 * Everything the inventory and crafting screens read.
 *
 * Every field that mc-sim may not have is `| undefined` rather than optional,
 * so the frame has to SAY it does not know. `exactOptionalPropertyTypes` is on
 * in this repository, and an absent key and an unknown value would otherwise be
 * the same thing at the call site — which is the exact confusion this module
 * exists to refuse.
 */
export type InventorySnapshot = {
  readonly inventory: Inventory
  /** Which hotbar slot the player is holding. Clamped, never trusted (DN-UI-7). */
  readonly selectedHotbarIndex: number
  /**
   * Per-slot durability in 0–1, by slot index. `undefined` for the whole map
   * means mc-sim does not carry durability yet — see the module header on
   * `ItemStack`.
   */
  readonly durabilityBySlot: ReadonlyMap<number, number> | undefined
  /** The stack on the cursor, if the player is dragging one. */
  readonly carried: Slot
  /** `undefined` — mc-sim has no armour slots. Projected as unknown, not as empty. */
  readonly armour: ReadonlyArray<Slot> | undefined
  /** `undefined` is unknown, `null` is a known-empty offhand, and a stack is occupied. */
  readonly offhand: Slot | null
  readonly crafting: CraftingSnapshot | undefined
  /**
   * Slot indices the carried stack may be dropped into, as MC-SIM ANSWERED.
   *
   * `undefined` means it has not answered. mx-ui must not work this out:
   * whether two stacks merge is a stacking rule and stacking rules are mc-sim's
   * (plan.md §2.3-1, `mc-sim/domain/inventory.ts` `addItem`, which tops up
   * partial stacks before opening new ones and caps at `MAX_STACK_COUNT`).
   * Comparing `itemId` here would reproduce a third of that rule and get the
   * cap wrong, and it would be wrong SILENTLY, in a highlight the player reads
   * as a promise.
   */
  readonly mergeableSlotIndices: ReadonlySet<number> | undefined
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

export type RegionId = 'hotbar' | 'main' | 'armour' | 'offhand' | 'crafting-grid'

/**
 * A region of the screen, or an honest admission that there is not one.
 *
 * `unknown` is the load-bearing case. An armour rack drawn as four empty
 * squares tells the player they are wearing nothing; mc-sim has not said that,
 * and has in fact said nothing at all, because it has no armour slots. Those
 * are different screens and only one of them is true.
 */
export type SlotRegion =
  | {
      readonly kind: 'slots'
      readonly id: RegionId
      readonly columns: number
      readonly slots: ReadonlyArray<SlotView>
    }
  | {
      readonly kind: 'unknown'
      readonly id: RegionId
      /** Shown to the developer, not to the player. */
      readonly why: string
    }

export type CraftingOutcomeView =
  | { readonly kind: 'match'; readonly output: SlotView }
  | { readonly kind: 'no-match' }
  /** Mc-sim has not answered. NOT the same screen as `no-match`. */
  | { readonly kind: 'unknown' }

export type MergeTargets =
  | { readonly kind: 'known'; readonly indices: ReadonlySet<number> }
  /** Mc-sim has not answered. The screen must highlight nothing rather than guess. */
  | { readonly kind: 'unknown' }

export type InventoryViewModel = {
  readonly regions: ReadonlyArray<SlotRegion>
  /** The stack on the cursor. Projected through the same `slotView` as the rest. */
  readonly carried: SlotView | undefined
  readonly crafting: CraftingOutcomeView
  readonly mergeTargets: MergeTargets
}

/** Never equal to any real index, for a region with no selection of its own. */
const NO_SELECTION = -1

/** The index that starts an array, or the position of a region's only slot. */
const ZERO_INDEX = 0

/**
 * The value every "mc-sim has not told us" field carries.
 *
 * These fields are typed `X | undefined` rather than optional — see the header
 * on `InventorySnapshot` for why an omitted key and a known "nothing here" must
 * stay distinguishable. So the value itself has to come from somewhere: an
 * identity function whose argument nobody supplies returns exactly what a
 * caller with nothing to report would return — nothing — without spelling the
 * sentinel `no-undefined` bans as a value.
 */
const unknownValue = <TValue,>(value?: TValue): TValue | undefined => value

/** `null` (a known-empty offhand) read back as `undefined` (an empty slot). */
const dropNull = <TValue,>(value: TValue | null): TValue | undefined => {
  if (value === null) {
    return
  }
  return value
}

/** Stack count of a slot with nothing in it. */
const EMPTY_STACK_COUNT = 0

/**
 * Mc-sim's `Slot` as this repository's per-slot snapshot.
 *
 * THE adapter, and the only place the two widenings above are applied. When
 * mc-sim grows a durability field, this function changes and nothing else does.
 * An empty mc-sim slot becomes a zero-count snapshot rather than being dropped,
 * because `slotView` already knows what to do with one and DN-UI-7c is about
 * what happens when two places decide separately what "empty" means.
 */
export const slotSnapshotOf = (slot: Slot, durability?: number): HotbarSlotSnapshot => ({
  count: slot?.count ?? EMPTY_STACK_COUNT,
  durability,
  itemId: slot?.item,
})

type ProjectRegionOptions = {
  readonly id: RegionId
  readonly columns: number
  readonly slots: ReadonlyArray<Slot>
  readonly firstIndex: number
  readonly durabilityBySlot: ReadonlyMap<number, number> | undefined
  readonly selectedIndex: number
}

const projectRegion = ({
  id,
  columns,
  slots,
  firstIndex,
  durabilityBySlot,
  selectedIndex,
}: ProjectRegionOptions): SlotRegion => ({
  columns,
  id,
  kind: 'slots',
  slots: slots.map((slot, offset) =>
    slotView(
      slotSnapshotOf(slot, durabilityBySlot?.get(firstIndex + offset)),
      offset,
      selectedIndex,
    ),
  ),
})

/**
 * Fixed-length region contents, padded and truncated.
 *
 * The same decision `hudViewModel` makes about the hotbar and for the same
 * reason: the DOM layer must never reason about a short array. Padding is
 * layout, which is mx-ui's; it invents no ITEM, only an empty square where the
 * screen has one.
 */
const fixedSlots = (
  slots: ReadonlyArray<Slot>,
  from: number,
  length: number,
): ReadonlyArray<Slot> =>
  Array.from({ length }, (_element, offset) => slots[from + offset])

const clampIndex = (value: number, high: number): number => {
  if (Number.isNaN(value)) {
    return ZERO_INDEX
  }
  return Math.min(Math.max(Math.floor(value), ZERO_INDEX), high)
}

const craftingOutcome = (crafting: CraftingSnapshot | undefined): CraftingOutcomeView => {
  if (typeof crafting?.result === 'undefined') {
    return { kind: 'unknown' }
  }
  if (crafting.result['_tag'] === 'NoMatch') {
    return { kind: 'no-match' }
  }
  return {
    kind: 'match',
    output: slotView(slotSnapshotOf(crafting.result.output), ZERO_INDEX, NO_SELECTION),
  }
}

/** How many columns a region of one bare slot (armour, offhand) draws as. */
const SINGLE_COLUMN = 1

const craftingRegion = (crafting: CraftingSnapshot | undefined): SlotRegion => {
  if (typeof crafting === 'undefined') {
    return {
      id: 'crafting-grid',
      kind: 'unknown',
      why: 'mc-sim supplied no crafting grid for this container',
    }
  }
  const columns = Math.floor(crafting.gridWidth)
  if (!Number.isFinite(columns) || columns <= ZERO_INDEX) {
    // A grid width this module cannot interpret is not a 2x2 with a typo. It
    // Is a container shape mx-ui does not know, and guessing one would draw a
    // Player's crafting square over something else entirely.
    return {
      id: 'crafting-grid',
      kind: 'unknown',
      why: `unreadable grid width ${String(crafting.gridWidth)}`,
    }
  }
  return projectRegion({
    columns,
    durabilityBySlot: unknownValue(),
    firstIndex: ZERO_INDEX,
    id: 'crafting-grid',
    selectedIndex: NO_SELECTION,
    slots: crafting.grid,
  })
}

/** How much less than the slot count the last valid index is. */
const LAST_INDEX_OFFSET = 1

const armourRegion = (armour: ReadonlyArray<Slot> | undefined): SlotRegion => {
  if (typeof armour === 'undefined') {
    return {
      id: 'armour',
      kind: 'unknown',
      why: "mc-sim's Inventory is a flat slot array with no armour rack; drawing empty squares would claim the player is wearing nothing",
    }
  }
  return projectRegion({
    columns: SINGLE_COLUMN,
    durabilityBySlot: unknownValue(),
    firstIndex: INVENTORY_SLOT_COUNT,
    id: 'armour',
    selectedIndex: NO_SELECTION,
    slots: armour,
  })
}

const offhandRegion = (offhand: Slot | null): SlotRegion => {
  if (typeof offhand === 'undefined') {
    return {
      id: 'offhand',
      kind: 'unknown',
      why: "mc-sim has no offhand slot; an empty square would claim the player's offhand is empty",
    }
  }
  return projectRegion({
    columns: SINGLE_COLUMN,
    durabilityBySlot: unknownValue(),
    firstIndex: INVENTORY_SLOT_COUNT,
    id: 'offhand',
    selectedIndex: NO_SELECTION,
    slots: [dropNull(offhand)],
  })
}

const carriedView = (carried: Slot): SlotView | undefined => {
  if (typeof carried === 'undefined') {
    return
  }
  return slotView(slotSnapshotOf(carried), ZERO_INDEX, NO_SELECTION)
}

const mergeTargetsOf = (indices: ReadonlySet<number> | undefined): MergeTargets => {
  if (typeof indices === 'undefined') {
    return { kind: 'unknown' }
  }
  return { indices, kind: 'known' }
}

/**
 * Project the inventory — and the crafting screen, which is the same screen
 * with a different grid width.
 *
 * PURE, like every other derivation here: no clock, no DOM, no service. What it
 * refuses to do is as much of the specification as what it does. It does not
 * decide whether two stacks merge, it does not match a recipe, and where it has
 * not been told it reports `unknown` instead of the most plausible answer —
 * because on this screen the plausible answer and the true one differ in
 * exactly the cases a player would notice.
 */
export const inventoryViewModel = (snapshot: InventorySnapshot): InventoryViewModel => {
  const { slots } = snapshot.inventory
  const selectedHotbarIndex = clampIndex(
    snapshot.selectedHotbarIndex,
    HOTBAR_SLOT_COUNT - LAST_INDEX_OFFSET,
  )
  const durability = snapshot.durabilityBySlot

  const regions: Array<SlotRegion> = [
    projectRegion({
      columns: HOTBAR_SLOT_COUNT,
      durabilityBySlot: durability,
      firstIndex: ZERO_INDEX,
      id: 'hotbar',
      selectedIndex: selectedHotbarIndex,
      slots: fixedSlots(slots, ZERO_INDEX, HOTBAR_SLOT_COUNT),
    }),
    projectRegion({
      columns: INVENTORY_MAIN_COLUMNS,
      durabilityBySlot: durability,
      firstIndex: HOTBAR_SLOT_COUNT,
      id: 'main',
      selectedIndex: NO_SELECTION,
      slots: fixedSlots(slots, HOTBAR_SLOT_COUNT, INVENTORY_MAIN_SLOT_COUNT),
    }),
    armourRegion(snapshot.armour),
    offhandRegion(snapshot.offhand),
    craftingRegion(snapshot.crafting),
  ]

  return {
    carried: carriedView(snapshot.carried),
    crafting: craftingOutcome(snapshot.crafting),
    mergeTargets: mergeTargetsOf(snapshot.mergeableSlotIndices),
    regions,
  }
}

/** Find a region by id, so a screen does not index into `regions` by position. */
export const regionOf = (model: InventoryViewModel, id: RegionId): SlotRegion | undefined =>
  model.regions.find((region) => region.id === id)

/**
 * An empty 36-slot inventory, for previews and tests.
 *
 * The sibling of `spawnSnapshot`, and built the same way mc-sim's
 * `emptyInventory()` builds one, so the two cannot drift about what an empty
 * inventory is.
 */
export const emptyInventorySnapshot: InventorySnapshot = {
  armour: unknownValue(),
  carried: unknownValue(),
  crafting: unknownValue(),
  durabilityBySlot: unknownValue(),
  inventory: {
    slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (): Slot => unknownValue()),
  },
  mergeableSlotIndices: unknownValue(),
  offhand: unknownValue(),
  selectedHotbarIndex: 0,
}
