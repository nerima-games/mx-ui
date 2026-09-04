# @nerima-games/mx-ui

## 0.5.4

### Patch Changes

- [#25](https://github.com/nerima-games/mx-ui/pull/25) [`8828bae`](https://github.com/nerima-games/mx-ui/commit/8828baefcccc882f3408258da78dc34bb36bdf50) Thanks [@takeokunn](https://github.com/takeokunn)! - Strengthen test coverage found by hand mutation testing across
  `domain/inventory-view-model.ts`, `application/inventory-navigation.ts`,
  `domain/palette-math.ts`, `domain/session-navigation.ts`, and
  `domain/caption.ts`; no source behaviour changed, only what the suite would
  notice if it did.
  
  - `moveInventoryTarget`'s up-move row boundary (`index === columns` exactly,
    the first column of a non-first row) had no test distinguishing it from a
    middle column, so an off-by-one there would silently jump to the region
    above instead of moving up in place.
  - `clampIndex`'s `Math.floor` on `selectedHotbarIndex` was unverified: a
    fractional index (a value no live caller should produce, but nothing
    enforced it) would leave every hotbar slot reading unselected rather than
    rounding down to a real one.
  - `slotSnapshotOf`'s `count` fallback for an absent slot was only exercised
    indirectly through `slotView`'s own independent fallback; a direct caller
    of this exported function (its declared type is `number`, never
    `undefined`) had no test confirming the promise holds without that second
    line of defence.
  - `simulateColorVision`'s per-channel rounding had no test that could tell a
    rounded result from an unrounded one — every existing case fed a colour
    whose simulation matrix row sums to 1 exactly, so the fractional
    intermediate the rounding exists for was never produced.
  - `createUniqueSessionId`'s collision-retry cap was verified to give up
    eventually, but not verified to give up after exactly the documented
    number of attempts rather than one more.
  - `applyCaptionSettings`'s identity-preserving return for an already-empty
    queue was only tested against the `emptyCaptionQueue` singleton itself,
    which the buggy code path also happens to return — so a structurally-equal
    but distinct empty queue object could have its identity silently replaced
    without the existing test noticing.

## 0.5.3

### Patch Changes

- [#22](https://github.com/nerima-games/mx-ui/pull/22) [`0f90742`](https://github.com/nerima-games/mx-ui/commit/0f90742d39306a2c307e17ff205450849ecea023) Thanks [@takeokunn](https://github.com/takeokunn)! - Record the styling/asset shipping decision in `docs/versioning.md` §4: mx-ui ships no external
  stylesheet, font, or image asset — palette colours and layout are custom properties and inline
  styles written by the JS the package already exports (`declarePalette`, `application/*.ts`), icons
  are Unicode glyphs, and the DN-UI-1a colour-vision filter ships as plain matrix values while its
  `<defs>` block and CSS scoping stay the host's asset, matching the reference split. `files` and
  `exports` need no addition; the previous "undecided" note predated the implementation that settled
  it. No source or public API changed.

## 0.5.2

### Patch Changes

- [#20](https://github.com/nerima-games/mx-ui/pull/20) [`383b5ca`](https://github.com/nerima-games/mx-ui/commit/383b5caa42859c1daeb737404f99dd136b85e84e) Thanks [@takeokunn](https://github.com/takeokunn)! - Align internal pins to the current published versions
  
  - `@nerima-games/mc-audio` to 0.2.8
  - `@nerima-games/mc-sim` to 0.4.2
  Each of these upstream releases contained a pin change and no source change,
  so no behaviour moves with this bump.

## 0.5.1

### Patch Changes

- [#18](https://github.com/nerima-games/mx-ui/pull/18) [`50fb434`](https://github.com/nerima-games/mx-ui/commit/50fb4341d3e17282783682a13127cef8330147cc) Thanks [@takeokunn](https://github.com/takeokunn)! - Pin @nerima-games/mc-kernel to 0.7.0 and @nerima-games/mc-sim to 0.4.1 (org toolchain pin set). No source changes were required: this repository's entire mc-kernel/mc-sim surface (`StageId`, `DeltaTimeSecs`, `GameModule`, `StageRegistration`, `FrameServices`-adjacent clock exports, and mc-sim's `Inventory`/`Slot`/`ItemStack`/`itemStack`/`INVENTORY_SLOT_COUNT`) is unchanged in shape across the jump, and every item id this repository names (`stone`, `stick`, `torch`, `coal`, `diamond`, `diamond_pickaxe`, `iron_helmet`, `iron_boots`, `shield`, `oak_planks`, `cobblestone`, `bread`) still resolves against kernel's current `ItemType` roster.

## 0.5.0

### Minor Changes

- [#16](https://github.com/nerima-games/mx-ui/pull/16) [`04a7d07`](https://github.com/nerima-games/mx-ui/commit/04a7d0776cb9c6ebd829e5a279e233b08e1af243) Thanks [@takeokunn](https://github.com/takeokunn)! - Add a listener-free settings screen projection (`createSettingsView`, `settingsViewModel`) lowered from mc-compose's `apps/web/settings-view.ts`, and the main menu's session-link builders (`sessionHref`, `createSessionHref`, `createUniqueSessionId`) lowered from `apps/web/session-navigation.ts`. The settings value rules and the Title⇄InGame session-lifecycle decision stay outside this repository — see the new modules' headers.

## 0.4.0

### Minor Changes

- [#14](https://github.com/nerima-games/mx-ui/pull/14) [`ba5d94d`](https://github.com/nerima-games/mx-ui/commit/ba5d94d8147e94536607d1b2b3351638ac296aa4) Thanks [@takeokunn](https://github.com/takeokunn)! - Repoint the frame-contract mirror to @nerima-games/mc-kernel 0.5.1 and adopt mc-sim 0.2.1 real inventory types (branded StackCount, closed ItemType vocabulary); the local Inventory/Slot/ItemStack copies and the inventory mirror test are gone.

### Patch Changes

- [#13](https://github.com/nerima-games/mx-ui/pull/13) [`b08dd11`](https://github.com/nerima-games/mx-ui/commit/b08dd111faff99a82b555f18f6557924c33b23ff) Thanks [@takeokunn](https://github.com/takeokunn)! - Complete the org toolchain devDependency pin set: knip 6.33.0 (its verify gate arrives in Wave 3; the pin belongs to the Wave 0 table) plus @effect/vitest 0.30.0 where it was missing.

## 0.3.9

### Patch Changes

- [#11](https://github.com/nerima-games/mx-ui/pull/11) [`e2c5b18`](https://github.com/nerima-games/mx-ui/commit/e2c5b18c7c911899b7fc0d8dbb968c25fb0b24f0) Thanks [@takeokunn](https://github.com/takeokunn)! - Toolchain frozen to org pin set (TypeScript 7.0.2, vitest 4.1.11, effect 3.22.1, node 24, pnpm 11.24.0); build switched to tsc emit; release workflow added
