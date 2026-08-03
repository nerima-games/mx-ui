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
// The correction itself
// ---------------------------------------------------------------------------

/*
 * THE CORRECTION ITSELF, and why it lives here rather than in an `index.html`.
 *
 * The reference keeps the switch in `packages/presentation/hud/color-vision.ts`
 * and the three `feColorMatrix` matrices in `index.html:445-460`. Carrying over
 * only the switch — which is what this module did until now — carries over the
 * half that does nothing on its own: `data-color-vision="protanopia"` is a
 * hook, and a hook with no matrix behind it corrects no colours. plan.md §3.13
 * asks for the asset to be 「引き継ぐ」, and half an asset is not carried over.
 *
 * They belong in mx-ui, and specifically in `domain/`:
 *
 *   - **This repository owns accessibility.** plan.md §3.13 lists the colour
 *     vision mode among mx-ui's four assets. mc-render owns the canvas the
 *     filter is scoped to, but it does not own the accessibility setting, and
 *     nothing else in the sixteen repositories does either. Left out, these
 *     numbers have no owner and get re-derived — differently — by whoever
 *     writes the first stylesheet.
 *   - **They are arithmetic, so they are testable here.** A matrix is twenty
 *     numbers and a matrix-vector product; `applyColorVisionMatrix` runs under
 *     `environment: 'node'` like every other derivation in this directory. The
 *     reference could not test them at all — they were markup.
 *
 * The split with the DOM layer is unchanged and is the one DN-UI-1a describes:
 * this module decides the VALUES, the stylesheet decides the SCOPE
 * (`COLOR_VISION_FILTER_TARGET`).
 *
 * ---------------------------------------------------------------------------
 * What the numbers are
 * ---------------------------------------------------------------------------
 *
 * Daltonisation, `C = I + E·(I − S)`: `S` simulates the deficiency and `E`
 * redistributes the lost channel onto the intact ones (reference comment,
 * `index.html:445-449`). These are NOT simulation matrices — a simulation shows
 * what a player sees, a correction changes what is drawn so they can tell it
 * apart. Copying one in place of the other produces a HUD that is wrong in
 * precisely the way the setting exists to fix.
 *
 * Every row sums to 1, so greys and whites pass through unchanged. That is the
 * property that keeps the correction from tinting the whole scene, and it is
 * exact rather than approximate, so it is checkable.
 */

/**
 * sRGB, not the SVG default.
 *
 * `<filter color-interpolation-filters="sRGB">`. The SVG default is linearRGB,
 * and these matrices are derived in sRGB — applying them in linear space
 * over-brightens midtones (reference comment, `index.html:448-450`). The
 * attribute is one word and is the difference between a correction and a
 * washed-out scene, so it is carried over as a named constant rather than left
 * for the stylesheet to remember.
 */
export const COLOR_VISION_FILTER_COLOR_SPACE = 'sRGB' as const

/** sRGB channels in 0–1, the units `feColorMatrix` operates in. */
export type RgbChannels = readonly [number, number, number]

/**
 * A 4×5 `feColorMatrix`, row-major — the twenty numbers of the `values`
 * attribute, in the order the attribute wants them. Rows are R, G, B, A; the
 * fifth column of each row is a constant offset in intensity units.
 */
export type ColorVisionMatrix = readonly [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
]

/** `index.html:451-453`. */
const PROTANOPIA_CORRECTION: ColorVisionMatrix = [
  1, 0, 0, 0, 0,
  -0.2549, 1.2549, 0, 0, 0,
  0.3031, -0.5451, 1.242, 0, 0,
  0, 0, 0, 1, 0,
]

/** `index.html:454-456`. */
const DEUTERANOPIA_CORRECTION: ColorVisionMatrix = [
  1, 0, 0, 0, 0,
  -0.4375, 1.4375, 0, 0, 0,
  0.2625, -0.5625, 1.3, 0, 0,
  0, 0, 0, 1, 0,
]

/** `index.html:457-459`. */
const TRITANOPIA_CORRECTION: ColorVisionMatrix = [
  1, 0, 0, 0, 0,
  0.035, 1.532, -0.567, 0, 0,
  0.035, -0.51, 1.475, 0, 0,
  0, 0, 0, 1, 0,
]

/**
 * The matrix for a mode, or `undefined` for `off`.
 *
 * `off` returns `undefined` for the same reason `colorVisionAttribute` does:
 * there is no identity filter to install, there is no filter. The two functions
 * agree on `off` by construction, and a DOM layer that removes the attribute
 * and leaves a filter behind — or the reverse — is the bug this shape prevents.
 */
export const colorVisionMatrix = (mode: ColorVisionMode): ColorVisionMatrix | undefined => {
  if (mode === 'protanopia') {
    return PROTANOPIA_CORRECTION
  }
  if (mode === 'deuteranopia') {
    return DEUTERANOPIA_CORRECTION
  }
  if (mode === 'tritanopia') {
    return TRITANOPIA_CORRECTION
  }
  return undefined
}

/** The `<feColorMatrix values>` string, ready for the DOM layer. */
export const colorVisionMatrixValues = (mode: ColorVisionMode): string | undefined =>
  colorVisionMatrix(mode)?.join(' ')

/**
 * Apply a correction to one colour.
 *
 * Channels in and out are 0–1 sRGB, which is what `feColorMatrix` operates on;
 * the result is clamped to that range because a correction that redistributes a
 * channel can push a saturated colour past the ends, and the GPU clamps too.
 *
 * This exists so the arithmetic is a tested thing rather than twenty numbers
 * nobody has ever multiplied. It is not on the rendering path — the browser
 * runs the filter — but a matrix whose rows have stopped summing to 1, or whose
 * signs got transcribed wrong, is invisible until somebody looks at the scene.
 */
export const applyColorVisionMatrix = (
  channels: RgbChannels,
  matrix: ColorVisionMatrix,
): RgbChannels => {
  // ROWS TAKEN APART BY LITERAL INDEX, not by `row * 5`.
  //
  // Both spellings read the same twenty numbers. The arithmetic one needed five
  // `?? 0` arms, because `noUncheckedIndexedAccess` types `matrix[base + 2]`
  // as `number | undefined` however `base` was computed — and none of those five
  // arms can run, because `ColorVisionMatrix` is a twenty-element TUPLE and the
  // only callers pass 0, 1 and 2. Five uncoverable branches in a nine-line
  // function, all guarding against a shape the type forbids.
  //
  // A literal index into a tuple is `number`, so taking the rows apart deletes
  // all five. It also makes the row structure visible: `feColorMatrix` is 4x5
  // row-major and the fifth column is a constant offset, which the header says
  // and which `base + 4` did not show.
  const [r0, r1, r2, r3, r4, g0, g1, g2, g3, g4, b0, b1, b2, b3, b4] = matrix

  const channel = (
    red: number,
    green: number,
    blue: number,
    // The alpha column: opaque, and the constant offset that follows it.
    alpha: number,
    offset: number,
  ): number =>
    Math.min(
      1,
      Math.max(0, red * channels[0] + green * channels[1] + blue * channels[2] + alpha + offset),
    )

  return [
    channel(r0, r1, r2, r3, r4),
    channel(g0, g1, g2, g3, g4),
    channel(b0, b1, b2, b3, b4),
  ]
}

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
