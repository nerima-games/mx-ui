/**
 * The settings screen's presentation state — projection only.
 *
 * Wave 1 (W1-L3') lowers mc-compose's `apps/web/settings.ts` /
 * `settings-view.ts` monolith. The VALUE RULES (sensitivity/volume ranges,
 * rebind conflict resolution, persistence) do NOT land here: mc-kernel's
 * `settings.ts` does not yet cover this shape (a separate kernel PR), and
 * mc-sim is named for settings STATE elsewhere in `docs/responsibility.md`'s
 * non-scope table — which of the two actually owns it is that PR's question to
 * settle, not this module's. This file and `application/settings-view.ts`
 * carry only the SCREEN half, the same split the responsibility table already
 * draws for every other row ("record is $owner, screen is ui"), and the exact
 * reason `test/screen-views.test.ts`'s header gives for why a settings screen
 * was deliberately absent until now: rebind's central behaviour is a
 * `KeyboardEvent.code`, which needs a listener, and
 * `application/dom-surface.ts` has none (DN-UI-4). This module and its DOM
 * layer never attach one — see `application/settings-view.ts`'s header for
 * what stays with the host instead.
 *
 * The input is a narrow, host-owned snapshot rather than mc-kernel's
 * `Settings` type: kernel's existing shape (renderDistance / fov /
 * graphicsQuality / musicVolume) does not cover compose's fields (sensitivity /
 * bindings / captions), so importing it here would either publish a type this
 * repository does not own or invent one that later disagrees with the kernel
 * PR's actual shape. `SettingsSnapshot` is replaced once that PR lands and
 * publishes.
 */
import type { InputAction, KeyBindings } from './accessibility.js'

const ZERO_PERCENT = 0
const PERCENT_SCALE = 100

/**
 * Defensive formatting only, not policy: guards NaN/Infinity/negative inputs
 * so a stale or malformed host snapshot cannot crash a render. The actual
 * range a value is allowed to hold (0-1 for a volume, 0.1-3 for sensitivity)
 * is the kernel PR's normalisation, not this repository's.
 */
const percentOf = (unit: number): number => {
  if (!Number.isFinite(unit)) {
    return ZERO_PERCENT
  }
  return Math.max(ZERO_PERCENT, Math.round(unit * PERCENT_SCALE))
}

/**
 * The actions the rebinding rows list.
 *
 * Mirrors `apps/preview-screens/state.ts`'s `PREVIEW_ACTIONS` order — both
 * read `domain/accessibility.ts`'s `InputAction`, which that module's own
 * header calls PROVISIONAL until mc-render's input service publishes. Two
 * lists rather than one shared export because `apps/` is not published API
 * and cannot be imported from `src/`.
 */
export const SETTINGS_BINDABLE_ACTIONS: ReadonlyArray<InputAction> = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'jump',
  'sneak',
  'sprint',
  'inventory',
  'drop',
  'chat',
]

/** A host-owned snapshot of the settings this screen shows. Not mc-kernel's `Settings` — see header. */
export type SettingsSnapshot = {
  readonly sensitivity: number
  readonly masterVolume: number
  readonly sfxVolume: number
  readonly audioEnabled: boolean
  readonly captionsEnabled: boolean
  readonly bindings: KeyBindings
}

export type SettingsFieldView = {
  readonly percent: number
  readonly label: string
}

/** No label here — labels are English display strings, and belong with the DOM layer (`application/settings-view.ts`'s `ACTION_LABEL`), matching where `anvil-view.ts` keeps `SLOT_LABEL`. */
export type SettingsBindingRow = {
  readonly action: InputAction
  readonly code: string | undefined
}

export type SettingsViewModel = {
  readonly sensitivity: SettingsFieldView
  readonly masterVolume: SettingsFieldView
  readonly sfxVolume: SettingsFieldView
  readonly audioEnabled: boolean
  readonly captionsEnabled: boolean
  readonly bindingRows: ReadonlyArray<SettingsBindingRow>
}

const fieldView = (unit: number): SettingsFieldView => {
  const percent = percentOf(unit)
  return Object.freeze({ label: `${String(percent)}%`, percent })
}

const bindingRow = (action: InputAction, bindings: KeyBindings): SettingsBindingRow =>
  Object.freeze({ action, code: bindings.get(action) })

/** Purely derives the immutable presentation state for the settings screen. */
export const settingsViewModel = (snapshot: SettingsSnapshot): SettingsViewModel =>
  Object.freeze({
    audioEnabled: snapshot.audioEnabled,
    bindingRows: Object.freeze(
      SETTINGS_BINDABLE_ACTIONS.map((action) => bindingRow(action, snapshot.bindings)),
    ),
    captionsEnabled: snapshot.captionsEnabled,
    masterVolume: fieldView(snapshot.masterVolume),
    sensitivity: fieldView(snapshot.sensitivity),
    sfxVolume: fieldView(snapshot.sfxVolume),
  })
