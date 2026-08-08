/**
 * The HUD view model: a pure function from a state snapshot to what the screen
 * should show.
 *
 * ---------------------------------------------------------------------------
 * Why this is a pure derivation and not a renderer
 * ---------------------------------------------------------------------------
 *
 * mx-ui is a verb (plan.md §2.3-1): it owns "how the game is presented" and owns
 * no game state. Health, hunger, XP and the hotbar all live in mc-sim. What this
 * repository owns is the answer to "nineteen health points — how many hearts is
 * that, and which of them is half?", and that answer is a pure function.
 *
 * Keeping it pure buys three things:
 *
 *   1. It is testable with no DOM at all, which is why this repository's suite
 *      runs under vitest's `environment: 'node'` and takes milliseconds.
 *   2. The per-screen previews (plan.md §3.13: 「状態モック付きプレビュー」) can
 *      feed it a literal instead of booting a game.
 *   3. The DOM layer becomes a dumb projection of this type, so a rendering bug
 *      and a derivation bug are never the same bug.
 *
 * There is no `document` reference anywhere in this file and there must not be
 * one. When the DOM layer arrives it goes in a sibling module that imports this
 * one, never the other way round.
 */

/** Two health points per heart, as in vanilla. */
export const HEALTH_POINTS_PER_HEART = 2
export const DEFAULT_MAX_HEALTH_POINTS = 20
export const DEFAULT_MAX_HUNGER_POINTS = 20
/** Hotbar slots. Nine, and it has been nine since 2009. */
export const HOTBAR_SLOT_COUNT = 9

const ZERO = 0
const ONE = 1
const FULL_PERCENT = 100

export type IconState = 'full' | 'half' | 'empty'

export type HotbarSlotSnapshot = {
  readonly itemId: string | undefined
  readonly count: number
  /** 0–1, or `undefined` for an item with no durability. */
  readonly durability: number | undefined
}

export type VitalsSnapshot = {
  readonly healthPoints: number
  readonly maxHealthPoints: number
  readonly hungerPoints: number
  readonly maxHungerPoints: number
  readonly experienceLevel: number
  /** 0–1 towards the next level. */
  readonly experienceProgress: number
  readonly hotbar: ReadonlyArray<HotbarSlotSnapshot>
  readonly selectedHotbarIndex: number
}

/**
 * One projected slot — hotbar, inventory grid, armour, offhand or crafting.
 *
 * Named for the SLOT and not for the hotbar because `domain/inventory-view-model.ts`
 * projects its grids through the very same function (`slotView` below). There is
 * one answer in this repository to "what does the screen show for a slot", and
 * DN-UI-7c is the record of what a second one costs: the `empty` guard cleared
 * two of three fields, the DOM layer drew a durability bar under an empty slot,
 * and the bug was reachable in ordinary play the moment a tool broke. An
 * inventory screen with its own copy of that projection would have reproduced
 * it exactly once more.
 */
export type SlotView = {
  readonly index: number
  readonly itemId: string | undefined
  /** Vanilla hides the count for a single item; so do we. */
  readonly countLabel: string | undefined
  readonly durabilityPercent: number | undefined
  readonly selected: boolean
  readonly empty: boolean
}

export type HudViewModel = {
  readonly hearts: ReadonlyArray<IconState>
  readonly shanks: ReadonlyArray<IconState>
  readonly experienceLevelLabel: string
  readonly experiencePercent: number
  readonly hotbar: ReadonlyArray<SlotView>
  readonly dead: boolean
}

/**
 * Clamp — and the reason it is not `Math.min(Math.max(...))`.
 *
 * `Math.min` and `Math.max` PASS NaN THROUGH: every comparison against NaN is
 * false, so `Math.min(Math.max(NaN, 0), 20)` is NaN, not 0. That defeats the
 * whole point of clamping here. The reason this module clamps rather than
 * rejects is that `VitalsSnapshot` arrives from mc-sim across a pinned version
 * boundary (versioning.md §3), and NaN is exactly the class of value that
 * crosses such a boundary — a divide by a zero max, a field that changed
 * meaning, a save file read with the wrong shape. A clamp that stops 9 and -1
 * and not NaN stops the easy half.
 *
 * NaN becomes `low`, for the same reason DN-UI-6 refuses to round a half heart
 * up: `low` is the only replacement inside `[low, high]` that does not INVENT
 * health, hunger or progress the snapshot never claimed. The alternative —
 * NaN to `high` — would show a full heart row for a player who may be dead,
 * which is the lie DN-UI-6 exists to forbid.
 *
 * This must not become a throw. A HUD that is briefly wrong is survivable; a
 * HUD that kills the frame is not.
 */
const clamp = (value: number, low: number, high: number): number => {
  if (Number.isNaN(value)) {
    return low
  }
  return Math.min(Math.max(value, low), high)
}

/**
 * The maximum, made into something a row can actually be built from.
 *
 * Non-finite is the case that matters: `Math.ceil(Infinity / 2)` is `Infinity`
 * and `Array.from({ length: Infinity })` THROWS `RangeError: Invalid array
 * length`, which is the one outcome this module is not allowed to have.
 */
const safeMaxPoints = (maxPoints: number): number => {
  if (Number.isFinite(maxPoints)) {
    return Math.max(ZERO, Math.floor(maxPoints))
  }
  return ZERO
}

/**
 * THE point total, computed once.
 *
 * `iconRow` and `hudViewModel`'s `dead` flag both read this, which is what
 * stops them disagreeing about the same snapshot. When `dead` was a separate
 * expression (`Math.floor(healthPoints) <= 0`), a NaN gave an all-empty heart
 * row saying "no health" and `dead: false` saying "alive" — two answers to one
 * question, and a death screen that never appears for a player whose hearts
 * are gone.
 */
const safePoints = (points: number, maxPoints: number): number =>
  clamp(Math.floor(points), ZERO, safeMaxPoints(maxPoints))

/**
 * A count or a level, made printable.
 *
 * `String(Math.max(0, Math.floor(NaN)))` is the string `"NaN"`, which the DOM
 * layer would faithfully draw on top of a hotbar slot.
 */
const safeWholeNumber = (value: number): number =>
  clamp(Math.floor(value), ZERO, Number.MAX_SAFE_INTEGER)

/**
 * A number somebody handed us, made into a hotbar slot.
 *
 * Exported because there are now TWO questions of this shape and they must have
 * one answer. mc-sim's `selectedHotbarIndex` says which slot the player is
 * holding; whoever owns input says which slot the keyboard is on
 * (`HudView.setKeyboardFocus`). Both are indices from across a boundary, both can
 * arrive as `9`, `-1` or `NaN`, and both must land on a real slot rather than on
 * none — a HUD that loses its selection and a focus ring that vanishes are the
 * same bug twice.
 *
 * DN-UI-7c is the record of what a second copy costs, and DN-UI-4 states the
 * general rule: 「2 回導出される決定は、いずれ違うように導出される」.
 */
export const hotbarSlotIndex = (value: number): number =>
  clamp(Math.floor(value), ZERO, HOTBAR_SLOT_COUNT - ONE)

/**
 * Split a point total into full / half / empty icons.
 *
 * Half icons are the whole reason this is a function rather than a division. The
 * rule is: an icon is full at 2 points, half at exactly 1, empty at 0 — so 19
 * health is nine full hearts and one half, and 1 health is a single half heart
 * rather than a rounded-away nothing. A player on half a heart needs to see half
 * a heart.
 *
 * A non-integer, out-of-range or NaN total is clamped rather than rejected: a
 * HUD that throws is worse than a HUD that is briefly wrong, and the snapshot
 * comes from another repository across a version boundary.
 */
export const iconRow = (points: number, maxPoints: number): ReadonlyArray<IconState> => {
  const iconCount = Math.ceil(safeMaxPoints(maxPoints) / HEALTH_POINTS_PER_HEART)
  const total = safePoints(points, maxPoints)

  return Array.from({ length: iconCount }, (_element, index): IconState => {
    const remaining = total - index * HEALTH_POINTS_PER_HEART
    if (remaining >= HEALTH_POINTS_PER_HEART) {
      return 'full'
    }
    if (remaining === ONE) {
      return 'half'
    }
    return 'empty'
  })
}

/**
 * THE per-slot projection, exported because a second screen needs it.
 *
 * `domain/inventory-view-model.ts` calls this for every region it draws, so a
 * hotbar slot and an inventory slot cannot disagree about what "empty" means or
 * about when a count is worth printing. `selectedIndex` is passed rather than
 * derived so that a region with no selection can simply pass one that never
 * matches — the inventory grid has no cursor of its own, the hotbar does, and
 * the difference is the caller's to state rather than this function's to guess.
 */
const slotItemId = (slot: HotbarSlotSnapshot | undefined, empty: boolean): string | undefined => {
  if (empty) {
    return
  }
  return slot?.itemId
}

const slotCountLabel = (count: number, empty: boolean): string | undefined => {
  if (empty || count <= ONE) {
    return
  }
  return String(count)
}

const slotDurabilityPercent = (slot: HotbarSlotSnapshot | undefined, empty: boolean): number | undefined => {
  if (empty || typeof slot?.durability === 'undefined') {
    return
  }
  return Math.round(clamp(slot.durability, ZERO, ONE) * FULL_PERCENT)
}

export const slotView = (
  slot: HotbarSlotSnapshot | undefined,
  index: number,
  selectedIndex: number,
): SlotView => {
  const count = safeWholeNumber(slot?.count ?? ZERO)
  const empty = typeof slot?.itemId === 'undefined' || count === ZERO

  return {
    // Vanilla shows no number on a stack of one; showing "1" makes a full
    // Hotbar look like a spreadsheet.
    countLabel: slotCountLabel(count, empty),
    // EVERY field an empty slot has must be absent, not just the two that are
    // Obviously about an item. A DOM layer draws the durability bar when the
    // Field is present — that is the obvious way to write it — so a slot that
    // Is empty and still reports 50% draws a bar under nothing. This is
    // Reachable in play: a tool that breaks leaves count 0 behind with its
    // Durability still attached.
    durabilityPercent: slotDurabilityPercent(slot, empty),
    empty,
    index,
    itemId: slotItemId(slot, empty),
    selected: index === selectedIndex,
  }
}

/**
 * Derive everything the HUD draws from one snapshot.
 *
 * `selectedHotbarIndex` is CLAMPED rather than trusted. A scroll wheel that
 * wraps past the end, a save file from an older version, a QA API call — all of
 * them can deliver 9, -1 or NaN, and none of them should make the HUD
 * disappear. The reference learned this the hard way with an off-by-one in
 * hotbar cycling. NaN gets the same answer as -1 and for the same reason: some
 * slot must be highlighted, and slot 0 is the one the player starts on.
 *
 * `dead` reads the same clamped health the heart row does, so the row and the
 * flag cannot answer the same question differently.
 *
 * The hotbar is always exactly `HOTBAR_SLOT_COUNT` long in the output, however
 * long the input was, so the DOM layer never has to reason about a short array.
 */
export const hudViewModel = (snapshot: VitalsSnapshot): HudViewModel => {
  const selectedIndex = hotbarSlotIndex(snapshot.selectedHotbarIndex)
  const healthPoints = safePoints(snapshot.healthPoints, snapshot.maxHealthPoints)

  return {
    dead: healthPoints <= ZERO,
    experienceLevelLabel: String(safeWholeNumber(snapshot.experienceLevel)),
    // FLOOR, not round. `Math.round(0.999 * 100)` is 100, so the bar reads full
    // While the level label beside it still says 7 — a contradiction the player
    // Can see, and which reads as a HUD frozen at the top of every level. Floor
    // Never claims a threshold that has not been crossed; the cost is that a
    // Genuine 1.0 is the only input that reaches 100, which is exactly right.
    // (`durabilityPercent` still rounds: 100% there is not a claim about an
    // Event, and no counter sits beside it to contradict.)
    experiencePercent: Math.floor(clamp(snapshot.experienceProgress, ZERO, ONE) * FULL_PERCENT),
    hearts: iconRow(snapshot.healthPoints, snapshot.maxHealthPoints),
    hotbar: Array.from({ length: HOTBAR_SLOT_COUNT }, (_element, index) =>
      slotView(snapshot.hotbar[index], index, selectedIndex),
    ),
    shanks: iconRow(snapshot.hungerPoints, snapshot.maxHungerPoints),
  }
}

/** A snapshot of a freshly spawned player, for previews and tests. */
export const spawnSnapshot: VitalsSnapshot = {
  experienceLevel: 0,
  experienceProgress: 0,
  healthPoints: DEFAULT_MAX_HEALTH_POINTS,
  hotbar: [],
  hungerPoints: DEFAULT_MAX_HUNGER_POINTS,
  maxHealthPoints: DEFAULT_MAX_HEALTH_POINTS,
  maxHungerPoints: DEFAULT_MAX_HUNGER_POINTS,
  selectedHotbarIndex: 0,
}
