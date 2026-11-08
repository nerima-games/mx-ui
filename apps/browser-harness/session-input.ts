import { InputAction as inputAction, KeyCode } from '@nerima-games/mc-kernel/domain/settings'
import type { FocusNavigationDirection } from '@nerima-games/mc-render'
import { DEFAULT_SETTINGS, makeSettingsService } from '@nerima-games/mc-sim'
import { Result, type Effect } from 'effect'
import {
  createSettingsView,
  rebindSettingsKey,
  type SettingsKeyInputPolicy,
} from '../../src/application/settings-view.js'
import type { InventoryAction, InventoryDragTarget } from '../../src/application/inventory-actions.js'
import type { UiMount } from '../../src/application/ui-mount.js'
import { settingsViewModel, type SettingsViewModel } from '../../src/domain/settings-view-model.js'

const REMAPPABLE_ACTIONS = ['jump', 'sneak'] as const
type RemappableAction = (typeof REMAPPABLE_ACTIONS)[number]

const DEFAULT_BINDINGS: Readonly<Record<RemappableAction, KeyCode>> = {
  jump: KeyCode('Space'),
  sneak: KeyCode('ShiftLeft'),
}

const KEY_INPUT_POLICY: SettingsKeyInputPolicy<RemappableAction> = {
  bindableActions: REMAPPABLE_ACTIONS,
  validateKeyCode: (_action, code) => {
    if (code === 'Escape') {
      return 'escape-is-not-bindable'
    }
    if (code === 'Tab') {
      return 'key-reserved-by-user-agent'
    }
    return undefined
  },
}

const GAMEPAD_EVENT = 'mx-ui:session-gamepad'
const INVENTORY_SELECTOR = '[data-mx-ui="inventory"]'
const SLOT_SELECTOR = '[data-mx-ui="slot"]'
const HUD_SLOT_SELECTOR = '[data-mx-ui="hud"] [data-mx-ui="slot"]'
const BINDING_SELECTOR = '[data-interaction-target="settings-binding"]'
const FOCUS_DIRECTION_BY_CODE: Readonly<Record<string, FocusNavigationDirection>> = {
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
}

const isEditableKeyboardTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null

type GamepadIntent =
  | { readonly kind: 'navigate'; readonly direction: 'down' | 'left' | 'right' | 'up' }
  | { readonly kind: 'activate' }

const decodeGamepadIntent = (detail: unknown): GamepadIntent | undefined => {
  try {
    if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
      return undefined
    }
    const keys = Reflect.ownKeys(detail)
    if (keys.length === 1 && keys[0] === 'kind') {
      const kind: unknown = Reflect.get(detail, 'kind')
      return kind === 'activate' ? { kind: 'activate' } : undefined
    }
    if (keys.length !== 2 || !keys.includes('kind') || !keys.includes('direction')) {
      return undefined
    }
    const kind: unknown = Reflect.get(detail, 'kind')
    if (kind !== 'navigate') {
      return undefined
    }
    const direction: unknown = Reflect.get(detail, 'direction')
    if (
      direction !== 'up' &&
      direction !== 'down' &&
      direction !== 'left' &&
      direction !== 'right'
    ) {
      return undefined
    }
    return { direction, kind: 'navigate' }
  } catch {
    return undefined
  }
}

type SessionInputOptions = {
  readonly actionOutput: HTMLElement
  readonly remapRoot: HTMLElement
  readonly remapStatus: HTMLElement
  readonly root: HTMLElement
  readonly runPromise: <Success, Failure>(
    effect: Effect.Effect<Success, Failure, never>,
  ) => Promise<Success>
}

export type SessionInput = {
  readonly connect: (runtime: UiMount) => void
  readonly dispose: () => void
  readonly onInventoryAction: (action: InventoryAction) => void
}

const actionFromElement = (target: EventTarget | null): RemappableAction | undefined => {
  if (!(target instanceof Element)) {
    return undefined
  }
  const action = target.closest<HTMLElement>(BINDING_SELECTOR)?.dataset['bindingAction']
  return action === 'jump' || action === 'sneak' ? action : undefined
}

const inventoryDragTarget = (target: EventTarget | null): InventoryDragTarget | undefined => {
  if (!(target instanceof Element)) {
    return undefined
  }
  const slot = target.closest<HTMLElement>(`${INVENTORY_SELECTOR} ${SLOT_SELECTOR}`)
  const region = slot?.closest<HTMLElement>('[data-region]')?.dataset['region']
  const index = Number(slot?.dataset['slotIndex'])
  if (!Number.isInteger(index) || index < 0 || (region !== 'hotbar' && region !== 'main')) {
    return undefined
  }
  return { index, kind: 'slot', region }
}

const sameSlot = (left: InventoryDragTarget, right: InventoryDragTarget): boolean =>
  left.kind === 'slot' &&
  right.kind === 'slot' &&
  left.region === right.region &&
  left.index === right.index

const hudSlot = (target: EventTarget | null): HTMLElement | undefined => {
  if (!(target instanceof Element)) {
    return undefined
  }
  const slot = target.closest<HTMLElement>(HUD_SLOT_SELECTOR)
  return slot ?? undefined
}

const slotIndex = (slot: HTMLElement): number | undefined => {
  const index = Number(slot.dataset['slotIndex'])
  return Number.isInteger(index) && index >= 0 ? index : undefined
}

const formatAction = (action: InventoryAction): string => JSON.stringify(action)

const renderSettings = (
  view: ReturnType<typeof createSettingsView>,
  model: Result.Result<SettingsViewModel<RemappableAction>, { readonly _tag: 'InvalidSettingsSnapshot' }>,
): void => {
  if (!Result.isSuccess(model)) {
    throw new Error('Expected the session settings snapshot to be valid')
  }
  view.render(model.success)
}

export const createSessionInput = async (options: SessionInputOptions): Promise<SessionInput> => {
  const settingsService = await options.runPromise(makeSettingsService(DEFAULT_SETTINGS))
  await options.runPromise(settingsService.rebindKey(inputAction('jump'), DEFAULT_BINDINGS.jump))
  await options.runPromise(settingsService.rebindKey(inputAction('sneak'), DEFAULT_BINDINGS.sneak))

  const settingsView = createSettingsView(document, options.remapRoot)
  const renderBindings = async (): Promise<void> => {
    const snapshot = await options.runPromise(settingsService.snapshot)
    renderSettings(
      settingsView,
      settingsViewModel(snapshot, DEFAULT_BINDINGS, REMAPPABLE_ACTIONS),
    )
  }
  await renderBindings()

  let runtime: UiMount | undefined = undefined
  let pendingAction: RemappableAction | undefined = undefined
  let dragSource: InventoryDragTarget | undefined = undefined

  const setRemapStatus = (state: string, text: string): void => {
    options.remapStatus.dataset['remapStatus'] = state
    options.remapStatus.textContent = text
  }

  const onRemapClick = (event: MouseEvent): void => {
    const action = actionFromElement(event.target)
    if (action === undefined) {
      return
    }
    pendingAction = action
    setRemapStatus('waiting', `Press a key for ${action}`)
  }

  const onRemapFocusOut = (event: FocusEvent): void => {
    if (actionFromElement(event.target) === undefined) {
      return
    }
    if (actionFromElement(event.relatedTarget) === undefined) {
      pendingAction = undefined
      setRemapStatus('idle', 'Key capture cancelled')
    }
  }

  const onRemapKeyDown = (event: KeyboardEvent): void => {
    if (pendingAction === undefined || event.repeat) {
      return
    }
    if (actionFromElement(document.activeElement) !== pendingAction) {
      pendingAction = undefined
      setRemapStatus('idle', 'Key capture cancelled')
      return
    }

    const action = pendingAction
    pendingAction = undefined
    event.preventDefault()
    event.stopImmediatePropagation()
    setRemapStatus('saving', `Assigning ${event.code}`)
    options.runPromise(
      rebindSettingsKey(settingsService, {
        action,
        code: event.code,
        inputPolicy: KEY_INPUT_POLICY,
      }),
    )
      .then(renderBindings)
      .then(() => setRemapStatus('ready', `Assigned ${event.code} to ${action}`))
      .catch((error: unknown) => {
        setRemapStatus('error', 'Key assignment failed')
        options.remapStatus.dataset['remapError'] =
          error instanceof Error ? error.message : 'Settings remap failed'
      })
  }

  const onInventoryAction = (action: InventoryAction): void => {
    options.actionOutput.dataset['sessionAction'] = action.kind
    options.actionOutput.textContent = formatAction(action)
  }

  const onPointerDown = (event: PointerEvent): void => {
    const source = inventoryDragTarget(event.target)
    if (source !== undefined) {
      dragSource = source
      return
    }

    const slot = hudSlot(event.target)
    const index = slot === undefined ? undefined : slotIndex(slot)
    if (slot !== undefined && index !== undefined) {
      runtime?.current()?.hud.setKeyboardFocus(index)
      slot.focus()
    }
  }

  const onPointerUp = (event: PointerEvent): void => {
    const source = dragSource
    dragSource = undefined
    if (source === undefined) {
      return
    }

    const destination =
      inventoryDragTarget(document.elementFromPoint(event.clientX, event.clientY)) ??
      inventoryDragTarget(event.target)
    if (destination !== undefined && !sameSlot(source, destination)) {
      runtime?.dragInventorySlot(source, destination)
    }
  }

  const onDoubleClick = (event: MouseEvent): void => {
    const target = inventoryDragTarget(event.target)
    if (target === undefined) {
      return
    }

    const focused = options.root.querySelector<HTMLElement>(
      `${INVENTORY_SELECTOR} ${SLOT_SELECTOR}[tabindex="0"]`,
    )
    const focusedTarget = inventoryDragTarget(focused)
    if (focusedTarget !== undefined && sameSlot(target, focusedTarget)) {
      runtime?.activateInventoryFocus('click')
      return
    }
    onInventoryAction({ kind: 'click', target })
  }

  const onFocusIn = (event: FocusEvent): void => {
    const slot = hudSlot(event.target)
    const index = slot === undefined ? undefined : slotIndex(slot)
    if (index !== undefined) {
      runtime?.current()?.hud.setKeyboardFocus(index)
    }
  }

  const onFocusOut = (event: FocusEvent): void => {
    const slot = hudSlot(event.target)
    if (slot === undefined) {
      return
    }
    const next = event.relatedTarget
    if (!(next instanceof Element) || next.closest('[data-mx-ui="hud"]') === null) {
      runtime?.current()?.hud.setKeyboardFocus()
    }
  }

  const onGamepadIntent = (event: Event): void => {
    if (!(event instanceof CustomEvent)) {
      return
    }
    const intent = decodeGamepadIntent(event.detail)
    if (intent === undefined) {
      return
    }
    if (intent.kind === 'navigate') {
      runtime?.moveInventoryFocus(intent.direction)
    } else {
      runtime?.activateInventoryFocus('click')
    }
  }

  const onFocusNavigationDirection = (event: KeyboardEvent): void => {
    if (isEditableKeyboardTarget(event.target)) {
      return
    }
    const direction = FOCUS_DIRECTION_BY_CODE[event.code]
    if (typeof direction !== 'undefined') {
      runtime?.moveFocus(direction)
    }
  }

  options.remapRoot.addEventListener('click', onRemapClick)
  options.remapRoot.addEventListener('focusout', onRemapFocusOut)
  document.addEventListener('keydown', onRemapKeyDown, true)

  return {
    connect: (nextRuntime) => {
      runtime = nextRuntime
      document.addEventListener('keydown', onFocusNavigationDirection)
      options.root.addEventListener('pointerdown', onPointerDown)
      options.root.addEventListener('pointerup', onPointerUp)
      options.root.addEventListener('dblclick', onDoubleClick)
      options.root.addEventListener('focusin', onFocusIn)
      options.root.addEventListener('focusout', onFocusOut)
      window.addEventListener(GAMEPAD_EVENT, onGamepadIntent)
    },
    dispose: () => {
      options.remapRoot.removeEventListener('click', onRemapClick)
      options.remapRoot.removeEventListener('focusout', onRemapFocusOut)
      document.removeEventListener('keydown', onRemapKeyDown, true)
      document.removeEventListener('keydown', onFocusNavigationDirection)
      options.root.removeEventListener('pointerdown', onPointerDown)
      options.root.removeEventListener('pointerup', onPointerUp)
      options.root.removeEventListener('dblclick', onDoubleClick)
      options.root.removeEventListener('focusin', onFocusIn)
      options.root.removeEventListener('focusout', onFocusOut)
      window.removeEventListener(GAMEPAD_EVENT, onGamepadIntent)
      runtime = undefined
    },
    onInventoryAction,
  }
}
