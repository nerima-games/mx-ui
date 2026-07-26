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

export type HotbarSlotView = {
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
  readonly hotbar: ReadonlyArray<HotbarSlotView>
  readonly dead: boolean
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

/**
 * Split a point total into full / half / empty icons.
 *
 * Half icons are the whole reason this is a function rather than a division. The
 * rule is: an icon is full at 2 points, half at exactly 1, empty at 0 — so 19
 * health is nine full hearts and one half, and 1 health is a single half heart
 * rather than a rounded-away nothing. A player on half a heart needs to see half
 * a heart.
 *
 * A non-integer or out-of-range total is clamped rather than rejected: a HUD
 * that throws is worse than a HUD that is briefly wrong, and the snapshot comes
 * from another repository across a version boundary.
 */
export const iconRow = (points: number, maxPoints: number): ReadonlyArray<IconState> => {
  const safeMax = Math.max(0, Math.floor(maxPoints))
  const iconCount = Math.ceil(safeMax / HEALTH_POINTS_PER_HEART)
  const safePoints = clamp(Math.floor(points), 0, safeMax)

  return Array.from({ length: iconCount }, (_, index): IconState => {
    const remaining = safePoints - index * HEALTH_POINTS_PER_HEART
    if (remaining >= HEALTH_POINTS_PER_HEART) {
      return 'full'
    }
    return remaining === 1 ? 'half' : 'empty'
  })
}

const hotbarSlotView = (
  slot: HotbarSlotSnapshot | undefined,
  index: number,
  selectedIndex: number,
): HotbarSlotView => {
  const count = Math.max(0, Math.floor(slot?.count ?? 0))
  const empty = slot?.itemId === undefined || count === 0

  return {
    index,
    itemId: empty ? undefined : slot?.itemId,
    // Vanilla shows no number on a stack of one; showing "1" makes a full
    // hotbar look like a spreadsheet.
    countLabel: empty || count <= 1 ? undefined : String(count),
    durabilityPercent:
      slot?.durability === undefined ? undefined : Math.round(clamp(slot.durability, 0, 1) * 100),
    selected: index === selectedIndex,
    empty,
  }
}

/**
 * Derive everything the HUD draws from one snapshot.
 *
 * `selectedHotbarIndex` is CLAMPED rather than trusted. A scroll wheel that
 * wraps past the end, a save file from an older version, a QA API call — all of
 * them can deliver 9 or -1, and none of them should make the HUD disappear. The
 * reference learned this the hard way with an off-by-one in hotbar cycling.
 *
 * The hotbar is always exactly `HOTBAR_SLOT_COUNT` long in the output, however
 * long the input was, so the DOM layer never has to reason about a short array.
 */
export const hudViewModel = (snapshot: VitalsSnapshot): HudViewModel => {
  const selectedIndex = clamp(Math.floor(snapshot.selectedHotbarIndex), 0, HOTBAR_SLOT_COUNT - 1)

  return {
    hearts: iconRow(snapshot.healthPoints, snapshot.maxHealthPoints),
    shanks: iconRow(snapshot.hungerPoints, snapshot.maxHungerPoints),
    experienceLevelLabel: String(Math.max(0, Math.floor(snapshot.experienceLevel))),
    experiencePercent: Math.round(clamp(snapshot.experienceProgress, 0, 1) * 100),
    hotbar: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) =>
      hotbarSlotView(snapshot.hotbar[index], index, selectedIndex),
    ),
    dead: Math.floor(snapshot.healthPoints) <= 0,
  }
}

/** A snapshot of a freshly spawned player, for previews and tests. */
export const spawnSnapshot: VitalsSnapshot = {
  healthPoints: DEFAULT_MAX_HEALTH_POINTS,
  maxHealthPoints: DEFAULT_MAX_HEALTH_POINTS,
  hungerPoints: DEFAULT_MAX_HUNGER_POINTS,
  maxHungerPoints: DEFAULT_MAX_HUNGER_POINTS,
  experienceLevel: 0,
  experienceProgress: 0,
  hotbar: [],
  selectedHotbarIndex: 0,
}
