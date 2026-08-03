/**
 * The inventory mirror is pinned against mc-sim's real value type.
 *
 * ---------------------------------------------------------------------------
 * What this file is defending against
 * ---------------------------------------------------------------------------
 *
 * `domain/inventory-view-model.ts` carries a local copy of mc-sim's `Inventory`,
 * `Slot` and `ItemStack`, and its header promises that deleting the copy and
 * importing `@nerima-games/mc-sim` instead will typecheck. Nothing but a test
 * can keep that promise, and this is the same promise — and the same test —
 * that `mx-gameplay/test/chunk-store-mirror.test.ts` and every
 * `test/kernel-mirror.test.ts` in the organisation already make.
 *
 * ---------------------------------------------------------------------------
 * What is DIFFERENT here, said plainly
 * ---------------------------------------------------------------------------
 *
 * mx-gameplay's mirror is of a `Context.Tag`, so its failure mode is savage: two
 * classes built from the same textual key are ONE service at runtime and two
 * unrelated types to TypeScript, and a Layer built against a narrow mirror
 * satisfies the wide tag with the missing methods reading `undefined`. That
 * file therefore asserts the tag key character for character.
 *
 * This mirror has no tag and no service. It is a VALUE type — the parameter of
 * one of this repository's own pure functions — so there is no runtime identity
 * to collide and no Layer to mis-satisfy. Two consequences:
 *
 *   1. The assertions here are the structural ones only. There is no key to
 *      pin, and pinning one would be theatre.
 *   2. Unlike `chunk-store-port`, this mirror IS re-exported from `index.ts`.
 *      `mx-gameplay` withholds its mirror because republishing another
 *      repository's SERVICE makes a promised deletion breaking for consumers.
 *      Here the mirror is the argument type of `inventoryViewModel`, which
 *      mc-compose does not call — the same position `VitalsSnapshot` has held
 *      in `api-lock.md` since the first cut — so narrowing it when mc-sim
 *      publishes is a MINOR bump under docs/versioning.md §5.
 *
 * The one thing this cannot do is import mc-sim and diff against it, because
 * mc-sim is not published. So mc-sim's shape is RESTATED below, exactly as
 * mx-gameplay restates mc-worldgen's, and the restatement is what goes stale if
 * anybody edits it carelessly. That is a weaker guarantee than an import and it
 * is the strongest one available before Step 3.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  INVENTORY_SLOT_COUNT,
  inventoryViewModel,
  slotSnapshotOf,
  type MirroredInventory,
  type MirroredItemStack,
  type MirroredSlot,
} from '../src/domain/inventory-view-model'
import { slotView, type HotbarSlotSnapshot } from '../src/domain/hud-view-model'

/**
 * mc-sim's inventory value, restated from `mc-sim/domain/inventory.ts:31-46`
 * and cross-checked against the `Inventory`, `ItemStack`, `Slot`, `ItemId` and
 * `INVENTORY_SLOT_COUNT` entries in mc-sim's own `api-lock.md`.
 *
 * `count` is `StackCount` there — a `number & Brand<'StackCount'>` from
 * mc-kernel, an integer in [0, 64]. It is restated as `number` here for the
 * same reason the mirror widens it: a second brand of one concept is worse than
 * no brand. The widening is in the SAFE direction, which the assignment in the
 * first test below is what actually proves — a branded mc-sim value flows into
 * the mirror, so step 3 of the deletion plan narrows rather than widens.
 */
type SimItemId = string
type SimItemStack = {
  readonly item: SimItemId
  readonly count: number
}
type SimSlot = SimItemStack | undefined
type SimInventory = {
  readonly slots: ReadonlyArray<SimSlot>
}

describe('the mc-sim inventory mirror', () => {
  it.effect('matches mc-sim’s value type in BOTH directions', () =>
    Effect.sync(() => {
      // The assertions ARE the assignments. A field added, removed or re-typed
      // on either side stops the build here rather than at the repoint.
      const asSim = (inventory: MirroredInventory): SimInventory => inventory
      const asMirror = (inventory: SimInventory): MirroredInventory => inventory
      const stackAsSim = (stack: MirroredItemStack): SimItemStack => stack
      const stackAsMirror = (stack: SimItemStack): MirroredItemStack => stack
      const slotAsSim = (slot: MirroredSlot): SimSlot => slot
      const slotAsMirror = (slot: SimSlot): MirroredSlot => slot

      expect([asSim, asMirror, stackAsSim, stackAsMirror, slotAsSim, slotAsMirror].every(
        (fn) => typeof fn === 'function',
      )).toBe(true)
    }),
  )

  it.effect('carries mc-sim’s slot count, so the layout split adds up', () =>
    Effect.sync(() => {
      // `mc-sim/domain/inventory.ts:34`. Nine of these are the hotbar and
      // twenty-seven the grid, which is mx-ui's split of mc-sim's number — get
      // the number wrong and the screen silently drops or invents slots.
      expect(INVENTORY_SLOT_COUNT).toBe(36)
    }),
  )

  it.effect('REGRESSION: an empty slot is `undefined` there and stays empty here', () =>
    Effect.sync(() => {
      // mc-sim's `Slot = ItemStack | undefined` — empty is the absence of a
      // stack, NOT a zero-count one. `slotSnapshotOf` is the only place that
      // conversion happens, and it lands on the representation `slotView`
      // already understands, so "empty" has one meaning in this repository.
      const snapshot = slotSnapshotOf(undefined, undefined)
      expect(snapshot).toStrictEqual({ itemId: undefined, count: 0, durability: undefined })
      expect(slotView(snapshot, 0, -1).empty).toBe(true)

      // And the reverse: mc-sim can legitimately hold a stack of one.
      expect(slotView(slotSnapshotOf({ item: 'TORCH', count: 1 }, undefined), 0, -1)).toStrictEqual({
        index: 0,
        itemId: 'TORCH',
        countLabel: undefined,
        durabilityPercent: undefined,
        selected: false,
        empty: false,
      })
    }),
  )

  it.effect('REGRESSION: durability is the ONE widening, and it has exactly one home', () =>
    Effect.sync(() => {
      // mc-sim's `ItemStack` is `{ item, count }` — no durability — and its own
      // header says so: 「PRE-AUDIT FIRST CUT. The real model needs durability,
      // enchantments, NBT-ish per-item state and armour slots」. mx-ui had a
      // `durability` field on `HotbarSlotSnapshot` before this mirror existed,
      // so the divergence is not introduced by the mirror; it is NAMED by it.
      //
      // `slotSnapshotOf` is the single place the field is attached, so when
      // mc-sim grows it, one function changes.
      const withDurability: HotbarSlotSnapshot = slotSnapshotOf(
        { item: 'IRON_SWORD', count: 1 },
        0.25,
      )
      expect(withDurability.durability).toBe(0.25)

      const withoutDurability = slotSnapshotOf({ item: 'IRON_SWORD', count: 1 }, undefined)
      expect(withoutDurability.durability).toBeUndefined()

      // A stack straight out of mc-sim, with nothing bolted on, still projects.
      const fromSim: SimSlot = { item: 'IRON_SWORD', count: 1 }
      expect(() => slotSnapshotOf(fromSim, undefined)).not.toThrow()
    }),
  )

  it.effect('a whole mc-sim inventory flows into the projection unchanged', () =>
    Effect.sync(() => {
      // The end-to-end version of the assignment test: a value shaped exactly
      // like `mc-sim/application/inventory-service.ts`'s `snapshot` Effect
      // resolves to, handed straight to the derivation.
      const fromSim: SimInventory = {
        slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index): SimSlot =>
          index === 3 ? { item: 'COBBLESTONE', count: 64 } : undefined,
        ),
      }

      const model = inventoryViewModel({
        inventory: fromSim,
        selectedHotbarIndex: 3,
        durabilityBySlot: undefined,
        carried: undefined,
        armour: undefined,
        offhand: undefined,
        crafting: undefined,
        mergeableSlotIndices: undefined,
      })

      const hotbar = model.regions.find((region) => region.id === 'hotbar')
      if (hotbar?.kind !== 'slots') {
        throw new Error('the hotbar region should be projected')
      }
      expect(hotbar.slots[3]).toStrictEqual({
        index: 3,
        itemId: 'COBBLESTONE',
        countLabel: '64',
        durabilityPercent: undefined,
        selected: true,
        empty: false,
      })
    }),
  )

  it.effect('REGRESSION: the mirror is published as a PARAMETER, not as mc-sim’s vocabulary', () =>
    Effect.gen(function* () {
      // The call that differs from `mx-gameplay/test/chunk-store-mirror.test.ts`,
      // recorded here so the difference is deliberate rather than an
      // inconsistency somebody later "fixes" in the wrong direction.
      //
      // `domain/frame-contract.ts` stays OUT of the barrel because it restates
      // the contract mc-compose consumes, so a promised deletion would be
      // breaking. This mirror is the argument of a function mc-compose does not
      // call, exactly like `VitalsSnapshot`, so it goes IN — and the two live
      // in the same barrel to make the distinction visible.
      const barrel = yield* Effect.promise(() => import('../src/index'))

      expect(Object.keys(barrel)).toContain('inventoryViewModel')
      expect(Object.keys(barrel)).toContain('INVENTORY_SLOT_COUNT')
      expect(Object.keys(barrel)).toContain('slotSnapshotOf')

      // kernel's vocabulary is still withheld, which is the contrast that gives
      // the rule its shape.
      expect(Object.keys(barrel)).not.toContain('StageId')
      expect(Object.keys(barrel)).not.toContain('DeltaTimeSecs')

      // And mc-sim's SERVICE is not mirrored at all. mx-ui reads a value; it
      // does not stand up an `InventoryService`, and a Tag here would be the
      // runtime hazard mx-gameplay's mirror test exists to prevent.
      expect(Object.keys(barrel)).not.toContain('InventoryService')
      expect(Object.keys(barrel)).not.toContain('InventoryServiceApi')
    }),
  )
})
