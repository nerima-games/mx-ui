/**
 * Accessibility settings — the assets plan.md §3.13 asks to be carried over.
 *
 * 「アクセシビリティ資産を引き継ぐ: 色覚モード(feColorMatrix ダルトナイゼーション、
 * canvasのみに適用)、reduced-motion、キーリマッピングUI、サウンド字幕」
 *
 * Captions live in `domain/caption.ts`; the other three are here. All four were
 * built and shipped in the reference implementation, and the point of listing
 * them in the plan is that they are cheap to keep and expensive to retrofit —
 * reduced-motion in particular has to be threaded through every animation the
 * moment the first animation is written.
 *
 * This module is pure. Nothing here touches `document`; the accessors below
 * return the ATTRIBUTE VALUES and DURATIONS a DOM layer should apply, which is
 * what keeps them testable under `environment: 'node'`.
 */

// ---------------------------------------------------------------------------
// Colour vision
// ---------------------------------------------------------------------------

/**
 * Daltonisation modes.
 *
 * Identical to the reference's `ColorVisionMode`
 * (`packages/game/application/settings.schema.ts:10-11`), which is a Schema
 * literal of exactly these four values. Keeping the set identical means the
 * reference's saved settings remain readable.
 */
export type ColorVisionMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia'

export const COLOR_VISION_MODES: ReadonlyArray<ColorVisionMode> = [
  'off',
  'protanopia',
  'deuteranopia',
  'tritanopia',
]

/**
 * WHERE THE FILTER GOES, and why it is not "everywhere".
 *
 * plan.md §3.13 is specific: 「feColorMatrix ダルトナイゼーション、**canvasのみに
 * 適用**」. The correction is a per-pixel colour transform, and applying it to the
 * whole document also transforms the UI chrome — which was authored with
 * deliberate, already-accessible contrast. The result is a HUD that is harder to
 * read than the one you started with, and text whose contrast ratio no longer
 * meets the standard it was designed to.
 *
 * The reference applied it by flipping a `data-color-vision` attribute on
 * `<body>` and letting a CSS rule scope the SVG filter to the canvas
 * (`packages/presentation/hud/color-vision.ts:1-3`: 「the actual filters (SVG
 * feColorMatrix daltonization) live in index.html; this just flips the body data
 * attribute the CSS rules key on」). Same design here: this module decides the
 * attribute value, the stylesheet decides the scope.
 */
export const COLOR_VISION_FILTER_TARGET = 'canvas' as const

/** The `<body data-color-vision>` value, or `undefined` to remove the attribute. */
export const colorVisionAttribute = (mode: ColorVisionMode): string | undefined =>
  mode === 'off' ? undefined : mode

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

/** What the player chose. `system` defers to the OS preference. */
export type MotionSetting = 'system' | 'full' | 'reduced'

/** What the UI actually does. */
export type MotionPreference = 'full' | 'reduced'

/**
 * Resolve the setting against the OS.
 *
 * `system` is the DEFAULT, and defaulting to it is the load-bearing decision: a
 * motion-sensitive player has already told their operating system, and asking
 * them again — after showing them a screenful of animation — is asking too late.
 * The reference seeds the same default from `prefers-reduced-motion: reduce`
 * (`packages/core/domain/environment-port.ts:10-13`).
 */
export const resolveMotionPreference = (
  setting: MotionSetting,
  systemPrefersReducedMotion: boolean,
): MotionPreference => {
  if (setting === 'system') {
    return systemPrefersReducedMotion ? 'reduced' : 'full'
  }
  return setting
}

/**
 * How long an animation should run.
 *
 * Zero under reduced motion — not "shorter". A 100 ms version of a screen shake
 * is still a screen shake, and the setting exists for people who get motion sick
 * rather than for people who are impatient. Routing every duration through one
 * function is what makes "did we remember?" a question with a single answer.
 */
export const animationDurationMs = (baseMs: number, motion: MotionPreference): number =>
  motion === 'reduced' ? 0 : Math.max(0, baseMs)

/** Whether a purely decorative animation should run at all. */
export const shouldAnimate = (motion: MotionPreference): boolean => motion === 'full'

// ---------------------------------------------------------------------------
// Key remapping
// ---------------------------------------------------------------------------

/**
 * A game action a key can be bound to.
 *
 * PROVISIONAL and short: the authoritative action list belongs with the runtime
 * input service, which plan.md §2.3-2 puts in mc-render. mx-ui owns the SCREEN
 * for rebinding, not the bindings themselves. This type exists so the screen's
 * logic is testable before mc-render is published, and is replaced by
 * mc-render's action type when it is.
 */
export type InputAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'sneak'
  | 'sprint'
  | 'inventory'
  | 'drop'
  | 'chat'

/** `KeyboardEvent.code` values, e.g. `KeyW`, `Space`, `ShiftLeft`. */
export type KeyBindings = ReadonlyMap<InputAction, string>

export type RebindResult =
  | { readonly kind: 'bound'; readonly bindings: KeyBindings }
  | { readonly kind: 'cleared'; readonly bindings: KeyBindings }
  /** The key is already taken. The screen shows which action holds it. */
  | { readonly kind: 'conflict'; readonly heldBy: InputAction }

/**
 * Keys that clear a binding instead of being bound to it.
 *
 * Straight from the reference's rebinding input handler
 * (`packages/presentation/settings/settings-overlay.ts:174-178`): Escape and
 * Backspace both unbind. Escape has to, because a player who opens the rebind
 * field by accident needs a way out that does not bind Escape to "sneak" — and
 * once Escape is bound to sneak, the pause menu is unreachable and the only fix
 * is deleting the save.
 */
export const REBIND_CLEAR_KEYS: ReadonlySet<string> = new Set(['Escape', 'Backspace'])

/**
 * Bind `code` to `action`, or clear it, or report the conflict.
 *
 * Rebinding an action to the key it already has is idempotent rather than a
 * conflict with itself — an easy off-by-one that makes the UI refuse to accept
 * what the player just pressed.
 *
 * Conflicts are REPORTED, never silently resolved. Automatically unbinding the
 * other action is how a player ends up unable to jump and with no idea why.
 */
export const rebind = (
  bindings: KeyBindings,
  action: InputAction,
  code: string,
): RebindResult => {
  if (REBIND_CLEAR_KEYS.has(code)) {
    const cleared = new Map(bindings)
    cleared.delete(action)
    return { kind: 'cleared', bindings: cleared }
  }

  for (const [other, existing] of bindings) {
    if (existing === code && other !== action) {
      return { kind: 'conflict', heldBy: other }
    }
  }

  return { kind: 'bound', bindings: new Map(bindings).set(action, code) }
}

/** Actions with no key bound. The screen must make these visible, not hide them. */
export const unboundActions = (
  bindings: KeyBindings,
  actions: ReadonlyArray<InputAction>,
): ReadonlyArray<InputAction> => actions.filter((action) => !bindings.has(action))
