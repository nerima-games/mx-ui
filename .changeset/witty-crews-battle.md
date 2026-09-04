---
"@nerima-games/mx-ui": patch
---

Strengthen test coverage found by hand mutation testing across
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
