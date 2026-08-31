import { describe, expect, it } from 'vitest'
import type { InputAction } from '../src/domain/accessibility'
import { createSettingsView } from '../src/application/settings-view'
import { settingsViewModel, type SettingsSnapshot } from '../src/domain/settings-view-model'
import { type FakeElement, fakeDocument } from './fake-dom'

const SNAPSHOT: SettingsSnapshot = {
  audioEnabled: true,
  bindings: new Map<InputAction, string>([['moveForward', 'KeyW']]),
  captionsEnabled: false,
  masterVolume: 0.8,
  sensitivity: 1,
  sfxVolume: 1,
}

describe('createSettingsView', () => {
  it('projects volumes, toggles, and every binding row as DOM attributes and text', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const root = view.root as FakeElement
    view.render(settingsViewModel(SNAPSHOT))

    expect(root.find('data-settings-field', 'sensitivity')?.value).toBe('100')
    expect(root.find('data-settings-field-output', 'sensitivity')?.textContent).toBe('100%')
    expect(root.find('data-settings-field', 'master-volume')?.value).toBe('80')
    expect(root.find('data-settings-field-output', 'master-volume')?.textContent).toBe('80%')
    expect(root.find('data-settings-field', 'sfx-volume')?.value).toBe('100')

    expect(root.find('data-settings-field', 'audio-enabled')?.attributes.get('aria-checked')).toBe('true')
    expect(root.find('data-settings-field', 'captions-enabled')?.attributes.get('aria-checked')).toBe('false')

    const bindingButtons = root.findAll('data-interaction-target', 'settings-binding')
    expect(bindingButtons).toHaveLength(10)
    expect(root.find('data-binding-action', 'moveForward')?.textContent).toBe('KeyW')
    expect(root.find('data-binding-action', 'sneak')?.textContent).toBe('Unbound')
    expect(root.find('data-binding-action', 'moveForward')?.attributes.get('aria-label')).toBe(
      'Change Move forward key',
    )
  })

  it('re-renders without redundant writes when the model is unchanged', () => {
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const model = settingsViewModel(SNAPSHOT)
    view.render(model)

    const before = factory.mark()
    view.render(model)

    expect(factory.since(before)).toStrictEqual([])
  })

  it('SECOND ANGLE — REGRESSION: attaches no event listener anywhere in its tree (DN-UI-4)', () => {
    // The same invariant `application/anvil-view.ts` and
    // `application/hud-view.ts` pin: a settings screen is exactly the case
    // `test/screen-views.test.ts`'s header argues rebind cannot reach this
    // repository without a listener, so this view must never grow one, even
    // by accident through a future edit. `test/fake-dom.ts` implements
    // `addEventListener` even though `application/dom-surface.ts` does not
    // declare it, so this observes the renderer, not the fake's capability.
    const factory = fakeDocument()
    const host = factory.createElement('main')
    const view = createSettingsView(factory, host)
    const root = view.root as FakeElement

    view.render(settingsViewModel(SNAPSHOT))
    view.render(settingsViewModel({ ...SNAPSHOT, audioEnabled: false }))

    expect(root.listenersInTree()).toStrictEqual([])
  })
})
