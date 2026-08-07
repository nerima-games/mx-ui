/**
 * The inventory and crafting screens: a pure function from state to layout.
 *
 * ---------------------------------------------------------------------------
 * Why this exists now, when it was deferred before
 * ---------------------------------------------------------------------------
 *
 * `pnpm preview --stats` carried this as G2 for a while, with a real argument
 * behind it: mc-sim owns the inventory STATE (plan.md §2.3-1) and has not
 * published its shape, so a derivation written now would invent the snapshot
 * type it reads and `api-lock.md` would publish the invention as this package's
 * surface.
 *
 * The argument is sound and it is not unique to this case — which is what
 * settles it. It is the argument for every mirror in the organisation:
 *
 *   - mc-kernel's frame contract is now imported from its published package;
 *     this repository no longer maintains a local frame mirror.
 *   - `mx-gameplay/domain/chunk-store-port.ts` restates mc-worldgen's entire
 *     `ChunkStore` for the same reason, with `test/chunk-store-mirror.test.ts`
 *     pinning the shape and the tag key.
 *   - `mc-render/domain/camera-mirror.ts` and every `domain/kernel-vocabulary.ts`
 *     are the same move again.
 *   - And `VitalsSnapshot`, forty lines away in `domain/hud-view-model.ts`, is
 *     already exactly this: mc-sim's player state, mirrored, exported through
 *     the barrel, and recorded in `api-lock.md` since the first cut. The
 *     deferral argument, applied consistently, would have forbidden
 *     `hudViewModel` too.
 *
 * The premise was also wrong on the facts in the way that matters. mc-sim's
 * shape is not UNKNOWN, it is UNPUBLISHED: `mc-sim/domain/inventory.ts` defines
 * `Inventory`, `Slot`, `ItemStack`, `ItemId` and `INVENTORY_SLOT_COUNT`, and
 * mc-sim's own `api-lock.md` has all five under `## Exported`. "Nothing is on
 * GitHub Packages yet" is the whole of the obstacle, and it is the obstacle the
 * mirror pattern was invented for.
 *
 * What the deferral got RIGHT is preserved: nothing below is a guess dressed as
 * a fact. The mirror is marked provisional, carries its replacement instructions,
 * and is pinned by `test/inventory-mirror.test.ts`. Where mc-sim genuinely has
 * not answered for a particular frame, this module projects `unknown` rather
 * than inventing an answer. See `CraftingOutcomeView`.
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
 */
import {
  slotView,
  type HotbarSlotSnapshot,
  type SlotView,
  HOTBAR_SLOT_COUNT,
} from './hud-view-model'

// ---------------------------------------------------------------------------
// PROVISIONAL LOCAL MIRROR OF `@nerima-games/mc-sim`'s inventory value
// ---------------------------------------------------------------------------

/*
 * This section is scheduled for deletion. Do not build on it.
 *
 * mc-sim is a legitimate `dependencies` edge for this repository (plan.md
 * §3.13: mx-ui's parents are sim and audio), so this mirror stands in for the
 * still-unpublished mc-sim import rather than a forbidden one. mc-kernel is
 * already a declared dependency and owns the frame vocabulary directly, while
 * `pnpm check:deps` continues to reject imports absent from dependencies.
 *
 * WHEN mc-sim IS PUBLISHED:
 *   1. add `@nerima-games/mc-sim` to `package.json#dependencies`;
 *   2. delete this section;
 *   3. `import type { Inventory, ItemStack, Slot, ItemId } from '@nerima-games/mc-sim'`
 *      and delete the re-declarations, keeping `slotSnapshotOf` as the adapter.
 *
 * The names and shapes below are transcribed from `mc-sim/domain/inventory.ts`
 * and cross-checked against mc-sim's own `api-lock.md`, so the repoint in step 3
 * is an import statement and nothing else. `test/inventory-mirror.test.ts`
 * asserts that in both directions, which is the only thing that can keep the
 * promise honest.
 *
 * TWO DELIBERATE WIDENINGS, recorded here rather than left to be discovered:
 *
 *   1. `count` is a plain `number`. mc-sim's is `StackCount`, a branded integer
 *      in [0, 64] owned by mc-kernel. Branding it here would mint a SECOND
 *      brand of the same name for the same concept, and a downstream reader
 *      would end up converting between two brands of one number — the failure
 *      the kernel contract refuses for `ClockPort` and for the same reason. A
 *      branded value from kernel is assignable to this alias, which
 *      is the direction a consumer needs, so step 3 narrows rather than widens.
 *
 *   2. `durability` does not exist in mc-sim at all. Its `ItemStack` is
 *      `{ item, count }`, and its own header says so: 「PRE-AUDIT FIRST CUT.
 *      The real model needs durability, enchantments, NBT-ish per-item state and
 *      armour slots」. mx-ui already had a `durability` field on
 *      `HotbarSlotSnapshot` before this file existed, so the divergence is not
 *      introduced here — it is *named* here, and `slotSnapshotOf` is the single
 *      place that has to change when mc-sim grows the field.
 */

/** Mirrors mc-sim's `ItemId`. A bare string there too, and provisional there too. */
export type MirroredItemId = string

/** Mirrors mc-sim's `ItemStack`. See widening 1 on `count`. */
export type MirroredItemStack = {
  readonly item: MirroredItemId
  readonly count: number
}

/** Mirrors mc-sim's `Slot`: empty is `undefined`, not a zero-count stack. */
export type MirroredSlot = MirroredItemStack | undefined

/** Mirrors mc-sim's `Inventory`. */
export type MirroredInventory = {
  readonly slots: ReadonlyArray<MirroredSlot>
}

/** Mirrors mc-sim's `INVENTORY_SLOT_COUNT` (`mc-sim/domain/inventory.ts:34`). */
export const INVENTORY_SLOT_COUNT = 36

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
export const INVENTORY_MAIN_SLOT_COUNT = INVENTORY_MAIN_COLUMNS * INVENTORY_MAIN_ROWS

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
  readonly grid: ReadonlyArray<MirroredSlot>
  /**
   * mc-sim's answer to "does this grid make anything".
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
  | { readonly _tag: 'Match'; readonly output: MirroredItemStack }
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
  readonly inventory: MirroredInventory
  /** Which hotbar slot the player is holding. Clamped, never trusted (DN-UI-7). */
  readonly selectedHotbarIndex: number
  /**
   * Per-slot durability in 0–1, by slot index. `undefined` for the whole map
   * means mc-sim does not carry durability yet — see widening 2 above.
   */
  readonly durabilityBySlot: ReadonlyMap<number, number> | undefined
  /** The stack on the cursor, if the player is dragging one. */
  readonly carried: MirroredSlot
  /** `undefined` — mc-sim has no armour slots. Projected as unknown, not as empty. */
  readonly armour: ReadonlyArray<MirroredSlot> | undefined
  /** `undefined` is unknown, `null` is a known-empty offhand, and a stack is occupied. */
  readonly offhand: MirroredSlot | null
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
  /** mc-sim has not answered. NOT the same screen as `no-match`. */
  | { readonly kind: 'unknown' }

export type MergeTargets =
  | { readonly kind: 'known'; readonly indices: ReadonlySet<number> }
  /** mc-sim has not answered. The screen must highlight nothing rather than guess. */
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

/**
 * mc-sim's `Slot` as this repository's per-slot snapshot.
 *
 * THE adapter, and the only place the two widenings above are applied. When
 * mc-sim grows a durability field, this function changes and nothing else does.
 * An empty mc-sim slot becomes a zero-count snapshot rather than being dropped,
 * because `slotView` already knows what to do with one and DN-UI-7c is about
 * what happens when two places decide separately what "empty" means.
 */
export const slotSnapshotOf = (
  slot: MirroredSlot,
  durability: number | undefined,
): HotbarSlotSnapshot => ({
  itemId: slot?.item,
  count: slot?.count ?? 0,
  durability,
})

const projectRegion = (
  id: RegionId,
  columns: number,
  slots: ReadonlyArray<MirroredSlot>,
  firstIndex: number,
  durabilityBySlot: ReadonlyMap<number, number> | undefined,
  selectedIndex: number,
): SlotRegion => ({
  kind: 'slots',
  id,
  columns,
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
  slots: ReadonlyArray<MirroredSlot>,
  from: number,
  length: number,
): ReadonlyArray<MirroredSlot> => Array.from({ length }, (_, offset) => slots[from + offset])

const clampIndex = (value: number, high: number): number =>
  Number.isNaN(value) ? 0 : Math.min(Math.max(Math.floor(value), 0), high)

const craftingOutcome = (crafting: CraftingSnapshot | undefined): CraftingOutcomeView => {
  if (crafting?.result === undefined) {
    return { kind: 'unknown' }
  }
  if (crafting.result._tag === 'NoMatch') {
    return { kind: 'no-match' }
  }
  return {
    kind: 'match',
    output: slotView(slotSnapshotOf(crafting.result.output, undefined), 0, NO_SELECTION),
  }
}

const craftingRegion = (crafting: CraftingSnapshot | undefined): SlotRegion => {
  if (crafting === undefined) {
    return {
      kind: 'unknown',
      id: 'crafting-grid',
      why: 'mc-sim supplied no crafting grid for this container',
    }
  }
  const columns = Math.floor(crafting.gridWidth)
  if (!Number.isFinite(columns) || columns <= 0) {
    // A grid width this module cannot interpret is not a 2x2 with a typo. It
    // is a container shape mx-ui does not know, and guessing one would draw a
    // player's crafting square over something else entirely.
    return {
      kind: 'unknown',
      id: 'crafting-grid',
      why: `unreadable grid width ${String(crafting.gridWidth)}`,
    }
  }
  return projectRegion('crafting-grid', columns, crafting.grid, 0, undefined, NO_SELECTION)
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
  const slots = snapshot.inventory.slots
  const selectedHotbarIndex = clampIndex(snapshot.selectedHotbarIndex, HOTBAR_SLOT_COUNT - 1)
  const durability = snapshot.durabilityBySlot

  const regions: Array<SlotRegion> = [
    projectRegion(
      'hotbar',
      HOTBAR_SLOT_COUNT,
      fixedSlots(slots, 0, HOTBAR_SLOT_COUNT),
      0,
      durability,
      selectedHotbarIndex,
    ),
    projectRegion(
      'main',
      INVENTORY_MAIN_COLUMNS,
      fixedSlots(slots, HOTBAR_SLOT_COUNT, INVENTORY_MAIN_SLOT_COUNT),
      HOTBAR_SLOT_COUNT,
      durability,
      NO_SELECTION,
    ),
    snapshot.armour === undefined
      ? {
          kind: 'unknown',
          id: 'armour',
          why: "mc-sim's Inventory is a flat slot array with no armour rack; drawing empty squares would claim the player is wearing nothing",
        }
      : projectRegion('armour', 1, snapshot.armour, INVENTORY_SLOT_COUNT, undefined, NO_SELECTION),
    snapshot.offhand === undefined
      ? {
          kind: 'unknown',
          id: 'offhand',
          why: "mc-sim has no offhand slot; an empty square would claim the player's offhand is empty",
        }
      : projectRegion(
          'offhand',
          1,
          [snapshot.offhand ?? undefined],
          INVENTORY_SLOT_COUNT,
          undefined,
          NO_SELECTION,
        ),
    craftingRegion(snapshot.crafting),
  ]

  return {
    regions,
    carried:
      snapshot.carried === undefined
        ? undefined
        : slotView(slotSnapshotOf(snapshot.carried, undefined), 0, NO_SELECTION),
    crafting: craftingOutcome(snapshot.crafting),
    mergeTargets:
      snapshot.mergeableSlotIndices === undefined
        ? { kind: 'unknown' }
        : { kind: 'known', indices: snapshot.mergeableSlotIndices },
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
  inventory: { slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (): MirroredSlot => undefined) },
  selectedHotbarIndex: 0,
  durabilityBySlot: undefined,
  carried: undefined,
  armour: undefined,
  offhand: undefined,
  crafting: undefined,
  mergeableSlotIndices: undefined,
}
